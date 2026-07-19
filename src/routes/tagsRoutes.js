'use strict';
/**
 * tagsRoutes.js — Tags management
 *
 * GET    /api/tags                        — list all tags
 * POST   /api/tags                        — create tag
 * DELETE /api/tags/:id                    — delete tag
 * GET    /api/tags/conv/:convId           — get tags for a conversation
 * POST   /api/tags/conv/:convId/:tagId    — add tag to conversation
 * DELETE /api/tags/conv/:convId/:tagId    — remove tag from conversation
 */

const express          = require('express');
const { requireAuth }  = require('../middleware/auth');
const db               = require('../db');

const router = express.Router();

// ── GET /api/tags ───────────────────────────────────────────────────
router.get('/', requireAuth, async (_req, res) => {
  try {
    const r = await db.query('SELECT * FROM tags ORDER BY name');
    res.json({ success: true, tags: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/tags ──────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, color = '#6b7280' } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
    const r = await db.query(
      'INSERT INTO tags (name, color) VALUES ($1,$2) RETURNING *',
      [name.trim(), color]
    );
    res.json({ success: true, tag: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'Tag นี้มีอยู่แล้ว' });
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DELETE /api/tags/:id ────────────────────────────────────────────
router.delete('/:id(\\d+)', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM tags WHERE id=$1', [+req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/tags/conv/:convId ──────────────────────────────────────
router.get('/conv/:convId', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT t.* FROM tags t
      JOIN conversation_tags ct ON ct.tag_id = t.id
      WHERE ct.conversation_id = $1
      ORDER BY t.name
    `, [+req.params.convId]);
    res.json({ success: true, tags: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/tags/conv/:convId/:tagId — add tag ────────────────────
router.post('/conv/:convId/:tagId', requireAuth, async (req, res) => {
  try {
    await db.query(
      'INSERT INTO conversation_tags (conversation_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [+req.params.convId, +req.params.tagId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DELETE /api/tags/conv/:convId/:tagId — remove tag ───────────────
router.delete('/conv/:convId/:tagId', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM conversation_tags WHERE conversation_id=$1 AND tag_id=$2',
      [+req.params.convId, +req.params.tagId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
