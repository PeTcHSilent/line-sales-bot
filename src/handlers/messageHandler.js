'use strict';
const salesBotService = require('../services/salesBotService');

/**
 * handleFollow — ผู้ติดตามใหม่ → ส่ง Welcome Flex
 */
async function handleFollow(event, client) {
  try {
    const displayName = event.source?.userId
      ? (await client.getProfile(event.source.userId).catch(() => null))?.displayName || 'ลูกค้า'
      : 'ลูกค้า';

    const welcomeFlex = salesBotService.buildWelcomeFlex(displayName);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [welcomeFlex],
    });
  } catch (e) {
    console.error('[handler] handleFollow error:', e.message);
  }
}

/**
 * handleText — ส่งข้อความหา AI และตอบกลับ
 */
async function handleText(event, client) {
  try {
    const lineUserId  = event.source?.userId;
    const text        = event.message?.text?.trim();
    if (!lineUserId || !text) return;

    const displayName = (await client.getProfile(lineUserId).catch(() => null))?.displayName || 'ลูกค้า';
    const reply       = await salesBotService.handleMessage(lineUserId, displayName, text);

    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: reply }],
    });
  } catch (e) {
    console.error('[handler] handleText error:', e.message);
  }
}

/**
 * dispatch — router หลักสำหรับ LINE events
 */
async function dispatch(event, client) {
  switch (event.type) {
    case 'follow':  return handleFollow(event, client);
    case 'message':
      if (event.message?.type === 'text') return handleText(event, client);
      break;
    case 'unfollow':
      console.log('[handler] unfollow:', event.source?.userId);
      break;
    default:
      break;
  }
}

module.exports = { dispatch };
