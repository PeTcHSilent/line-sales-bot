-- LINE Sales Bot — Migration v4
-- เพิ่ม Operator Tracking: ติดตามว่าพนักงานคนไหนรับงานและปิดงาน

ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS assigned_operator_id    INTEGER,
  ADD COLUMN IF NOT EXISTS assigned_operator_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS closed_by_operator_id   INTEGER,
  ADD COLUMN IF NOT EXISTS closed_by_operator_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS closed_at               TIMESTAMPTZ;

-- Index สำหรับ filter/report ตาม operator
CREATE INDEX IF NOT EXISTS idx_leads_assigned_op ON sales_leads(assigned_operator_id);
CREATE INDEX IF NOT EXISTS idx_leads_closed_op   ON sales_leads(closed_by_operator_id);
