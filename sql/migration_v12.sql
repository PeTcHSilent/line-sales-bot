-- migration_v12.sql
-- Follow-up Scheduler: ตั้งนัดติดตามลูกค้า

CREATE TABLE IF NOT EXISTS follow_ups (
  id              SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  assigned_to     INT REFERENCES admin_users(id) ON DELETE SET NULL,
  due_date        DATE NOT NULL,
  note            TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending | done | cancelled
  created_by      INT REFERENCES admin_users(id) ON DELETE SET NULL,
  notified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_conv ON follow_ups(conversation_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due  ON follow_ups(due_date) WHERE status = 'pending';
