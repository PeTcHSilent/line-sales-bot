-- LINE Sales Bot — Migration v7
-- แบ่งกลุ่มพนักงาน (งานใหม่ / งานต่ออายุ) + lead_type

BEGIN;

-- ── 1. เพิ่ม job_type ใน admin_users ──────────────────────────
--    new_business = รับเฉพาะงานใหม่
--    renewal      = รับเฉพาะงานต่ออายุ
--    both         = รับทั้งสองประเภท (default)
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS job_type VARCHAR(20) NOT NULL DEFAULT 'both'
    CONSTRAINT chk_job_type CHECK (job_type IN ('new_business', 'renewal', 'both'));

COMMENT ON COLUMN admin_users.job_type IS
  '''new_business'' = งานใหม่ | ''renewal'' = งานต่ออายุ | ''both'' = ทั้งสองประเภท';

-- ── 2. เพิ่ม lead_type ใน sales_leads ─────────────────────────
--    new     = ลูกค้าใหม่
--    renewal = ลูกค้าต่ออายุ / ต่อประกัน
ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS lead_type VARCHAR(20) NOT NULL DEFAULT 'new'
    CONSTRAINT chk_lead_type CHECK (lead_type IN ('new', 'renewal'));

COMMENT ON COLUMN sales_leads.lead_type IS
  '''new'' = ลูกค้าใหม่ | ''renewal'' = ต่ออายุ/ต่อประกัน';

-- ── 3. Index ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_users_job_type ON admin_users(job_type);
CREATE INDEX IF NOT EXISTS idx_sales_leads_type     ON sales_leads(lead_type);

COMMIT;
