'use strict';
/**
 * messengerService.js — Facebook Messenger integration
 * Webhook handler + send API
 *
 * Required env vars:
 *   FB_PAGE_ACCESS_TOKEN   — จาก Facebook Developer Console (Page Access Token)
 *   FB_VERIFY_TOKEN        — สตริงที่คุณกำหนดเอง ใช้ verify webhook
 */

const axios        = require('axios');
const inboxService = require('./inboxService');

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN      = process.env.FB_VERIFY_TOKEN || 'torkun_verify_token';

// ─────────────────────────────────────────────────────────────────
//  Send a text message to a Messenger user via PSID
// ─────────────────────────────────────────────────────────────────
async function sendMessage(psid, text) {
  if (!PAGE_ACCESS_TOKEN) {
    console.warn('[messenger] FB_PAGE_ACCESS_TOKEN is not set — cannot send message');
    return;
  }
  try {
    await axios.post(
      'https://graph.facebook.com/v19.0/me/messages',
      { recipient: { id: psid }, message: { text } },
      { params: { access_token: PAGE_ACCESS_TOKEN }, timeout: 10000 }
    );
  } catch (e) {
    const errMsg = e.response?.data?.error?.message || e.message;
    console.error('[messenger] sendMessage error:', errMsg);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Fetch Messenger user profile (name + profile_pic)
// ─────────────────────────────────────────────────────────────────
async function getUserProfile(psid) {
  if (!PAGE_ACCESS_TOKEN) return { name: 'Messenger User', pic: null };
  try {
    const r = await axios.get(`https://graph.facebook.com/${psid}`, {
      params: { fields: 'name,profile_pic', access_token: PAGE_ACCESS_TOKEN },
      timeout: 5000,
    });
    return { name: r.data.name || 'Messenger User', pic: r.data.profile_pic || null };
  } catch {
    return { name: 'Messenger User', pic: null };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Handle one incoming messaging event
// ─────────────────────────────────────────────────────────────────
async function handleIncomingMessage(psid, text) {
  // Get or create conversation (channel = 'messenger')
  const profile = await getUserProfile(psid);
  const conv    = await inboxService.getOrCreateConversation(
    'messenger', psid, profile.name, profile.pic
  );

  // Save customer message
  await inboxService.saveMessage(conv.id, 'in', 'customer', text, profile.name);

  // If in human mode, bot stays silent — staff replies via admin panel
  if (conv.mode === 'human') {
    console.log(`[messenger] human mode — no bot reply for ${psid}`);
    return;
  }

  // If resolved, optionally inform the customer
  if (conv.mode === 'resolved') {
    console.log(`[messenger] resolved conversation — no bot reply for ${psid}`);
    return;
  }

  // Bot auto-reply via salesBotService
  try {
    // Lazy require to avoid circular dependency
    const salesBotService = require('./salesBotService');
    const reply = await salesBotService.handleMessage(psid, profile.name, text);
    await sendMessage(psid, reply);
    await inboxService.saveMessage(conv.id, 'out', 'bot', reply, 'น้องต่อกัน 🐾');
  } catch (e) {
    console.error('[messenger] bot reply error:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
//  Process incoming webhook payload (POST /webhook/messenger)
// ─────────────────────────────────────────────────────────────────
async function handleWebhook(body) {
  if (body.object !== 'page') return;

  const entries = body.entry || [];
  for (const entry of entries) {
    for (const messaging of (entry.messaging || [])) {
      // Ignore echoes (messages sent by the page itself)
      if (messaging.message?.is_echo) continue;
      // Ignore read receipts / delivery / reactions
      if (!messaging.message?.text) continue;

      const psid = messaging.sender?.id;
      const text = messaging.message.text.trim();
      if (!psid || !text) continue;

      // Process async so webhook returns 200 immediately
      handleIncomingMessage(psid, text).catch(e =>
        console.error('[messenger] handleIncomingMessage error:', e.message)
      );
    }
  }
}

module.exports = {
  sendMessage,
  getUserProfile,
  handleWebhook,
  VERIFY_TOKEN,
};
