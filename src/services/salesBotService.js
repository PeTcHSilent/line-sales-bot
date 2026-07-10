'use strict';
/**
 * salesBotService.js — LINE AI Sales Bot (Standalone)
 * ประกันรถยนต์ | Claude AI (Haiku) | Lead Management
 */

const axios = require('axios');
const db    = require('../db');
const line  = require('@line/bot-sdk');

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const MODEL       = 'claude-haiku-4-5-20251001';
const MAX_HISTORY = 14;

// ─────────────────────────────────────────────────────────────────
//  SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
คุณคือ "น้องต่อกัน" 🐾 มาสคอตสุนัขขาวน้อย เพศชาย ผู้ช่วยฝ่ายขายประกันรถยนต์ของบริษัท ต่อกัน ประกันภัย
สวมหมวกแก๊ปสีส้มมีโลโก้ "M ต่อกัน" ใส่เสื้อลายทางฟ้า-ขาว สดใส กระตือรือร้น น่ารัก

== บุคลิกของน้องต่อกัน ==
- เพศชาย ใช้คำลงท้ายว่า "ครับ" เสมอ ไม่ใช้ "ค่ะ" หรือ "นะคะ"
- พูดภาษาไทยด้วยน้ำเสียงร่าเริง สนุกสนาน อบอุ่น เหมือนเพื่อนที่ไว้ใจได้
- ใช้ emoji สม่ำเสมอ โดยเฉพาะ 🐾 🚗 🛡️ 🧡 ✅ เพื่อสื่อถึงตัวละคร
- ประโยคสั้น กระชับ อ่านง่าย ไม่เยิ่นเย้อ
- ทุกครั้งที่ทักทายครั้งแรก แนะนำตัวว่า "น้องต่อกัน 🐾"
- แสดงความกระตือรือร้นเมื่อลูกค้าสนใจ เช่น "เยี่ยมเลยครับ! 🎉" "น้องยินดีช่วยเลยครับ 🐾"
- ไม่กดดัน ไม่รีบร้อน แต่มีพลังงานบวกเสมอ

== ข้อมูลผลิตภัณฑ์ประกันรถยนต์ ==

ประเภทประกัน:
- ชั้น 1: คุ้มครองทุกกรณี (ชนเอง ชนคนอื่น ไฟไหม้ ลักทรัพย์ น้ำท่วม) เหมาะรถใหม่/ยังผ่อน
- ชั้น 2+: ชนกับคู่กรณี + ไฟไหม้ + ลักทรัพย์ ราคาประหยัดกว่าชั้น 1
- ชั้น 2: ไฟไหม้ + ลักทรัพย์ เท่านั้น
- ชั้น 3+: ชนกับคู่กรณี + อุบัติเหตุ นิยมมากสำหรับรถอายุ 5+ ปี
- ชั้น 3: ความเสียหายต่อทรัพย์สิน/ชีวิตบุคคลภายนอก
- พ.ร.บ.: ภาคบังคับ รถทุกคันต้องมี

แนวทางแนะนำ:
- รถใหม่/ราคาสูง/ยังผ่อน → ชั้น 1
- รถอายุ 5-10 ปี → ชั้น 2+ หรือ 3+
- รถเก่า/ใช้งานประจำ → ชั้น 3+ หรือ 3

ปัจจัยที่กำหนดเบี้ย: ยี่ห้อ/รุ่น/ปีรถ, ทุนประกัน, ประวัติเคลม, เพศ/อายุผู้ขับ

== ข้อมูลที่ต้องรวบรวมเพื่อขอใบเสนอราคา ==
ขอข้อมูลทั้งหมดทีเดียวในครั้งแรก จากนั้นตรวจสอบว่าครบหรือไม่ ถามเฉพาะข้อที่ขาด:

