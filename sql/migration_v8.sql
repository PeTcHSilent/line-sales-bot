-- migration_v8.sql
-- Unified Inbox: รวม LINE OA + Facebook Messenger ใน Admin Panel เดียว
-- Bot ตอบอัตโนมัติ, พนักงาน Takeover ได้

BEGIN;

-- ─────────────────────────────────────────────────────────────────
--  inbox_conversations — หนึ่งแถว = หนึ่งผู้ใช้ต่อหนึ่ง channel
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id              SERIAL PRIMARY KEY,
  channel         VARCHAR(20)  NOT NULL CHECK (channel IN ('line', 'messenger')),
  sender_id       VARCHAR(200) NOT NULL,            -- LINE userId หรือ Messenger PSID
  display_name    VARCHAR(200),
  profile_pic     TEXT,
  mode            VARCHAR(20)  NOT NULL DEFAULT 'bot'
                    CHECK (mode IN ('bot', 'human', 'resolved')),
  assigned_to     INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  unread_count    INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (channel, sender_id)
);

-- ─────────────────────────────────────────────────────────────────
--  inbox_messages — ทุกข้อความในทุก conversation
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER      NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  direction       VARCHAR(10)  NOT NULL CHECK (direction IN ('in', 'out')),
  sender          VARCHAR(20)  NOT NULL CHECK (sender IN ('customer', 'bot', 'staff')),
  sender_name     VARCHAR(200),
  content         TEXT         NOT NULL,
  msg_type        VARCHAR(20)  NOT NULL DEFAULT 'text',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
--  Indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inbox_conv_channel_sender ON inbox_conversations(channel, sender_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conv_last_msg       ON inbox_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_conv_mode           ON inbox_conversations(mode);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_conv       ON inbox_messages(conversation_id, created_at);

COMMIT;
