-- migration_v11.sql
-- Customer Notes + Broadcasts
-- run once on Railway postgres

-- ── Conversation Notes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_notes (
  id              SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  author_id       INT REFERENCES admin_users(id) ON DELETE SET NULL,
  author_name     VARCHAR(100),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_conv ON conversation_notes(conversation_id);

-- ── Broadcasts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcasts (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  message      TEXT NOT NULL,
  channel      VARCHAR(20)  NOT NULL DEFAULT 'line',
  filter_type  VARCHAR(20)  NOT NULL DEFAULT 'all',   -- all | lead_type | tag
  filter_value VARCHAR(100),                          -- 'new','renewal' or tag name
  sent_count   INT          NOT NULL DEFAULT 0,
  fail_count   INT          NOT NULL DEFAULT 0,
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | sending | done | failed
  created_by   INT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);
