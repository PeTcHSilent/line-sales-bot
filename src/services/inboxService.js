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
//  List conversations (admin panel + staff page)
// ─────────────────────────────────────────────────────────────────
async function getConversations({ mode, channel, search, lead_type, assigned_to, limit = 60, offset = 0 } = {}) {
  const params = [];
  const where  = [];

  if (mode && mode !== 'all') {
    params.push(mode); where.push(`c.mode = $${params.length}`);
  }
  if (channel) {
    params.push(channel); where.push(`c.channel = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`c.display_name ILIKE $${params.length}`);
  }
  if (lead_type) {
    params.push(lead_type); where.push(`c.lead_type = $${params.length}`);
  }
  if (assigned_to) {
    params.push(+assigned_to); where.push(`c.assigned_to = $${params.length}`);
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const countParams = [...params];
  params.push(limit, offset);

  const [rows, cnt] = await Promise.all([
    db.query(`
      SELECT c.*,
             u.display_name AS assigned_name,
             u.username     AS assigned_username
      FROM inbox_conversations c
      LEFT JOIN admin_users u ON u.id = c.assigned_to
      ${whereStr}
      ORDER BY c.last_message_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `, params),
    db.query(`SELECT COUNT(*) FROM inbox_conversations c ${whereStr}`, countParams),
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
//  Auto-assign: find staff with matching job_type (fewest active convs)
// ─────────────────────────────────────────────────────────────────
async function autoAssign(convId, lead_type) {
  // Which job_type do we need?
  const neededJob = lead_type === 'renewal' ? 'renewal' : 'new_business';

  // Find active staff with matching job_type or 'both', fewest active convs
  const r = await db.query(`
    SELECT u.id,
           COUNT(c.id) AS active_count
    FROM admin_users u
    LEFT JOIN inbox_conversations c
      ON c.assigned_to = u.id AND c.mode IN ('bot','human')
    WHERE u.is_active = TRUE
      AND u.role IN ('staff','admin')
      AND (u.job_type = $1 OR u.job_type = 'both')
    GROUP BY u.id
    ORDER BY active_count ASC
    LIMIT 1
  `, [neededJob]);

  if (!r.rows[0]) return null;

  const userId = r.rows[0].id;
  const updated = await db.query(`
    UPDATE inbox_conversations
    SET assigned_to = $2, updated_at = NOW()
    WHERE id = $1 AND (assigned_to IS NULL)
    RETURNING *
  `, [convId, userId]);

  return updated.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────
//  Set lead_type (new | renewal) + auto-assign if unassigned
// ─────────────────────────────────────────────────────────────────
async function setLeadType(convId, lead_type) {
  const r = await db.query(`
    UPDATE inbox_conversations
    SET lead_type = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [convId, lead_type]);

  const conv = r.rows[0] || null;

  // Auto-assign if no one assigned yet
  if (conv && !conv.assigned_to) {
    await autoAssign(convId, lead_type);
  }

  return conv;
}

// ─────────────────────────────────────────────────────────────────
//  Assign conversation to a staff member (or null to unassign)
// ─────────────────────────────────────────────────────────────────
async function setAssignedTo(convId, userId) {
  const r = await db.query(`
    UPDATE inbox_conversations
    SET assigned_to = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [convId, userId || null]);
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
  setLeadType,
  setAssignedTo,
  markRead,
  getMessagesSince,
  autoAssign,
};