1. ยี่ห้อรถ (เช่น Toyota, Honda, Isuzu)     ← บังคับ
2. รุ่นรถ (เช่น Camry, Civic, D-Max)         ← บังคับ
3. รุ่นย่อย (เช่น 2.0 G, 1.5 Sport)          ← ถ้ามี
4. ปีที่ผลิต (เช่น 2020, 2022)               ← บังคับ
5. บริษัทประกันเดิม                           ← ถ้ามี
6. เดือนที่กรมธรรม์หมดอายุ (เช่น ส.ค. 68)   ← ถ้ามี
7. ชื่อ-นามสกุลผู้ติดต่อ                      ← บังคับ
8. เบอร์โทรศัพท์ติดต่อ                        ← บังคับ

เมื่อได้ข้อมูลบังคับ (1,2,4,7,8) ครบแล้ว ยืนยันทันที:
"ขอบคุณครับ 🙏 ได้รับข้อมูลครบแล้วนะครับ ทีมงานจะจัดทำใบเสนอราคาและโทรกลับภายใน 2-4 ชั่วโมงครับ 🧡
💡 หากมีสำเนากรมธรรม์เดิม ส่งมาได้เลยนะครับ จะช่วยให้เสนอราคาได้รวดเร็วยิ่งขึ้นครับ 📄"

== วิธีการสนทนา ==
1. ทักทายและขอข้อมูลทั้งหมดทีเดียวในข้อความเดียว:
   "สวัสดีครับ~ 🐾 ผมน้องต่อกันจาก ต่อกัน ประกันภัย ยินดีให้บริการครับ!
   เพื่อให้ทีมงานจัดทำใบเสนอราคาได้เลย รบกวนแจ้งข้อมูลเหล่านี้มาได้เลยนะครับ 🙏
   🚗 ยี่ห้อรถ / รุ่น / รุ่นย่อย / ปีที่ผลิต
   🛡️ บริษัทประกันเดิม + เดือนที่หมดอายุ (ถ้ามี)
   📝 ชื่อ-นามสกุล + เบอร์โทรศัพท์
   📄 หรือถ้ามีสำเนากรมธรรม์เดิม ส่งมาได้เลยครับ จะสะดวกยิ่งขึ้น"

2. เมื่อลูกค้าแจ้งข้อมูล ตรวจสอบทันทีว่าครบหรือไม่ ถามเฉพาะข้อที่ยังขาด ไม่ถามซ้ำข้อที่ได้แล้ว
3. เมื่อข้อมูลบังคับครบ ยืนยันรับข้อมูลและแจ้งทีมงานโทรกลับ

สำหรับลูกค้าต่ออายุ (เมื่อลูกค้าบอกว่าต้องการต่ออายุ):
- ตอบว่า "ได้รับทราบครับ 🙏 ทีมงานได้รับแจ้งและกำลังเตรียมใบเสนอราคาต่ออายุให้โดยเร็วครับ 🧡"
- ขอข้อมูลรถและชื่อ-เบอร์ติดต่อให้ครบ (ระบบจะแจ้งพนักงานอัตโนมัติ)

== ขอบเขตการให้บริการ (STRICT) ==
น้องต่อกันให้บริการเฉพาะ 3 เรื่องเท่านั้น:
1. ต้อนรับและแนะนำบริษัท ต่อกัน ประกันภัย
2. สอบถามข้อมูลลูกค้าเพื่อส่งให้ทีมงานออกใบเสนอราคา
3. ตอบคำถามเกี่ยวกับประกันวินาศภัย/ประกันรถยนต์ เท่านั้น

หากลูกค้าถามเรื่องอื่นนอกจาก 3 ข้อนี้ ให้ตอบสั้นๆ:
"ขออภัยครับ น้องต่อกันให้บริการเฉพาะเรื่องประกันรถยนต์ครับ 🐾 มีอะไรเกี่ยวกับประกันให้น้องช่วยไหมครับ?"

