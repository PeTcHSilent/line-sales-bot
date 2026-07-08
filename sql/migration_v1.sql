-- LINE Sales Bot — Database Migration v1
-- Run once on new PostgreSQL instance

-- ── Admin Users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  display_name  VARCHAR(200),
  line_user_id  VARCHAR(100),          -- สำหรับรับแจ้งเตือน
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sales Leads ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_leads (
  id                 SERIAL PRIMARY KEY,
  line_user_id       VARCHAR(100) NOT NULL UNIQUE,
  line_display_name  VARCHAR(200),
  customer_name      VARCHAR(200),
  phone              VARCHAR(20),
  car_brand          VARCHAR(100),
  car_model          VARCHAR(100),
  car_year           VARCHAR(10),
  insurance_type     VARCHAR(20),    -- type1|type2|type2+|type3|type3+|compulsory
  interest_level     VARCHAR(20) DEFAULT 'warm',  -- hot|warm|cold
  status             VARCHAR(30) DEFAULT 'new',   -- new|contacted|quoted|closed|lost
  notes              TEXT,
  assigned_to        VARCHAR(100),
  notified_at        TIMESTAMPTZ,    -- วันที่แจ้ง admin ล่าสุด
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sales Conversations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_conversations (
  id            SERIAL PRIMARY KEY,
  line_user_id  VARCHAR(100) NOT NULL UNIQUE,
  display_name  VARCHAR(200),
  history       JSONB NOT NULL DEFAULT '[]',
  message_count INT NOT NULL DEFAULT 0,
  lead_captured BOOLEAN NOT NULL DEFAULT FALSE,
  last_message  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_status       ON sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_interest     ON sales_leads(interest_level);
CREATE INDEX IF NOT EXISTS idx_leads_created      ON sales_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone        ON sales_leads(phone);
CREATE INDEX IF NOT EXISTS idx_conv_line_user     ON sales_conversations(line_user_id);

-- ── Default Admin ────────────────────────────────────────────────
-- password: admin1234 (bcrypt) — เปลี่ยนทันทีหลัง deploy
INSERT INTO admin_users (username, password_hash, display_name)
VALUES ('admin', '$2b$10$rQnKZmZ8K.Nq3lVnVqT9OeL9N9FQ1mX1c5v5oV5hY5lZ5mX5nQ5pO', 'Admin')
ON CONFLICT (username) DO NOTHING;
