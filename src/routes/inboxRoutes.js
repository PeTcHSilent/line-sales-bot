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
 * GET  /api/inbox/image-proxy      — proxy LINE image (requires ?url= &t=JWT)
 */

const express    = require('express');
const jwt        = require('jsonwebtoken');
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
    const { mode, channel, search, lead_type, assigned_to, limit = 60, offset = 0 } = req.query;
    const result = await inboxService.getConversations({
      mode, channel, search, lead_type, assigned_to, limit: +limit, offset: +offset,
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

// ── PATCH /api/inbox/:id/lead_type — new | renewal ──────────────
router.patch('/:id/lead_type', requireAuth, async (req, res) => {
  try {
    const { lead_type } = req.body;
    if (!['new', 'renewal'].includes(lead_type)) {
      return res.status(400).json({ success: false, error: 'lead_type must be new or renewal' });
    }
    const conv = await inboxService.setLeadType(+req.params.id, lead_type);
    if (!conv) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, conversation: conv });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PATCH /api/inbox/:id/transfer — โอนงานให้พนักงานอื่น ──────────
router.patch('/:id/transfer', requireAuth, async (req, res) => {
  try {
    const { new_assigned_to, note } = req.body;
    if (!new_assigned_to) return res.status(400).json({ success: false, error: 'new_assigned_to ต้องระบุ' });

    const conv = await inboxService.getConversation(+req.params.id);
    if (!conv) return res.status(404).json({ success: false, error: 'ไม่พบบทสนทนา' });

    // Assign
    const updated = await inboxService.setAssignedTo(+req.params.id, +new_assigned_to);

    // Save system message
    const db = require('../db');
    const staffRow = await db.query('SELECT display_name FROM admin_users WHERE id=$1', [+new_assigned_to]);
    const toName   = staffRow.rows[0]?.display_name || `User #${new_assigned_to}`;
    const fromName = req.user.display_name || req.user.username;
    const sysMsg   = note?.trim()
      ? `🔀 โอนงานจาก ${fromName} ไปยัง ${toName}\n📝 ${note.trim()}`
      : `🔀 โอนงานจาก ${fromName} ไปยัง ${toName}`;

    await inboxService.saveMessage(conv.id, 'out', 'system', sysMsg, 'ระบบ');

    res.json({ success: true, conversation: updated, to_name: toName });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PATCH /api/inbox/:id/assign — assign to staff ────────────────
router.patch('/:id/assign', requireAuth, async (req, res) => {
  try {
    const { user_id } = req.body; // null = unassign
    const conv = await inboxService.setAssignedTo(+req.params.id, user_id || null);
    if (!conv) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, conversation: conv });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/inbox/image-proxy?url=&t=JWT — proxy LINE image ────
// LINE image API requires Authorization header; browser <img> can't send it.
// We verify JWT via query param, then proxy the image with the channel token.
router.get('/image-proxy', async (req, res) => {
  try {
    const { url, t } = req.query;

    // Verify JWT (passed as query param since img tags can't set headers)
    if (!t) return res.status(401).send('Unauthorized');
    try {
      jwt.verify(t, process.env.JWT_SECRET);
    } catch (_) {
      return res.status(401).send('Unauthorized');
    }

    // Only allow LINE content URLs
    if (!url || !url.startsWith('https://api-data.line.me/')) {
      return res.status(400).send('Invalid URL');
    }

    const lineRes = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });

    if (!lineRes.ok) {
      console.error(`[image-proxy] LINE returned ${lineRes.status} for ${url}`);
      return res.status(lineRes.status).send('LINE fetch failed');
    }

    const contentType = lineRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const buf = await lineRes.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error('[image-proxy] error:', e.message);
    res.status(500).send('Proxy error');
  }
});

module.exports = router;
