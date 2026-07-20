'use strict';
const salesBotService = require('../services/salesBotService');
const inboxService    = require('../services/inboxService');
const db              = require('../db');

// ── Helpers ──────────────────────────────────────────────────────────

async function getSettings(keys) {
  const r = await db.query(
    `SELECT key, value FROM system_settings WHERE key = ANY($1)`, [keys]
  );
  const s = {};
  r.rows.forEach(row => { s[row.key] = row.value; });
  return s;
}

async function isWorkingHours(s) {
  const now = new Date();
  const bkk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const day  = bkk.getDay();
  const hhmm = `${String(bkk.getHours()).padStart(2,'0')}:${String(bkk.getMinutes()).padStart(2,'0')}`;
  const workDays = (s.work_days || '1,2,3,4,5').split(',').map(Number);
  return workDays.includes(day) && hhmm >= (s.work_start || '08:00') && hhmm < (s.work_end || '18:00');
}

async function findKeywordRule(text) {
  try {
    const r = await db.query(
      `SELECT * FROM keyword_rules WHERE is_active = TRUE ORDER BY priority DESC, created_at ASC`
    );
    const lower = text.toLowerCase();
    for (const rule of r.rows) {
      const kw = rule.keyword.toLowerCase();
      if (rule.match_type === 'exact'    && lower === kw)       return rule;
      if (rule.match_type === 'contains' && lower.includes(kw)) return rule;
    }
  } catch (_) { /* keyword_rules table may not exist yet */ }
  return null;
}

async function oohAlreadySentToday(convId) {
  const r = await db.query(`
    SELECT id FROM inbox_messages
    WHERE conversation_id = $1
      AND direction = 'out'
      AND content LIKE '🕐 นอกเวลาทำการ%'
      AND created_at >= CURRENT_DATE
    LIMIT 1
  `, [convId]);
  return r.rows.length > 0;
}


/**
 * handleFollow — ผู้ติดตามใหม่ → ส่ง Welcome Flex + สร้าง conversation ใน inbox
 */
async function handleFollow(event, client) {
  try {
    const lineUserId = event.source?.userId;
    const displayName = lineUserId
      ? (await client.getProfile(lineUserId).catch(() => null))?.displayName || 'ลูกค้า'
      : 'ลูกค้า';

    // สร้าง/อัปเดต conversation ใน inbox
    if (lineUserId) {
      inboxService.getOrCreateConversation('line', lineUserId, displayName, null)
        .catch(e => console.error('[handler] inbox follow:', e.message));
    }

    const welcomeFlex = salesBotService.buildWelcomeFlex(displayName);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [welcomeFlex],
    });
  } catch (e) {
    console.error('[handler] handleFollow error:', e.message);
  }
}

/**
 * handleText — รับข้อความ LINE → บันทึก inbox → bot หรือ human mode
 */
