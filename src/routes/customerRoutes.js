'use strict';
/**
 * customerRoutes.js — Customer Profile Page
 *
 * GET  /api/customers/:senderId?channel= — โปรไฟล์ลูกค้า รวมประวัติ + tags + notes + details
 * PUT  /api/customers/:senderId/details  — บันทึก/อัปเดต customer_details (upsert)
 */

const express         = require('express');
const { requireAuth } = require('../middleware/auth');
const db              = require('../db');

const router = express.Router();

// ── GET /api/customers/:senderId ────────────────────────────────────
router.get('/:senderId', requireAuth, async (req, res) => {
  try {
    const { senderId } = req.params;
    const { channel }  = req.query;

    const whereChannel = channel ? 'AND c.channel = $2' : '';
    const params = channel ? [senderId, channel] : [senderId];

    // All conversations for this sender
    const convsR = await db.query(`
      SELECT c.*, u.display_name AS assigned_name
      FROM inbox_conversations c
      LEFT JOIN admin_users u ON u.id = c.assigned_to
      WHERE c.sender_id = $1 ${whereChannel}
      ORDER BY c.last_message_at DESC
    `, params);

    const conversations = convsR.rows;

    // Customer details (form data)
    const detailsR = await db.query(
      `SELECT * FROM customer_details WHERE sender_id = $1 AND channel = $2`,
      [senderId, channel || 'line']
    );
    const details = detailsR.rows[0] || null;

    if (!conversations.length) {
      return res.json({
        success: true,
        profile: {
          sender_id: senderId,
          display_name: 'ไม่พบลูกค้า',
          conversations: [],
          tags: [],
          notes: [],
          details,
          total_conversations: 0,
          total_messages: 0,
          total_notes: 0,
        },
      });
    }

    const convIds = conversations.map(c => c.id);

    // Total messages across all convs
    const msgCnt = await db.query(
      `SELECT COUNT(*) FROM inbox_messages WHERE conversation_id = ANY($1)`,
      [convIds]
    );

    // All distinct tags across all convs
    const tagsR = await db.query(`
      SELECT DISTINCT t.id, t.name, t.color
      FROM tags t
      JOIN conversation_tags ct ON ct.tag_id = t.id
      WHERE ct.conversation_id = ANY($1)
      ORDER BY t.name
    `, [convIds]);

    // All notes across all convs (latest 20)
    const notesR = await db.query(`
      SELECT n.*, c.id AS conversation_id
      FROM conversation_notes n
      JOIN inbox_conversations c ON c.id = n.conversation_id
      WHERE n.conversation_id = ANY($1)
      ORDER BY n.created_at DESC
      LIMIT 20
    `, [convIds]);

    const profile = {
      sender_id:           senderId,
      display_name:        conversations[0].display_name,
      profile_pic:         conversations[0].profile_pic,
      channel:             conversations[0].channel,
      total_conversations: conversations.length,
      total_messages:      parseInt(msgCnt.rows[0].count),
      total_notes:         notesR.rows.length,
      conversations,
      tags:                tagsR.rows,
      notes:               notesR.rows,
      details,
    };

    res.json({ success: true, profile });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PUT /api/customers/:senderId/details ────────────────────────────
router.put('/:senderId/details', requireAuth, async (req, res) => {
  try {
    const { senderId }  = req.params;
    const staffId       = req.user?.id || null;
    const {
      channel = 'line',
      cust_name,
      phone,
      car_brand,
      car_model,
      car_year,
      license_plate,
      coverage_start,
      coverage_end,
      extra_notes,
    } = req.body;

    const r = await db.query(`
      INSERT INTO customer_details
        (sender_id, channel, cust_name, phone, car_brand, car_model, car_year,
         license_plate, coverage_start, coverage_end, extra_notes, updated_by, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      ON CONFLICT (sender_id, channel)
      DO UPDATE SET
        cust_name      = EXCLUDED.cust_name,
        phone          = EXCLUDED.phone,
        car_brand      = EXCLUDED.car_brand,
        car_model      = EXCLUDED.car_model,
        car_year       = EXCLUDED.car_year,
        license_plate  = EXCLUDED.license_plate,
        coverage_start = EXCLUDED.coverage_start,
        coverage_end   = EXCLUDED.coverage_end,
        extra_notes    = EXCLUDED.extra_notes,
        updated_by     = EXCLUDED.updated_by,
        updated_at     = NOW()
      RETURNING *
    `, [senderId, channel, cust_name || null, phone || null,
        car_brand || null, car_model || null, car_year || null,
        license_plate || null,
        coverage_start || null, coverage_end || null,
        extra_notes || null, staffId]);

    res.json({ success: true, details: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
