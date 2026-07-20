'use strict';
/**
 * inboxRoutes.js — REST API สำหรับ Unified Inbox
 *
 * GET  /api/inbox                  — list conversations
 * GET  /api/inbox/:id              — get one conversation
 * GET  /api/inbox/:id/messages     — get messages (+ mark read)
 * GET  /api/inbox/:id/poll?since=  — poll new messages
 * POST /api/inbox/:id/reply        — staff reply text (push to LINE or Messenger)
 * POST /api/inbox/:id/reply-image  — staff reply with image (LINE only)
 * PATCH /api/inbox/:id/mode        — set mode: bot | human | resolved
 * GET  /api/inbox/image-proxy      — proxy LINE image (requires ?url= &t=JWT)
 */

const express    = require('express');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const path       = require('path');
const line       = require('@line/bot-sdk');
const { requireAuth } = require('../middleware/auth');
const inboxService    = require('../services/inboxService');
const messengerSvc    = require('../services/messengerService');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../public/uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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

// ── GET /api/inbox/image-proxy?url=&t=JWT&dl=1&fn=filename ──────
// MUST be before /:id wildcard — otherwise Express matches "image-proxy" as an :id
// LINE image/file API requires Authorization header; browser <img> / <a> can't send it.
// dl=1  → force download (Content-Disposition: attachment)
// fn=   → custom filename for download
router.get('/image-proxy', async (req, res) => {
  try {
    const { url, t, dl, fn } = req.query;

    // Verify JWT (passed as query param since img/a tags can't set headers)
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

    const contentType = lineRes.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // dl=1 → force download with optional filename
    if (dl === '1') {
      const safeFilename = fn
        ? encodeURIComponent(fn)
        : contentType.startsWith('image/') ? 'image.jpg' : 'file';
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);
    }

    const buf = await lineRes.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error('[image-proxy] error:', e.message);
    res.status(500).send('Proxy error');
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

// ── POST /api/inbox/:id/reply-image — staff ส่งรูปให้ลูกค้า ──────
// Body: { image_base64, filename, mime_type }
// ต้องการ APP_URL env หรือใช้ req.get('host') เพื่อสร้าง public URL
router.post('/:id/reply-image', requireAuth, async (req, res) => {
  try {
    const { image_base64, filename, mime_type } = req.body;
    if (!image_base64) return res.status(400).json({ success: false, error: 'image_base64 required' });

    // Validate MIME
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(mime_type)) {
      return res.status(400).json({ success: false, error: 'รองรับเฉพาะ JPEG, PNG, GIF, WebP' });
    }

    // Validate size (base64 → ~75% of original; 8MB original ≈ ~10.7MB base64)
    if (image_base64.length > 10_700_000) {
      return res.status(400).json({ success: false, error: 'ไฟล์ใหญ่เกิน 8MB' });
    }

    const conv = await inboxService.getConversation(+req.params.id);
    if (!conv) return res.status(404).json({ success: false, error: 'ไม่พบบทสนทนา' });

    // Only LINE supports image push (Messenger needs different flow)
    if (conv.channel !== 'line') {
      return res.status(400).json({ success: false, error: 'รองรับเฉพาะ LINE ในขณะนี้' });
    }

    // Save image to disk
    const ext     = mime_type.split('/')[1].replace('jpeg', 'jpg');
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(filePath, Buffer.from(image_base64, 'base64'));

    // Build public URL — LINE must be able to fetch it
    const appUrl   = process.env.APP_URL || `https://${req.get('host')}`;
    const imageUrl = `${appUrl}/uploads/${safeName}`;

    // Push image to LINE customer
    const lc = getLineClient();
    await lc.pushMessage({
      to: conv.sender_id,
      messages: [{
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl:    imageUrl,
      }],
    });

    // Save to inbox
    const staffName = req.user.display_name || req.user.username;
    const msg = await inboxService.saveMessage(
      conv.id, 'out', 'staff', imageUrl, staffName, 'image'
    );

    res.json({ success: true, message: msg, url: imageUrl });
  } catch (e) {
    console.error('[inbox] POST reply-image:', e.message);
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

module.exports = router;
