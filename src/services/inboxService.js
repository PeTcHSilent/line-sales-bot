'use strict';
/**
 * inboxService.js — Unified Inbox (LINE + Messenger)
 * DB layer: inbox_conversations + inbox_messages
 */

const db = require('../db');

// ─────────────────────────────────────────────────────────────────
//  Get or create a conversation row
// ─────────────────────────────────────────────────────────────────
async function getOrCreateConversation(channel, senderId, displayName, profilePic = null) {
  const r = await db.query(`
    INSERT INTO inbox_conversations
      (channel, sender_id, display_name, profile_pic, last_message_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (channel, sender_id) DO UPDATE SET
      display_name    = COALESCE(EXCLUDED.display_name, inbox_conversations.display_name),
      profile_pic     = COALESCE(EXCLUDED.profile_pic,  inbox_conversations.profile_pic),
      updated_at      = NOW()
    RETURNING *
  `, [channel, senderId, displayName, profilePic]);
  return r.rows[0];
}

// ─────────────────────────────────────────────────────────────────
//  Get current mode ('bot' | 'human' | 'resolved')
// ─────────────────────────────────────────────────────────────────
async function getConversationMode(channel, senderId) {
  const r = await db.query(
    'SELECT mode FROM inbox_conversations WHERE channel=$1 AND sender_id=$2',
    [channel, senderId]
  );
  return r.rows[0]?.mode || 'bot';
}

// ─────────────────────────────────────────────────────────────────
//  Save a message and update conversation summary
// ─────────────────────────────────────────────────────────────────
async function saveMessage(convId, direction, sender, content, senderName = null, msgType = 'text') {
  const [msgResult] = await Promise.all([
    db.query(`
      INSERT INTO inbox_messages
        (conversation_id, direction, sender, content, sender_name, msg_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [convId, direction, sender, content, senderName, msgType]),

    db.query(`
      UPDATE inbox_conversations
      SET last_message     = LEFT($2, 200),
          last_message_at  = NOW(),
          updated_at       = NOW(),
          unread_count     = CASE WHEN $3 THEN unread_count + 1 ELSE unread_count END
      WHERE id = $1
    `, [convId, content, direction === 'in']),
  ]);
  return msgResult.rows[0];
}

// ─────────────────────────────────────────────────────────────────
//  List conversations (for admin panel left panel)
// ─────────────────────────────────────────────────────────────────
async function getConversations({ mode, channel, search, limit = 60, offset = 0 } = {}) {
  const params = [];
  const where  = [];

  if (mode && mode !== 'all') {
    params.push(mode); where.push(`mode = $${params.length}`);
  }
  if (channel) {
    params.push(channel); where.push(`channel = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`display_name ILIKE $${params.length}`);
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countParams = [...params];
  params.push(limit, offset);

  const [rows, cnt] = await Promise.all([
    db.query(
      `SELECT * FROM inbox_conversations ${whereStr} ORDER BY last_message_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    ),
    db.query(`SELECT COUNT(*) FROM inbox_conversations ${whereStr}`, countParams),
  ]);

  return { conversations: rows.rows, total: parseInt(cnt.rows[0].count) };
}

// ─────────────────────────────────────────────────────────────────
//  Get messages for one conversation (oldest → newest)
// ─────────────────────────────────────────────────────────────────
async function getMessages(convId, limit = 100, offset = 0) {
  const r = await db.query(`
    SELECT * FROM inbox_messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
    LIMIT $2 OFFSET $3
  `, [convId, limit, offset]);
  return r.rows;
}

// ─────────────────────────────────────────────────────────────────
//  Get a single conversation by id
// ─────────────────────────────────────────────────────────────────
async function getConversation(convId) {
  const r = await db.query('SELECT * FROM inbox_conversations WHERE id=$1', [convId]);
  return r.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────
//  Set mode
// ─────────────────────────────────────────────────────────────────
async function setMode(convId, mode) {
  const r = await db.query(`
    UPDATE inbox_conversations
    SET mode = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [convId, mode]);
  return r.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────
//  Mark conversation as read
// ─────────────────────────────────────────────────────────────────
async function markRead(convId) {
  await db.query(
    'UPDATE inbox_conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1',
    [convId]
  );
}

// ─────────────────────────────────────────────────────────────────
//  Poll: get messages newer than a timestamp
// ─────────────────────────────────────────────────────────────────
async function getMessagesSince(convId, since) {
  const r = await db.query(`
    SELECT * FROM inbox_messages
    WHERE conversation_id = $1 AND created_at > $2
    ORDER BY created_at ASC
  `, [convId, since]);
  return r.rows;
}

module.exports = {
  getOrCreateConversation,
  getConversationMode,
  saveMessage,
  getConversations,
  getMessages,
  getConversation,
  setMode,
  markRead,
  getMessagesSince,
};
