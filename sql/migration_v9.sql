-- migration_v9.sql
-- เพิ่ม lead_type ใน inbox_conversations
-- ให้แบ่งกลุ่มแชทตามประเภทงาน (งานใหม่ / ต่ออายุ)

BEGIN;

-- ── 1. lead_type ใน inbox_conversations ─────────────────────────
--    new     = ลูกค้าใหม่ (default)
--    renewal = ลูกค้าต่ออายุ / ต่อประกัน
ALTER TABLE inbox_conversations
  ADD COLUMN IF NOT EXISTS lead_type VARCHAR(20) NOT NULL DEFAULT 'new'
    CONSTRAINT chk_conv_lead_type CHECK (lead_type IN ('new', 'renewal'));

COMMENT ON COLUMN inbox_conversations.lead_type IS
  '''new'' = ลูกค้าใหม่ | ''renewal'' = ต่ออายุ/ต่อประกัน';

-- ── 2. Index ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inbox_conv_lead_type   ON inbox_conversations(lead_type);
CREATE INDEX IF NOT EXISTS idx_inbox_conv_assigned_to ON inbox_conversations(assigned_to);

COMMIT;
