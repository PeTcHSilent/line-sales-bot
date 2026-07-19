'use strict';
/**
 * quickRepliesRoutes.js — Quick Replies (saved message templates)
 *
 * GET    /api/quick-replies      — list all
 * POST   /api/quick-replies      — create
 * PUT    /api/quick-replies/:id  — update
 * DELETE /api/quick-replies/:id  — delete
 */

const express          = require('express');
const { requireAuth }  = require('../middleware/auth');
const db               = require('../db');

const router = express.Router();

// ── GET — list all ──────────────────────────────────────────────────
router.get('/', requireAuth, async (_req, res) => {
  try {
    const r = await db.query('SELECT * FROM quick_replies ORDER BY sort_order, title');
    res.json({ success: true, quick_replies: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST — create ───────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, content, sort_order = 0 } = req.body;
    if (!title?.trim() || !content?.trim())
      return res.status(400).json({ success: false, error: 'title และ content ต้องระบุ' });
    const r = await db.query(
      'INSERT INTO quick_replies (title, content, sort_order) VALUES ($1,$2,$3) RETURNING *',
      [title.trim(), content.trim(), +sort_order]
    );
    res.json({ success: true, quick_reply: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PUT — update ────────────────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { title, content, sort_order } = req.body;
    if (!title?.trim() || !content?.trim())
      return res.status(400).json({ success: false, error: 'title และ content ต้องระบุ' });
    const r = await db.query(`
      UPDATE quick_replies
      SET title=$2, content=$3, sort_order=COALESCE($4,sort_order), updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [+req.params.id, title.trim(), content.trim(), sort_order ?? null]);
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, quick_reply: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DELETE ──────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM quick_replies WHERE id=$1', [+req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
