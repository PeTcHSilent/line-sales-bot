'use strict';
/**
 * followUpRoutes.js — Follow-up Scheduler
 *
 * GET    /api/follow-ups?conv_id=&status=   — list
 * POST   /api/follow-ups                    — create
 * PUT    /api/follow-ups/:id                — update (due_date / note / status)
 * DELETE /api/follow-ups/:id                — delete
 */

const express         = require('express');
const { requireAuth } = require('../middleware/auth');
const db              = require('../db');

const router = express.Router();

// ── GET /api/follow-ups ──────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { conv_id, status } = req.query;
    const params = [];
    const where  = [];

    if (conv_id) {
      params.push(+conv_id);
      where.push(`f.conversation_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`f.status = $${params.length}`);
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const r = await db.query(`
      SELECT f.*,
             c.display_name AS customer_name,
             a.display_name AS assigned_name,
             cb.display_name AS created_by_name
      FROM follow_ups f
      JOIN inbox_conversations c ON c.id = f.conversation_id
      LEFT JOIN admin_users a  ON a.id  = f.assigned_to
      LEFT JOIN admin_users cb ON cb.id = f.created_by
      ${whereStr}
      ORDER BY f.due_date ASC, f.created_at DESC
    `, params);

    res.json({ success: true, follow_ups: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/follow-ups ─────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { conversation_id, due_date, note, assigned_to } = req.body;
    if (!conversation_id || !due_date)
      return res.status(400).json({ success: false, error: 'conversation_id และ due_date ต้องระบุ' });

    // Auto-assign to conversation's assigned_to if not specified
    let assignee = assigned_to || null;
    if (!assignee) {
      const cv = await db.query('SELECT assigned_to FROM inbox_conversations WHERE id=$1', [+conversation_id]);
      assignee = cv.rows[0]?.assigned_to || null;
    }

    const r = await db.query(`
      INSERT INTO follow_ups (conversation_id, due_date, note, assigned_to, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [+conversation_id, due_date, note?.trim() || null, assignee, req.user.id]);

    res.json({ success: true, follow_up: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PUT /api/follow-ups/:id ──────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { due_date, note, status, assigned_to } = req.body;
    const r = await db.query(`
      UPDATE follow_ups
      SET due_date    = COALESCE($2, due_date),
          note        = COALESCE($3, note),
          status      = COALESCE($4, status),
          assigned_to = COALESCE($5, assigned_to),
          updated_at  = NOW()
      WHERE id = $1
      RETURNING *
    `, [+req.params.id, due_date || null, note?.trim() || null, status || null, assigned_to || null]);

    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'ไม่พบ follow-up' });
    res.json({ success: true, follow_up: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DELETE /api/follow-ups/:id ───────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM follow_ups WHERE id=$1', [+req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
