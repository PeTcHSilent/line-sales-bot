-- migration_v10.sql
-- Tags + Quick Replies
-- run once on Railway postgres

-- ── Tags master table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(50) UNIQUE NOT NULL,
  color      VARCHAR(20) NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Conversation ↔ Tag (M2M) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_tags (
  conversation_id INT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  tag_id          INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_tags_conv ON conversation_tags(conversation_id);

-- ── Quick Replies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_replies (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(100) NOT NULL,
  content    TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed default tags ──────────────────────────────────────────────
INSERT INTO tags (name, color) VALUES
  ('สนใจ',       '#16a34a'),
  ('รอติดตาม',   '#d97706'),
  ('Hot Lead',   '#dc2626'),
  ('ปิดแล้ว',   '#7c3aed'),
  ('ไม่สนใจ',   '#6b7280'),
  ('VIP',        '#0ea5e9')
ON CONFLICT (name) DO NOTHING;

-- ── Seed default quick replies ─────────────────────────────────────
INSERT INTO quick_replies (title, content, sort_order) VALUES
  ('ทักทาย',     'สวัสดีครับ/ค่ะ ยินดีให้บริการครับ/ค่ะ มีอะไรให้ช่วยได้บ้างครับ/ค่ะ?', 1),
  ('รอสักครู่',  'รอสักครู่นะครับ/ค่ะ กำลังตรวจสอบข้อมูลให้ค่ะ', 2),
  ('ขอเบอร์',    'ขอเบอร์โทรติดต่อกลับได้เลยนะครับ/ค่ะ เพื่อความสะดวกในการติดต่อ', 3),
  ('ส่งใบเสนอราคา', 'จะจัดทำใบเสนอราคาส่งให้ทางนี้เลยนะครับ/ค่ะ', 4),
  ('ติดตาม',     'สวัสดีครับ/ค่ะ ขอสอบถามว่าสนใจแผนประกันที่แนะนำไปก่อนหน้านี้อยู่ไหมครับ/ค่ะ?', 5),
  ('ขอบคุณ',     'ขอบคุณมากครับ/ค่ะ สำหรับความไว้วางใจ หากมีข้อสงสัยเพิ่มเติมทักมาได้เลยนะครับ/ค่ะ', 6)
ON CONFLICT DO NOTHING;