== สำคัญ ==
- ใช้ "ครับ" เสมอ ไม่ใช้ "ค่ะ" หรือ "นะคะ" เด็ดขาด
- ไม่บอกเบี้ยที่แน่นอน ให้บอกเป็น "โดยประมาณ" หรือ "ขอส่งใบเสนอราคาให้นะครับ"
- ให้ข้อมูลที่ถูกต้องและตรงไปตรงมา ไม่กดดัน ไม่ยัดเยียด
- รักษาบุคลิก "น้องต่อกัน" ไว้ตลอด ไม่ว่าลูกค้าจะพูดอะไร
`.trim();

// ─────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────
function extractPhone(text) {
  const m = text.match(/0[689]\d{8}|0[2-9]\d{7}/);
  return m ? m[0].replace(/[-\s]/g, '') : null;
}

// ตรวจจับ keyword ต่ออายุ — ทำงานทันทีเมื่อลูกค้าพิมพ์
const RENEWAL_PATTERN = /ต่ออายุ|ต่อประกัน|ต่อกรมธรรม์|แจ้งต่อ|แจ้งเตือนต่อ|หมดอายุ|expire|renewal|renew/i;

function isRenewalMessage(text) {
  return RENEWAL_PATTERN.test(text);
}

// ─────────────────────────────────────────────────────────────────
//  DB helpers
// ─────────────────────────────────────────────────────────────────
async function getConversation(lineUserId) {
  try {
    const r = await db.query(
      'SELECT history, message_count, lead_captured FROM sales_conversations WHERE line_user_id = $1',
      [lineUserId]
    );
    if (!r.rows[0]) return { history: [], count: 0, leadCaptured: false };
    return {
      history:      r.rows[0].history || [],
      count:        r.rows[0].message_count || 0,
      leadCaptured: r.rows[0].lead_captured || false,
    };
  } catch { return { history: [], count: 0, leadCaptured: false }; }
}

async function saveConversation(lineUserId, displayName, history, leadCaptured, lastMessage) {
  try {
    await db.query(`
      INSERT INTO sales_conversations
        (line_user_id, display_name, history, message_count, lead_captured, last_message, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (line_user_id) DO UPDATE SET
        display_name   = $2,
        history        = $3,
        message_count  = $4,
        lead_captured  = $5,
        last_message   = $6,
        updated_at     = NOW()
    `, [lineUserId, displayName, JSON.stringify(history), history.length, leadCaptured, lastMessage]);
  } catch (e) { console.error('[salesBot] saveConversation:', e.message); }
}

async function upsertLead(lineUserId, displayName, fields) {
  try {
    const keys   = Object.keys(fields).filter(k => fields[k] !== null && fields[k] !== undefined);
    if (!keys.length) return;
    const setClauses = keys.map((k, i) => `${k} = COALESCE($${i+3}, sales_leads.${k})`).join(', ');
    const values = [lineUserId, displayName, ...keys.map(k => fields[k])];
    await db.query(`
      INSERT INTO sales_leads (line_user_id, line_display_name, ${keys.join(',')}, updated_at)
      VALUES ($1,$2,${keys.map((_,i)=>'$'+(i+3)).join(',')},NOW())
      ON CONFLICT (line_user_id) DO UPDATE SET
        line_display_name = $2, ${setClauses}, updated_at = NOW()
    `, values);
  } catch (e) { console.error('[salesBot] upsertLead:', e.message); }
}

// ─────────────────────────────────────────────────────────────────
//  Working Hours — ตรวจสอบเวลาทำงาน
// ─────────────────────────────────────────────────────────────────
async function isWorkingHours() {
  try {
    const r = await db.query("SELECT key,value FROM system_settings WHERE key IN ('work_start','work_end','work_days')");
    const cfg = {};
    r.rows.forEach(row => { cfg[row.key] = row.value; });

    const workStart = cfg.work_start || '08:00';
    const workEnd   = cfg.work_end   || '18:00';
    const workDays  = (cfg.work_days || '1,2,3,4,5').split(',').map(Number);

    // เวลาปัจจุบันในไทย
    const now = new Date();
    const bkk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const day  = bkk.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    const hhmm = `${String(bkk.getHours()).padStart(2,'0')}:${String(bkk.getMinutes()).padStart(2,'0')}`;

    const dayOk  = workDays.includes(day);
    const timeOk = hhmm >= workStart && hhmm < workEnd;
    return dayOk && timeOk;
  } catch {
    return true; // ถ้าไม่มีตาราง → ถือว่าเป็นเวลางาน (safe default)
  }
}

// ดึงรายการ LINE User ID ของ recipient ตาม working hours
// ในเวลางาน → ทุกคน  |  นอกเวลางาน → เฉพาะ role='admin'
async function getNotifyRecipients() {
  const inHours = await isWorkingHours();
  const query = inHours
    ? 'SELECT line_user_id FROM admin_users WHERE line_user_id IS NOT NULL AND is_active = TRUE'
    : "SELECT line_user_id FROM admin_users WHERE line_user_id IS NOT NULL AND is_active = TRUE AND role = 'admin'";
  const r = await db.query(query);
  return r.rows;
}

// ─────────────────────────────────────────────────────────────────
//  Admin Notification (Flex Message)
// ─────────────────────────────────────────────────────────────────
const INSURANCE_LABEL = {
  type1: 'ชั้น 1 🥇', 'type2+': 'ชั้น 2+ ✨', type2: 'ชั้น 2',
  'type3+': 'ชั้น 3+ 🔥', type3: 'ชั้น 3', compulsory: 'พ.ร.บ.',
};

async function notifyAdminNewLead(lead) {
  try {
    const admins = await getNotifyRecipients();
    if (!admins.length) return;

    const interestIcon = { hot: '🔥 ร้อนแรง', warm: '✨ ปานกลาง', cold: '❄️ เย็น' };
    const rows = [];

    if (lead.customer_name || lead.line_display_name) rows.push({
      type: 'box', layout: 'baseline', spacing: 'sm',
      contents: [
        { type: 'text', text: '👤 ชื่อ', color: '#6b7280', size: 'sm', flex: 3 },
        { type: 'text', text: lead.customer_name || lead.line_display_name, weight: 'bold', size: 'sm', flex: 7, wrap: true },
      ],
    });

    if (lead.phone) rows.push({
      type: 'box', layout: 'baseline', spacing: 'sm',
      contents: [
        { type: 'text', text: '📞 เบอร์', color: '#6b7280', size: 'sm', flex: 3 },
        { type: 'text', text: lead.phone, weight: 'bold', size: 'sm', flex: 7, color: '#1a56db' },
      ],
    });

    const car = [lead.car_brand, lead.car_model, lead.car_year].filter(Boolean).join(' ');
    if (car) rows.push({
      type: 'box', layout: 'baseline', spacing: 'sm',
      contents: [
        { type: 'text', text: '🚗 รถ', color: '#6b7280', size: 'sm', flex: 3 },
        { type: 'text', text: car, size: 'sm', flex: 7, wrap: true },
      ],
    });

    if (lead.insurance_type) rows.push({
      type: 'box', layout: 'baseline', spacing: 'sm',
      contents: [
        { type: 'text', text: '🛡️ ประกัน', color: '#6b7280', size: 'sm', flex: 3 },
        { type: 'text', text: INSURANCE_LABEL[lead.insurance_type] || lead.insurance_type, size: 'sm', flex: 7, color: '#059669', weight: 'bold' },
      ],
    });

    rows.push({ type: 'separator', margin: 'sm' });
    rows.push({
      type: 'text',
      text: `ความสนใจ: ${interestIcon[lead.interest_level] || '—'}`,
      size: 'xs', color: '#374151', margin: 'sm',
    });

    const flex = {
      type: 'flex',
      altText: `🔔 Lead ใหม่! ${lead.customer_name || lead.line_display_name || 'ลูกค้าใหม่'} ${lead.phone || ''}`,
      contents: {
        type: 'bubble', size: 'kilo',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#1a56db', paddingAll: '14px',
          contents: [
            { type: 'text', text: '🔔 Lead ใหม่จาก Sales Bot', color: '#ffffff', weight: 'bold', size: 'md' },
            { type: 'text', text: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }), color: '#bfdbfe', size: 'xs', margin: 'xs' },
          ],
        },
        body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: rows },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px',
          contents: [{ type: 'text', text: '→ เปิด Admin Panel เพื่อจัดการ', size: 'xs', color: '#9ca3af', align: 'center' }],
        },
      },
    };

    await Promise.all(admins.map(r =>
      lineClient.pushMessage({ to: r.line_user_id, messages: [flex] }).catch(e =>
        console.error('[salesBot] push admin error:', e.message)
      )
    ));
  } catch (e) { console.error('[salesBot] notifyAdmin:', e.message); }
}

// ─────────────────────────────────────────────────────────────────
//  Admin Claimed Notification — แจ้งพนักงานทุกคนเมื่อมีคนกดรับงาน
// ─────────────────────────────────────────────────────────────────
async function notifyAdminClaimed(lead, operatorName) {
  try {
    const admins = await getNotifyRecipients();
    if (!admins.length) return;

    const customerName = lead.customer_name || lead.line_display_name || 'ลูกค้า';
    const car = [lead.car_brand, lead.car_model, lead.car_year].filter(Boolean).join(' ') || '—';

    const flex = {
      type: 'flex',
      altText: `🙋 ${operatorName} รับงาน ${customerName} แล้ว`,
      contents: {
        type: 'bubble', size: 'kilo',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#059669', paddingAll: '14px',
          contents: [
            { type: 'text', text: '🙋 มีพนักงานรับงานแล้ว!', color: '#ffffff', weight: 'bold', size: 'md' },
            { type: 'text', text: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }), color: '#d1fae5', size: 'xs', margin: 'xs' },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
          contents: [
            {
              type: 'box', layout: 'baseline', spacing: 'sm',
              contents: [
                { type: 'text', text: '🙋 ผู้รับงาน', color: '#6b7280', size: 'sm', flex: 4 },
                { type: 'text', text: operatorName, weight: 'bold', size: 'sm', flex: 6, color: '#059669' },
              ],
            },
            {
              type: 'box', layout: 'baseline', spacing: 'sm',
              contents: [
                { type: 'text', text: '👤 ลูกค้า', color: '#6b7280', size: 'sm', flex: 4 },
                { type: 'text', text: customerName, weight: 'bold', size: 'sm', flex: 6, wrap: true },
              ],
            },
            {
              type: 'box', layout: 'baseline', spacing: 'sm',
              contents: [
                { type: 'text', text: '🚗 รถ', color: '#6b7280', size: 'sm', flex: 4 },
                { type: 'text', text: car, size: 'sm', flex: 6, wrap: true },
              ],
            },
            lead.phone ? {
              type: 'box', layout: 'baseline', spacing: 'sm',
              contents: [
                { type: 'text', text: '📞 เบอร์', color: '#6b7280', size: 'sm', flex: 4 },
                { type: 'text', text: lead.phone, size: 'sm', flex: 6, color: '#1a56db' },
              ],
            } : null,
          ].filter(Boolean),
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px',
          contents: [{ type: 'text', text: `${operatorName} กำลังดูแลลูกค้ารายนี้แล้วครับ`, size: 'xs', color: '#9ca3af', align: 'center', wrap: true }],
        },
      },
    };

    await Promise.all(admins.map(r =>
      lineClient.pushMessage({ to: r.line_user_id, messages: [flex] }).catch(e =>
        console.error('[salesBot] push claimed notify error:', e.message)
      )
    ));
  } catch (e) { console.error('[salesBot] notifyAdminClaimed:', e.message); }
}

// ─────────────────────────────────────────────────────────────────
//  Admin Renewal Notification — แจ้งพนักงานเมื่อลูกค้าต่ออายุทักมา
// ─────────────────────────────────────────────────────────────────
async function notifyAdminRenewal(lineUserId, displayName) {
  try {
    const admins = await getNotifyRecipients();
    if (!admins.length) return;

    const flex = {
      type: 'flex',
      altText: `🔄 ต่ออายุ! ${displayName} ตอบรับแล้ว กรุณาเตรียมเสนอราคา`,
      contents: {
        type: 'bubble', size: 'kilo',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#d97706', paddingAll: '14px',
          contents: [
            { type: 'text', text: '🔄 ลูกค้าต่ออายุตอบกลับแล้ว!', color: '#ffffff', weight: 'bold', size: 'md' },
            { type: 'text', text: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }), color: '#fef3c7', size: 'xs', margin: 'xs' },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
          contents: [
            {
              type: 'box', layout: 'baseline', spacing: 'sm',
              contents: [
                { type: 'text', text: '👤 ลูกค้า', color: '#6b7280', size: 'sm', flex: 3 },
                { type: 'text', text: displayName, weight: 'bold', size: 'sm', flex: 7, wrap: true },
              ],
            },
            { type: 'separator', margin: 'sm' },
            { type: 'text', text: '📌 กรุณาเตรียมใบเสนอราคาต่ออายุและติดต่อลูกค้าโดยด่วนครับ', size: 'xs', color: '#374151', wrap: true, margin: 'sm' },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px',
          contents: [{ type: 'text', text: '→ เปิด Admin Panel เพื่อรับงาน', size: 'xs', color: '#9ca3af', align: 'center' }],
        },
      },
    };

    await Promise.all(admins.map(r =>
      lineClient.pushMessage({ to: r.line_user_id, messages: [flex] }).catch(e =>
        console.error('[salesBot] push renewal notify error:', e.message)
      )
    ));
  } catch (e) { console.error('[salesBot] notifyAdminRenewal:', e.message); }
}

// ─────────────────────────────────────────────────────────────────
//  Auto-extract lead fields จากบทสนทนา
// ─────────────────────────────────────────────────────────────────
async function extractLeadFields(history) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || history.length < 3) return null;
  try {
    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: MODEL, max_tokens: 200,
      system: `วิเคราะห์บทสนทนาและตอบ JSON เท่านั้น:
{"customer_name":null,"car_brand":null,"car_model":null,"car_year":null,"insurance_type":"type1|type2|type2+|type3|type3+|compulsory|null","interest_level":"hot|warm|cold","customer_type":"new|renewal","policy_expiry_date":"YYYY-MM-DD|null","current_insurer":null}
ใช้ null ถ้าไม่มีข้อมูลในบทสนทนา
interest_level: hot=ขอราคา/ให้เบอร์ warm=สนใจแต่ยังไม่ตัดสินใจ cold=แค่สอบถาม
customer_type: new=ลูกค้าใหม่ renewal=ต่ออายุกรมธรรม์เดิม (ค่าเริ่มต้น new)
policy_expiry_date: วันหมดอายุกรมธรรม์เดิม รูปแบบ YYYY-MM-DD (เฉพาะลูกค้าต่ออายุ)
current_insurer: ชื่อบริษัทประกันเดิม (เฉพาะลูกค้าต่ออายุ)`,
      messages: [{
        role: 'user',
        content: history.slice(-8).map(m => `${m.role === 'user' ? 'ลูกค้า' : 'บอท'}: ${m.content}`).join('\n'),
      }],
    }, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 8000,
    });
    const raw = resp.data.content[0]?.text || '{}';
    const json = JSON.parse(raw.match(/\{[\s\S]*?\}/)?.[0] || '{}');
    const fields = {};
    for (const [k, v] of Object.entries(json)) {
      if (v && v !== 'null') fields[k] = v;
    }
    return Object.keys(fields).length ? fields : null;
  } catch (e) {
    console.error('[salesBot] extractLeadFields:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Main: handleMessage
// ─────────────────────────────────────────────────────────────────
async function handleMessage(lineUserId, displayName, text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 'ขออภัยครับ ระบบชั่วคราวไม่พร้อม กรุณาโทร 02-XXX-XXXX หรือติดต่อเจ้าหน้าที่โดยตรงครับ';

  const { history, count, leadCaptured } = await getConversation(lineUserId);

  history.push({ role: 'user', content: text });
  const trimmed = history.slice(-MAX_HISTORY);

  // ── Claude API ──
  let assistantText;
  try {
    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: MODEL, max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: trimmed,
    }, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 15000,
    });
    assistantText = resp.data.content[0]?.text || 'ขออภัย ไม่สามารถตอบได้ในขณะนี้';

    // ── บันทึก token usage (background) ──
    const usage = resp.data.usage;
    if (usage) {
      db.query(
        'INSERT INTO api_usage_logs (line_user_id, display_name, model, input_tokens, output_tokens) VALUES ($1,$2,$3,$4,$5)',
        [lineUserId, displayName, MODEL, usage.input_tokens || 0, usage.output_tokens || 0]
      ).catch(e => console.error('[usage] log error:', e.message));
    }
  } catch (e) {
    console.error('[salesBot] Claude error:', e.response?.data || e.message);
    assistantText = 'ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาลองใหม่หรือโทร 02-XXX-XXXX ครับ';
  }

  trimmed.push({ role: 'assistant', content: assistantText });

  // ── Lead capture: phone detection ──
  let newLeadCaptured = leadCaptured;
  const phone = extractPhone(text);

  if (phone && !leadCaptured) {
    // บันทึก lead ใหม่
    await upsertLead(lineUserId, displayName, { phone, status: 'new', interest_level: 'hot' });
    newLeadCaptured = true;
    console.log(`[salesBot] 🎯 New lead: ${displayName} (${phone})`);

    // แจ้ง admin ทันที (background)
    notifyAdminNewLead({ line_display_name: displayName, phone, interest_level: 'hot' }).catch(() => {});
  }

  // ── Renewal keyword detection — ตรวจจับทันทีเมื่อลูกค้าพิมพ์ keyword ต่ออายุ ──
  if (isRenewalMessage(text)) {
    // ตรวจสอบว่าเคย flag renewal แล้วหรือไม่ (ไม่ส่ง notification ซ้ำ)
    db.query('SELECT customer_type FROM sales_leads WHERE line_user_id=$1', [lineUserId])
      .then(async (r) => {
        const alreadyRenewal = r.rows[0]?.customer_type === 'renewal';
        await upsertLead(lineUserId, displayName, { customer_type: 'renewal' });
        console.log(`[salesBot] 🔄 Renewal detected: ${displayName} (first=${!alreadyRenewal})`);
        if (!alreadyRenewal) {
          // แจ้งพนักงานครั้งแรกเท่านั้น
          notifyAdminRenewal(lineUserId, displayName).catch(() => {});
        }
      }).catch(() => {});
  }

  // ── Auto-extract ทุก 4 ข้อความ (หรือเมื่อ capture lead) ──
  if ((count + 1) % 4 === 0 || (phone && !leadCaptured)) {
    extractLeadFields(trimmed).then(async (fields) => {
      if (!fields) return;
      await upsertLead(lineUserId, displayName, fields);
      // ถ้า lead ใหม่และมีข้อมูลรถ → notify admin อีกครั้งพร้อมข้อมูลครบ
      if (!leadCaptured && (fields.car_brand || fields.customer_name)) {
        const lead = await db.query('SELECT * FROM sales_leads WHERE line_user_id=$1', [lineUserId]);
        if (lead.rows[0]) notifyAdminNewLead(lead.rows[0]).catch(() => {});
      }
    }).catch(() => {});
  }

  await saveConversation(lineUserId, displayName, trimmed, newLeadCaptured, text);
  return assistantText;
}

// ─────────────────────────────────────────────────────────────────
//  Welcome message สำหรับผู้ติดตามใหม่
// ─────────────────────────────────────────────────────────────────
function buildWelcomeFlex(displayName) {
  return {
    type: 'flex',
    altText: '👋 ยินดีต้อนรับสู่ต่อกัน ประกันภัย!',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1a56db', paddingAll: '18px',
        contents: [
          { type: 'text', text: '🚗 ต่อกัน ประกันภัย', color: '#ffffff', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'ประกันรถยนต์ ครบ ถูก เชื่อถือได้', color: '#bfdbfe', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          { type: 'text', text: `สวัสดีคุณ${displayName} 👋`, weight: 'bold', size: 'md' },
          { type: 'text', text: 'น้องต่อพร้อมดูแลคุณ 24 ชั่วโมง\nเพียงแจ้งข้อมูลรถ รับใบเสนอราคาทันที!', wrap: true, size: 'sm', color: '#374151', lineSpacing: '6px' },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md',
            contents: [
              { type: 'text', text: '✅ เปรียบเทียบราคาหลายบริษัทชั้นนำ', size: 'sm', color: '#374151' },
              { type: 'text', text: '✅ ประกันชั้น 1 / 2+ / 3+ และ พ.ร.บ.', size: 'sm', color: '#374151' },
              { type: 'text', text: '✅ รับกรมธรรม์ภายใน 1-3 วันทำการ', size: 'sm', color: '#374151' },
              { type: 'text', text: '✅ ทีมงานดูแลตลอดอายุกรมธรรม์', size: 'sm', color: '#374151' },
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
        contents: [
          {
            type: 'button', style: 'primary', color: '#1a56db',
            action: { type: 'message', label: '💬 ขอคำแนะนำประกัน', text: 'สนใจทำประกันรถยนต์ครับ' },
          },
          {
            type: 'button', style: 'secondary',
            action: { type: 'message', label: '💰 เช็คเบี้ยประกัน', text: 'ต้องการเช็คราคาเบี้ยประกันรถ' },
          },
          {
            type: 'button', style: 'link',
            action: { type: 'message', label: '❓ ความแตกต่างชั้นประกัน', text: 'ประกันชั้น 1 2 3 ต่างกันยังไง' },
          },
        ],
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────
//  Admin: getLeads / updateLead / getLead / resetConversation
// ─────────────────────────────────────────────────────────────────
async function getLeads({ status, interest_level, customer_type, search, limit = 50, offset = 0 } = {}) {
  const params = [];
  const where = [];
  if (status)         { params.push(status);         where.push(`status = $${params.length}`); }
  if (interest_level) { params.push(interest_level); where.push(`interest_level = $${params.length}`); }
  if (customer_type)  { params.push(customer_type);  where.push(`customer_type = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(customer_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR line_display_name ILIKE $${params.length})`);
  }
  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(limit, offset);

  const [rows, cnt] = await Promise.all([
    db.query(`SELECT * FROM sales_leads ${whereStr} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params),
    db.query(`SELECT COUNT(*) FROM sales_leads ${whereStr}`, params.slice(0, -2)),
  ]);
  return { leads: rows.rows, total: parseInt(cnt.rows[0].count) };
}

