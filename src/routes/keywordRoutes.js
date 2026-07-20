'use strict';
/**
 * keywordRoutes.js — Keyword Auto-reply Rules
 *
 * GET    /api/keywords       — list
 * POST   /api/keywords       — create
 * PUT    /api/keywords/:id   — update
 * DELETE /api/keywords/:id   — delete
 */

const express         = require('express');
const { requireAuth } = require('../middleware/auth');
const db              = require('../db');

const router = express.Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT k.*, u.display_name AS created_by_name
      FROM keyword_rules k
      LEFT JOIN admin_users u ON u.id = k.created_by
      ORDER BY k.priority DESC, k.created_at DESC
    `);
    res.json({ success: true, rules: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { keyword, response, match_type = 'contains', priority = 0 } = req.body;
    if (!keyword?.trim() || !response?.trim())
      return res.status(400).json({ success: false, error: 'keyword และ response ต้องระบุ' });

    const r = await db.query(`
      INSERT INTO keyword_rules (keyword, response, match_type, priority, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [keyword.trim(), response.trim(), match_type, +priority, req.user.id]);
    res.json({ success: true, rule: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { keyword, response, match_type, priority, is_active } = req.body;
    const r = await db.query(`
      UPDATE keyword_rules
      SET keyword    = COALESCE($2, keyword),
          response   = COALESCE($3, response),
          match_type = COALESCE($4, match_type),
          priority   = COALESCE($5, priority),
          is_active  = COALESCE($6, is_active),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [+req.params.id,
        keyword?.trim() || null,
        response?.trim() || null,
        match_type || null,
        priority != null ? +priority : null,
        is_active != null ? is_active : null]);
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'ไม่พบ rule' });
    res.json({ success: true, rule: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM keyword_rules WHERE id=$1', [+req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
