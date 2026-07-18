'use strict';
const salesBotService = require('../services/salesBotService');
const inboxService    = require('../services/inboxService');

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

    // ── Bot mode: ให้ AI ตอบ ──────────────────────────────────────
    const reply = await salesBotService.handleMessage(lineUserId, displayName, text);

    // บันทึกคำตอบ bot ลง inbox (background)
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

/**
 * dispatch — router หลักสำหรับ LINE events
 */
async function dispatch(event, client) {
  switch (event.type) {
    case 'follow':  return handleFollow(event, client);
    case 'message':
      if (event.message?.type === 'text') return handleText(event, client);
      break;
    case 'unfollow':
      console.log('[handler] unfollow:', event.source?.userId);
      break;
    default:
      break;
  }
}

module.exports = { dispatch };
