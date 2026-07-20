'use strict';
/**
 * renewalCron.js — แจ้งเตือนต่ออายุกรมธรรม์ไปยัง Staff
 *
 * รัน: ทุกวัน เวลา 08:00
 * Logic:
 *   1. หา customers ที่ coverage_end อยู่ระหว่าง TODAY ถึง TODAY+90 วัน
 *   2. ที่ renewal_last_notified IS NULL หรือ < TODAY-7 (ไม่ส่งซ้ำใน 7 วัน)
 *   3. ส่ง LINE push ไปหา assigned staff (line_user_id)
 *   4. update renewal_last_notified = CURRENT_DATE
 */

const db   = require('../db');
const line = require('@line/bot-sdk');

function getLineClient() {
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

async function sendRenewalReminders() {
  try {
    const r = await db.query(`
      WITH latest_conv AS (
        SELECT DISTINCT ON (sender_id, channel)
          id, sender_id, channel, display_name, assigned_to
        FROM inbox_conversations
        ORDER BY sender_id, channel, last_message_at DESC
      )
      SELECT
        cd.id,
        cd.sender_id,
        cd.channel,
        cd.cust_name,
        cd.phone,
        cd.car_brand,
        cd.car_model,
        cd.license_plate,
        cd.coverage_end,
        (cd.coverage_end - CURRENT_DATE)::int AS days_remaining,
        lc.display_name  AS customer_line_name,
        a.display_name   AS staff_name,
        a.line_user_id   AS staff_line_id
      FROM customer_details cd
      LEFT JOIN latest_conv lc
        ON lc.sender_id = cd.sender_id AND lc.channel = cd.channel
      LEFT JOIN admin_users a ON a.id = lc.assigned_to
      WHERE cd.coverage_end IS NOT NULL
        AND cd.coverage_end >= CURRENT_DATE
        AND cd.coverage_end <= CURRENT_DATE + INTERVAL '90 days'
        AND (
          cd.renewal_last_notified IS NULL
          OR cd.renewal_last_notified < CURRENT_DATE - INTERVAL '7 days'
        )
      ORDER BY cd.coverage_end ASC
    `);

    if (!r.rows.length) {
      console.log('[renewalCron] ไม่มีลูกค้าที่ต้องแจ้งเตือนวันนี้');
      return;
    }

    console.log(`[renewalCron] พบ ${r.rows.length} รายที่ต้องแจ้งเตือน`);
    const lc = getLineClient();

    for (const row of r.rows) {
      const days   = parseInt(row.days_remaining);
      const name   = row.cust_name || row.customer_line_name || 'ลูกค้า';
      const car    = [row.car_brand, row.car_model].filter(Boolean).join(' ') || 'ไม่ระบุ';
      const plate  = row.license_plate || '—';
      const endStr = new Date(row.coverage_end).toLocaleDateString('th-TH', {
        day: 'numeric', month: 'short', year: '2-digit',
      });

      const emoji = days <= 30 ? '🔴' : days <= 60 ? '🟠' : '🟡';
      const msg   = [
        `${emoji} แจ้งเตือนต่ออายุกรมธรรม์`,
        '',
        `👤 ลูกค้า: ${name}`,
        row.phone ? `📞 โทร: ${row.phone}` : null,
        `🚗 รถ: ${car}  ทะเบียน ${plate}`,
        `📅 หมดอายุ: ${endStr}`,
        `⏳ เหลืออีก ${days} วัน`,
        '',
        'กรุณาติดต่อลูกค้าเพื่อต่ออายุกรมธรรม์ครับ',
      ].filter(l => l !== null).join('\n');

      if (row.staff_line_id) {
        try {
          await lc.pushMessage({
            to: row.staff_line_id,
            messages: [{ type: 'text', text: msg }],
          });
          console.log(`[renewalCron] ✅ ส่งแจ้งเตือน → ${row.staff_name} (${name}, ${days} วัน)`);
        } catch (pushErr) {
          console.error(`[renewalCron] ❌ push ล้มเหลว cd#${row.id}:`, pushErr.message);
        }
      } else {
        console.log(`[renewalCron] ⚠️  cd#${row.id} — ${row.staff_name || 'ไม่มีพนักงาน'} ไม่มี LINE ID`);
      }

      // อัปเดต renewal_last_notified ไม่ว่า push จะสำเร็จหรือไม่ (ป้องกัน spam)
      await db.query(
        `UPDATE customer_details SET renewal_last_notified = CURRENT_DATE WHERE id = $1`,
        [row.id]
      );
    }
  } catch (e) {
    console.error('[renewalCron] error:', e.message);
  }
}

/** หา milliseconds จนถึง 08:00 วันถัดไป (หรือวันนี้ถ้ายังไม่ถึง) */
function msUntil8am() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function start() {
  const ms = msUntil8am();
  const min = Math.round(ms / 60000);
  console.log(`[renewalCron] started — first run ใน ${min} นาที (08:00), จากนั้นทุก 24 ชม.`);
  setTimeout(() => {
    sendRenewalReminders();
    setInterval(sendRenewalReminders, 24 * 60 * 60 * 1000);
  }, ms);
}

module.exports = { start, sendRenewalReminders };
