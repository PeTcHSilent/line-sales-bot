-- LINE Sales Bot — Migration v3
-- เพิ่มประเภทลูกค้า: ใหม่ vs ต่ออายุ

ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS customer_type    VARCHAR(20) DEFAULT 'new',    -- new|renewal
  ADD COLUMN IF NOT EXISTS policy_expiry_date DATE,                        -- วันหมดอายุกรมธรรม์ (สำหรับลูกค้าต่ออายุ)
  ADD COLUMN IF NOT EXISTS current_insurer  VARCHAR(100);                  -- บริษัทประกันเดิม (สำหรับลูกค้าต่ออายุ)

-- Index สำหรับ filter
CREATE INDEX IF NOT EXISTS idx_leads_customer_type ON sales_leads(customer_type);
CREATE INDEX IF NOT EXISTS idx_leads_expiry        ON sales_leads(policy_expiry_date);
