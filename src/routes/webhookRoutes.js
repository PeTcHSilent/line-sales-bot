'use strict';
const express      = require('express');
const line         = require('@line/bot-sdk');
const { dispatch } = require('../handlers/messageHandler');
const messengerSvc = require('../services/messengerService');

const router = express.Router();

const lineConfig = {
  channelSecret:      process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// ── LINE Webhook — signature validation middleware ───────────────
router.post(
  '/webhook',
  line.middleware(lineConfig),
  async (req, res) => {
    res.sendStatus(200); // ตอบ 200 ทันทีก่อน process
    const events = req.body?.events || [];
    await Promise.all(
      events.map(ev => dispatch(ev, lineClient).catch(e => console.error('[webhook:line]', e.message)))
    );
  }
);

// ── Facebook Messenger Webhook — Verification (GET) ─────────────
router.get('/webhook/messenger', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === messengerSvc.VERIFY_TOKEN) {
    console.log('[webhook:messenger] Verified successfully');
    res.status(200).send(challenge);
  } else {
    console.warn('[webhook:messenger] Verification failed — check FB_VERIFY_TOKEN');
    res.sendStatus(403);
  }
});

// ── Facebook Messenger Webhook — Events (POST) ──────────────────
router.post(
  '/webhook/messenger',
  express.json(),        // Messenger ส่ง JSON (ไม่ต้อง raw body)
  async (req, res) => {
    res.sendStatus(200); // ตอบ 200 ทันทีก่อน process
    messengerSvc.handleWebhook(req.body).catch(e =>
      console.error('[webhook:messenger] handleWebhook error:', e.message)
    );
  }
);

module.exports = router;
