'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const salesBot = require('../services/salesBotService');

const router = express.Router();

// ── GET /api/leads ──────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, interest_level, search, limit = 50, offset = 0 } = req.query;
    const result = await salesBot.getLeads({ status, interest_level, search, limit: +limit, offset: +offset });
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[leadsAPI] GET /leads:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/leads/stats ────────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await salesBot.getStats();
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/leads/:id ──────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const lead = await salesBot.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, lead });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PATCH /api/leads/:id ────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const lead = await salesBot.updateLead(req.params.id, req.body);
    if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, lead });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/leads/:id/conversation ────────────────────────────
router.get('/:id/conversation', requireAuth, async (req, res) => {
  try {
    const lead = await salesBot.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
    const conv = await salesBot.getConversationHistory(lead.line_user_id);
    res.json({ success: true, conversation: conv });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DELETE /api/leads/:id/conversation — reset chat ────────────
router.delete('/:id/conversation', requireAuth, async (req, res) => {
  try {
    const lead = await salesBot.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
    await salesBot.resetConversation(lead.line_user_id);
    res.json({ success: true, message: 'Conversation reset' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