async function handleText(event, client) {
  try {
    const lineUserId = event.source?.userId;
    const text       = event.message?.text?.trim();
    if (!lineUserId || !text) return;

    // ── คำสั่งพิเศษ: ดู LINE User ID ─────────────────────────────
    if (text === '!myid' || text === '/myid') {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: `🆔 LINE User ID ของคุณคือ:\n\n${lineUserId}\n\nนำไปกรอกในหน้า Settings → ผูก LINE ID พนักงาน เพื่อรับแจ้งเตือน Lead ใหม่ครับ`,
        }],
      });
      return;
    }

    const displayName = (await client.getProfile(lineUserId).catch(() => null))?.displayName || 'ลูกค้า';

    // ── สร้าง/อัปเดต conversation ใน Unified Inbox ───────────────
    let conv;
    try {
      conv = await inboxService.getOrCreateConversation('line', lineUserId, displayName, null);
      await inboxService.saveMessage(conv.id, 'in', 'customer', text, displayName);
    } catch (e) {
      console.error('[handler] inbox save customer msg:', e.message);
    }

    // ── Human mode: bot หยุดตอบ พนักงานรับช่วงต่อ ────────────────
    if (conv?.mode === 'human') {
      console.log(`[handler] human mode — no bot reply for ${lineUserId}`);
      // ไม่ต้อง replyToken แต่ replyToken ใช้แล้วก็จะหมดอายุเอง
      return;
    }

    // ── Resolved: ไม่ต้องตอบ ─────────────────────────────────────
    if (conv?.mode === 'resolved') {
      return;
    }

    // ── Keyword Rules ──────────────────────────────────────────────
    const kwRule = await findKeywordRule(text);
    if (kwRule) {
      const reply = kwRule.response;
      if (conv) {
        inboxService.saveMessage(conv.id, 'out', 'bot', reply, 'Keyword Bot')
          .catch(e => console.error('[handler] keyword save:', e.message));
      }
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: reply }],
      });
      return;
    }

    // ── Out-of-hours Auto Reply ────────────────────────────────────
    try {
      const s = await getSettings(['work_start','work_end','work_days','ooh_enabled','ooh_message']);
      if (s.ooh_enabled === 'true') {
        const inHours = await isWorkingHours(s);
        if (!inHours && conv) {
          const alreadySent = await oohAlreadySentToday(conv.id);
          if (!alreadySent) {
            const oohText = '🕐 นอกเวลาทำการ\n' + (s.ooh_message || 'ทีมงานจะติดต่อกลับในเวลาทำการครับ');
            await inboxService.saveMessage(conv.id, 'out', 'bot', oohText, 'ระบบ OOH')
              .catch(e => console.error('[handler] OOH save:', e.message));
            await client.replyMessage({
              replyToken: event.replyToken,
              messages: [{ type: 'text', text: oohText }],
            });
          }
          return;
        }
      }
    } catch (e) {
      console.error('[handler] OOH check:', e.message);
    }

    // ── Bot mode: AI ตอบ ──────────────────────────────────────────
    const reply = await salesBotService.handleMessage(lineUserId, displayName, text);

    if (conv) {
      inboxService.saveMessage(conv.id, 'out', 'bot', reply, 'น้องต่อกัน 🐾')
        .catch(e => console.error('[handler] inbox save bot msg:', e.message));
    }

    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: reply }],
    });
  } catch (e) {
    console.error('[handler] handleText error:', e.message);
  }
}

// ── handleImage ──────────────────────────────────────────────────────
async function handleImage(event, client) {
  try {
    const lineUserId = event.source?.userId;
    if (!lineUserId) return;

    const displayName = (await client.getProfile(lineUserId).catch(() => null))?.displayName || 'ลูกค้า';
    let conv;
    try {
      conv = await inboxService.getOrCreateConversation('line', lineUserId, displayName, null);
    } catch (e) {
      console.error('[handler] image getOrCreate:', e.message);
    }
    if (!conv) return;

    // LINE image URL — requires LINE_CHANNEL_ACCESS_TOKEN to fetch the actual bytes
    // We store the API URL; staff UI will display it (token-authenticated proxy not needed for preview)
    const messageId  = event.message?.id;
    const contentUrl = messageId
      ? `https://api-data.line.me/v2/bot/message/${messageId}/content`
      : '[รูปภาพ]';

    await inboxService.saveMessage(conv.id, 'in', 'customer', contentUrl, displayName, 'image')
      .catch(e => console.error('[handler] save image:', e.message));

    console.log(`[handler] image from ${lineUserId} saved (msg#${messageId})`);
  } catch (e) {
    console.error('[handler] handleImage error:', e.message);
  }
}

/**
 * dispatch — router หลักสำหรับ LINE events
 */
async function dispatch(event, client) {
  switch (event.type) {
    case 'follow':  return handleFollow(event, client);
    case 'message':
      if (event.message?.type === 'text')  return handleText(event, client);
      if (event.message?.type === 'image') return handleImage(event, client);
      break;
    case 'unfollow':
      console.log('[handler] unfollow:', event.source?.userId);
      break;
    default:
      break;
  }
}

module.exports = { dispatch, findKeywordRule };
