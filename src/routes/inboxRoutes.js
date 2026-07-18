'use strict';
/**
 * inboxRoutes.js — REST API สำหรับ Unified Inbox
 *
 * GET  /api/inbox                  — list conversations
 * GET  /api/inbox/:id              — get one conversation
 * GET  /api/inbox/:id/messages     — get messages (+ mark read)
 * GET  /api/inbox/:id/poll?since=  — poll new messages
 * POST /api/inbox/:id/reply        — staff reply (push to LINE or Messenger)
 * PATCH /api/inbox/:id/mode        — set mode: bot | human | resolved
 */

const express    = require('express');
const line       = require('@line/bot-sdk');
const { requireAuth } = require('../middleware/auth');
const inboxService    = require('../services/inboxService');
const messengerSvc    = require('../services/messengerService');

const router = express.Router();

// สร้าง LINE client สำหรับ push message จาก admin panel
const getLineClient = () => new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// ── GET /api/inbox — list conversations ─────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { mode, channel, search, limit = 60, offset = 0 } = req.query;
    const result = await inboxService.getConversations({
      mode, channel, search, limit: +limit, offset: +offset,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[inbox] GET /:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/inbox/:id — get one conversation ───────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const conv = await inboxService.getConversation(+req.params.id);
    if (!conv) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, conversation: conv });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/inbox/:id/messages — get messages ──────────────────
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const [messages] = await Promise.all([
      inboxService.getMessages(+req.params.id, +limit, +offset),
      inboxService.markRead(+req.params.id),
    ]);
    res.json({ success: true, messages });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/inbox/:id/poll?since=ISO — poll new messages ───────
router.get('/:id/poll', requireAuth, async (req, res) => {
  try {
    const since = req.query.since || new Date(0).toISOString();
    const messages = await inboxService.getMessagesSince(+req.params.id, since);
    if (messages.length) await inboxService.markRead(+req.params.id);
    res.json({ success: true, messages });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/inbox/:id/reply — staff reply ─────────────────────
router.post('/:id/reply', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const conv = await inboxService.getConversation(+req.params.id);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

    const staffName = req.user.display_name || req.user.username;

    // Push to the right channel
    if (conv.channel === 'line') {
      try {
        const lc = getLineClient();
        await lc.pushMessage({ to: conv.sender_id, messages: [{ type: 'text', text: text.trim() }] });
      } catch (e) {
        console.error('[inbox] LINE push error:', e.message);
        return res.status(502).json({ success: false, error: 'LINE push failed: ' + e.message });
      }
    } else if (conv.channel === 'messenger') {
      try {
        await messengerSvc.sendMessage(conv.sender_id, text.trim());
      } catch (e) {
        console.error('[inbox] Messenger send error:', e.message);
        return res.status(502).json({ success: false, error: 'Messenger send failed: ' + e.message });
      }
    }

    // Save to inbox
    const msg = await inboxService.saveMessage(
      conv.id, 'out', 'staff', text.trim(), staffName
    );

    res.json({ success: true, message: msg });
  } catch (e) {
    console.error('[inbox] POST reply:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PATCH /api/inbox/:id/mode — bot | human | resolved ──────────
router.patch('/:id/mode', requireAuth, async (req, res) => {
  try {
    const { mode } = req.body;
    if (!['bot', 'human', 'resolved'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'mode must be bot, human, or resolved' });
    }
    const conv = await inboxService.setMode(+req.params.id, mode);
    if (!conv) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, conversation: conv });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
