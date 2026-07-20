'use strict';
/**
 * followUpCron.js — ส่งแจ้งเตือน Follow-up ถึงกำหนดวันนี้
 *
 * รัน: ทุก 30 นาที
 * Logic:
 *   1. หา follow_ups ที่ due_date = TODAY, status='pending', notified_at IS NULL
 *   2. ส่ง LINE push หา assigned_to.line_user_id
 *   3. update notified_at = NOW()
 */

const db   = require('../db');
const line = require('@line/bot-sdk');

function getLineClient() {
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

async function sendFollowUpReminders() {
  try {
    const r = await db.query(`
      SELECT f.*,
             c.display_name  AS customer_name,
             c.sender_id     AS customer_line_id,
             a.line_user_id  AS staff_line_id,
             a.display_name  AS staff_name
      FROM follow_ups f
      JOIN inbox_conversations c ON c.id = f.conversation_id
      LEFT JOIN admin_users a ON a.id = f.assigned_to
      WHERE f.due_date <= CURRENT_DATE
        AND f.status = 'pending'
        AND f.notified_at IS NULL
    `);

    if (!r.rows.length) return;

    const lc = getLineClient();

    for (const fu of r.rows) {
      if (!fu.staff_line_id) {
        console.log(`[followUpCron] follow_up#${fu.id} — assigned staff has no LINE ID, skip`);
        await db.query('UPDATE follow_ups SET notified_at=NOW(), updated_at=NOW() WHERE id=$1', [fu.id]);
        continue;
      }

      const noteText = fu.note ? `\n📝 ${fu.note}` : '';
      const msg = `⏰ ถึงกำหนดติดตาม!\n\n👤 ลูกค้า: ${fu.customer_name}\n📅 วัน: ${fu.due_date}${noteText}\n\nกรุณาเข้าระบบ Inbox เพื่อติดต่อลูกค้า`;

      try {
        await lc.pushMessage({
          to: fu.staff_line_id,
          messages: [{ type: 'text', text: msg }],
        });
        console.log(`[followUpCron] sent reminder to ${fu.staff_name} for follow_up#${fu.id}`);
      } catch (pushErr) {
        console.error(`[followUpCron] push failed for follow_up#${fu.id}:`, pushErr.message);
      }

      // Mark notified regardless of push success so we don't spam
      await db.query('UPDATE follow_ups SET notified_at=NOW(), updated_at=NOW() WHERE id=$1', [fu.id]);
    }
  } catch (e) {
    console.error('[followUpCron] error:', e.message);
  }
}

function start() {
  // Run immediately on start
  sendFollowUpReminders();
  // Then every 30 minutes
  setInterval(sendFollowUpReminders, 30 * 60 * 1000);
  console.log('[followUpCron] started — checks every 30 minutes');
}

module.exports = { start, sendFollowUpReminders };
