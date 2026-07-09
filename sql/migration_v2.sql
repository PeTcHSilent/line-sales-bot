-- LINE Sales Bot — Migration v2
-- เพิ่ม api_usage_logs สำหรับติดตาม token และค่าใช้จ่าย Claude API

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id              SERIAL PRIMARY KEY,
  line_user_id    VARCHAR(100),                    -- ผู้ใช้ที่ทำให้เกิด API call
  display_name    VARCHAR(200),
  model           VARCHAR(100) NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  input_tokens    INT NOT NULL DEFAULT 0,
  output_tokens   INT NOT NULL DEFAULT 0,
  total_tokens    INT GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  -- ราคา Claude Haiku: input $0.80/1M, output $4.00/1M
  input_cost_usd  NUMERIC(12,8) GENERATED ALWAYS AS (input_tokens  * 0.0000008) STORED,
  output_cost_usd NUMERIC(12,8) GENERATED ALWAYS AS (output_tokens * 0.000004)  STORED,
  total_cost_usd  NUMERIC(12,8) GENERATED ALWAYS AS (input_tokens * 0.0000008 + output_tokens * 0.000004) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
-- หมายเหตุ: ไม่ใช้ DATE(created_at) ใน index เพราะ DATE(timestamptz) ไม่ใช่ IMMUTABLE ใน PostgreSQL
CREATE INDEX IF NOT EXISTS idx_usage_created     ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_line_user   ON api_usage_logs(line_user_id);

-- View: สรุปรายวัน
CREATE OR REPLACE VIEW usage_daily AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Bangkok')  AS date,
  COUNT(*)                                       AS api_calls,
  SUM(input_tokens)                              AS input_tokens,
  SUM(output_tokens)                             AS output_tokens,
  SUM(total_tokens)                              AS total_tokens,
  SUM(total_cost_usd)                            AS total_cost_usd,
  SUM(total_cost_usd) * 35                       AS total_cost_thb   -- แปลงเป็น THB (rate ~35)
FROM api_usage_logs
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Bangkok')
ORDER BY date DESC;

-- View: สรุปรายเดือน
CREATE OR REPLACE VIEW usage_monthly AS
SELECT
  TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS month,
  COUNT(*)                                                     AS api_calls,
  SUM(input_tokens)                                            AS input_tokens,
  SUM(output_tokens)                                           AS output_tokens,
  SUM(total_tokens)                                            AS total_tokens,
  SUM(total_cost_usd)                                          AS total_cost_usd,
  SUM(total_cost_usd) * 35                                     AS total_cost_thb
FROM api_usage_logs
GROUP BY TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')
ORDER BY month DESC;
