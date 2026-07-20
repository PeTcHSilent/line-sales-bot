'use strict';
/**
 * notesRoutes.js — Customer Notes per conversation
 *
 * GET    /api/notes/:convId        — list notes
 * POST   /api/notes/:convId        — add note
 * PUT    /api/notes/:convId/:id    — edit note
 * DELETE /api/notes/:convId/:id    — delete note
 */

const express         = require('express');
const { requireAuth } = require('../middleware/auth');
const db              = require('../db');

const router = express.Router();

// ── GET notes for a conversation ────────────────────────────────────
router.get('/:convId', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT * FROM conversation_notes
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [+req.params.convId]);
    res.json({ success: true, notes: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST add note ───────────────────────────────────────────────────
router.post('/:convId', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, error: 'content required' });

    const authorName = req.user.display_name || req.user.username;
    const r = await db.query(`
      INSERT INTO conversation_notes (conversation_id, author_id, author_name, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [+req.params.convId, req.user.id, authorName, content.trim()]);

    res.status(201).json({ success: true, note: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PUT edit note ───────────────────────────────────────────────────
router.put('/:convId/:id', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, error: 'content required' });

    const r = await db.query(`
      UPDATE conversation_notes
      SET content = $1, updated_at = NOW()
      WHERE id = $2 AND conversation_id = $3
      RETURNING *
    `, [content.trim(), +req.params.id, +req.params.convId]);

    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, note: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DELETE note ─────────────────────────────────────────────────────
router.delete('/:convId/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM conversation_notes WHERE id=$1 AND conversation_id=$2',
      [+req.params.id, +req.params.convId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
