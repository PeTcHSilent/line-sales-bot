-- migration_v13.sql
-- Keyword Auto-reply Rules

CREATE TABLE IF NOT EXISTS keyword_rules (
  id           SERIAL PRIMARY KEY,
  keyword      VARCHAR(200) NOT NULL,
  response     TEXT NOT NULL,
  match_type   VARCHAR(10) NOT NULL DEFAULT 'contains',  -- contains | exact
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  priority     INT NOT NULL DEFAULT 0,
  created_by   INT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_rules_active ON keyword_rules(is_active) WHERE is_active = TRUE;

-- OOH + SLA settings (insert if not exist)
INSERT INTO system_settings (key, value) VALUES
  ('ooh_enabled',   'false'),
  ('ooh_message',   'ขอบคุณที่ติดต่อมาครับ 😊 ขณะนี้อยู่นอกเวลาทำการ ทีมงานจะติดต่อกลับในเวลาทำการถัดไปนะครับ'),
  ('sla_minutes',   '30'),
  ('sla_supervisor_line_id', '')
ON CONFLICT (key) DO NOTHING;
