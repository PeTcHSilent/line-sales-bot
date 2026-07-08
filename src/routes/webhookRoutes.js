'use strict';
const express = require('express');
const line    = require('@line/bot-sdk');
const { dispatch } = require('../handlers/messageHandler');

const router = express.Router();

const lineConfig = {
  channelSecret:      process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// LINE Webhook — signature validation middleware
router.post(
  '/webhook',
  line.middleware(lineConfig),
  async (req, res) => {
    res.sendStatus(200); // ตอบ 200 ทันทีก่อน process
    const events = req.body?.events || [];
    await Promise.all(events.map(ev => dispatch(ev, client).catch(e => console.error('[webhook]', e.message))));
  }
);

module.exports = router;