async function getLead(id) {
  const r = await db.query('SELECT * FROM sales_leads WHERE id=$1', [id]);
  return r.rows[0] || null;
}

async function updateLead(id, fields) {
  const allowed = [
    'status','notes','customer_name','phone','car_brand','car_model','car_year',
    'insurance_type','interest_level','customer_type','policy_expiry_date','current_insurer',
    // Operator tracking
    'assigned_operator_id','assigned_operator_name',
    'closed_by_operator_id','closed_by_operator_name','closed_at',
  ];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return null;
  const sets = keys.map((k, i) => `${k} = $${i+2}`).join(', ');
  const r = await db.query(
    `UPDATE sales_leads SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id, ...keys.map(k => fields[k])]
  );
  return r.rows[0] || null;
}

async function getConversationHistory(lineUserId) {
  const r = await db.query(
    'SELECT history, message_count, last_message, updated_at FROM sales_conversations WHERE line_user_id=$1',
    [lineUserId]
  );
  return r.rows[0] || null;
}

async function resetConversation(lineUserId) {
  await db.query('DELETE FROM sales_conversations WHERE line_user_id=$1', [lineUserId]);
}

async function getStats() {
  const r = await db.query(`
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE status='new')              AS new_leads,
      COUNT(*) FILTER (WHERE status='contacted')        AS contacted,
      COUNT(*) FILTER (WHERE status='quoted')           AS quoted,
      COUNT(*) FILTER (WHERE status='closed')           AS closed,
      COUNT(*) FILTER (WHERE status='lost')             AS lost,
      COUNT(*) FILTER (WHERE interest_level='hot')      AS hot,
      COUNT(*) FILTER (WHERE interest_level='warm')     AS warm,
      COUNT(*) FILTER (WHERE interest_level='cold')     AS cold,
      COUNT(*) FILTER (WHERE created_at >= NOW()-'7 days'::interval) AS last_7_days,
      COUNT(*) FILTER (WHERE created_at >= NOW()-'30 days'::interval) AS last_30_days
    FROM sales_leads
  `);
  return r.rows[0];
}

module.exports = {
  handleMessage,
  buildWelcomeFlex,
  getLeads,
  getLead,
  updateLead,
  getConversationHistory,
  resetConversation,
  getStats,
  notifyAdminClaimed,
};
