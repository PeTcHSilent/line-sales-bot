'use strict';
/**
 * broadcastRoutes.js — LINE Broadcast (ส่งข้อความกลุ่ม)
 *
 * GET  /api/broadcast        — list past broadcasts
 * POST /api/broadcast        — send new broadcast
 * GET  /api/broadcast/preview — preview recipients (dry-run)
 */

const express         = require('express');
const line            = require('@line/bot-sdk');
const { requireAuth } = require('../middleware/auth');
const db              = require('../db');

const router = express.Router();

const getLineClient = () => new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// ── Helper: build WHERE clause for recipient filter ─────────────────
async function getRecipients(filter_type, filter_value) {
  let q = `
    SELECT DISTINCT c.sender_id, c.display_name, c.channel
    FROM inbox_conversations c
    WHERE c.channel = 'line'
  `;
  const params = [];

  if (filter_type === 'lead_type' && filter_value) {
    params.push(filter_value);
    q += ` AND c.lead_type = $${params.length}`;
  } else if (filter_type === 'tag' && filter_value) {
    params.push(filter_value);
    q += ` AND EXISTS (
      SELECT 1 FROM conversation_tags ct
      JOIN tags t ON t.id = ct.tag_id
      WHERE ct.conversation_id = c.id AND t.name = $${params.length}
    )`;
  }
  // filter_type = 'all' → no extra filter

  q += ' ORDER BY c.display_name';
  const r = await db.query(q, params);
  return r.rows;
}

// ── GET /api/broadcast/preview ──────────────────────────────────────
router.get('/preview', requireAuth, async (req, res) => {
  try {
    const { filter_type = 'all', filter_value } = req.query;
    const recipients = await getRecipients(filter_type, filter_value);
    res.json({ success: true, count: recipients.length, recipients });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/broadcast ──────────────────────────────────────────────
router.get('/', requireAuth, async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT b.*, u.display_name AS created_by_name
      FROM broadcasts b
      LEFT JOIN admin_users u ON u.id = b.created_by
      ORDER BY b.created_at DESC
      LIMIT 50
    `);
    res.json({ success: true, broadcasts: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/broadcast ─────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, message, filter_type = 'all', filter_value, channel = 'line' } = req.body;
    if (!title?.trim() || !message?.trim())
      return res.status(400).json({ success: false, error: 'title และ message ต้องระบุ' });
    if (channel !== 'line')
      return res.status(400).json({ success: false, error: 'รองรับเฉพาะ LINE ในขณะนี้' });

    // create broadcast record first
    const br = await db.query(`
      INSERT INTO broadcasts (title, message, channel, filter_type, filter_value, status, created_by)
      VALUES ($1,$2,$3,$4,$5,'sending',$6)
      RETURNING *
    `, [title.trim(), message.trim(), channel, filter_type, filter_value || null, req.user.id]);
    const broadcastId = br.rows[0].id;

    // get recipients
    const recipients = await getRecipients(filter_type, filter_value);
    if (!recipients.length) {
      await db.query(
        `UPDATE broadcasts SET status='done', sent_count=0, sent_at=NOW() WHERE id=$1`,
        [broadcastId]
      );
      return res.json({ success: true, broadcast_id: broadcastId, sent: 0, failed: 0, message: 'ไม่มีผู้รับที่ตรงเงื่อนไข' });
    }

    // send LINE push (fire and forget individual pushes)
    const lc = getLineClient();
    let sent = 0, failed = 0;

    for (const r of recipients) {
      try {
        await lc.pushMessage({
          to: r.sender_id,
          messages: [{ type: 'text', text: message.trim() }],
        });
        sent++;
      } catch (_) {
        failed++;
      }
    }

    await db.query(
      `UPDATE broadcasts SET status='done', sent_count=$2, fail_count=$3, sent_at=NOW() WHERE id=$1`,
      [broadcastId, sent, failed]
    );

    res.json({ success: true, broadcast_id: broadcastId, sent, failed, total: recipients.length });
  } catch (e) {
    console.error('[broadcast] error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
