'use strict';
/**
 * slaCron.js — SLA Alert
 *
 * ทุก 5 นาที: หา conversation ที่อยู่ใน human mode
 * และไม่มีข้อความ outbound นาน > sla_minutes → แจ้งเตือน LINE
 */

const db   = require('../db');
const line = require('@line/bot-sdk');

function getLineClient() {
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

async function getSettings() {
  const r = await db.query(
    `SELECT key, value FROM system_settings WHERE key IN ('sla_minutes','sla_supervisor_line_id')`
  );
  const s = {};
  r.rows.forEach(row => { s[row.key] = row.value; });
  return {
    sla_minutes:          parseInt(s.sla_minutes || '30'),
    sla_supervisor_line_id: s.sla_supervisor_line_id || '',
  };
}

async function checkSLA() {
  try {
    const { sla_minutes, sla_supervisor_line_id } = await getSettings();

    // Find human-mode conversations where last outbound message was more than sla_minutes ago
    const r = await db.query(`
      SELECT c.id,
             c.display_name   AS customer_name,
             c.assigned_to,
             a.display_name   AS staff_name,
             a.line_user_id   AS staff_line_id,
             EXTRACT(EPOCH FROM (NOW() - last_out.created_at)) / 60 AS minutes_since_reply
      FROM inbox_conversations c
      LEFT JOIN admin_users a ON a.id = c.assigned_to
      LEFT JOIN LATERAL (
        SELECT created_at FROM inbox_messages
        WHERE conversation_id = c.id AND direction = 'out'
        ORDER BY created_at DESC LIMIT 1
      ) last_out ON TRUE
      WHERE c.mode = 'human'
        AND (
          last_out.created_at IS NULL
          OR EXTRACT(EPOCH FROM (NOW() - last_out.created_at)) / 60 >= $1
        )
        AND NOT EXISTS (
          SELECT 1 FROM inbox_messages
          WHERE conversation_id = c.id
            AND direction = 'out'
            AND content LIKE '⚠️ SLA Alert%'
            AND created_at > NOW() - INTERVAL '1 hour'
        )
    `, [sla_minutes]);

    if (!r.rows.length) return;

    const lc = getLineClient();

    for (const row of r.rows) {
      const waitMin = row.minutes_since_reply ? Math.round(row.minutes_since_reply) : '> ' + sla_minutes;
      const msg = `⚠️ SLA Alert!\n\n👤 ลูกค้า: ${row.customer_name}\n⏱️ รอตอบมา: ${waitMin} นาที\n🧑 ดูแลโดย: ${row.staff_name || 'ยังไม่ได้มอบหมาย'}\n\nกรุณาตอบกลับลูกค้าโดยด่วน!`;

      const recipients = [];
      if (row.staff_line_id) recipients.push(row.staff_line_id);
      if (sla_supervisor_line_id && sla_supervisor_line_id !== row.staff_line_id)
        recipients.push(sla_supervisor_line_id);

      for (const lineId of recipients) {
        try {
          await lc.pushMessage({ to: lineId, messages: [{ type: 'text', text: msg }] });
        } catch (e) {
          console.error('[slaCron] push failed:', e.message);
        }
      }

      // Save SLA alert as system message (prevents re-alert in same hour)
      await db.query(`
        INSERT INTO inbox_messages (conversation_id, direction, sender, content, sender_name)
        VALUES ($1, 'out', 'system', $2, 'ระบบ SLA')
      `, [row.id, msg]);

      console.log(`[slaCron] SLA alert sent for conv#${row.id} (${row.customer_name})`);
    }
  } catch (e) {
    console.error('[slaCron] error:', e.message);
  }
}

function start() {
  checkSLA();
  setInterval(checkSLA, 5 * 60 * 1000); // Every 5 minutes
  console.log('[slaCron] started — checks every 5 minutes');
}

module.exports = { start, checkSLA };
