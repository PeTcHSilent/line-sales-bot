'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const salesBot = require('../services/salesBotService');

const router = express.Router();

// ── GET /api/leads ──────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, interest_level, customer_type, search, limit = 50, offset = 0 } = req.query;
    const result = await salesBot.getLeads({ status, interest_level, customer_type, search, limit: +limit, offset: +offset });
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
    const updates = { ...req.body };
    // Auto-record operator เมื่อปิดงาน
    if (updates.status === 'closed' || updates.status === 'converted') {
      updates.closed_by_operator_id   = req.user.id;
      updates.closed_by_operator_name = req.user.display_name || req.user.username;
      if (!updates.closed_at) updates.closed_at = new Date().toISOString();
    }
    const lead = await salesBot.updateLead(req.params.id, updates);
    if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, lead });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/leads/:id/claim — พนักงานรับงาน ──────────────────
router.post('/:id/claim', requireAuth, async (req, res) => {
  try {
    const operatorName = req.user.display_name || req.user.username;
    const lead = await salesBot.updateLead(req.params.id, {
      assigned_operator_id:   req.user.id,
      assigned_operator_name: operatorName,
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, lead });

    // แจ้งพนักงานทุกคนว่ามีคนรับงานแล้ว (background)
    salesBot.notifyAdminClaimed(lead, operatorName).catch(e =>
      console.error('[leadsRoutes] notifyAdminClaimed:', e.message)
    );
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
