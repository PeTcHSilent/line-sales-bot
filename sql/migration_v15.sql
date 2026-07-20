-- migration_v15.sql
-- เพิ่มคอลัมน์ renewal_last_notified ใน customer_details
-- ใช้ track วันที่ส่งแจ้งเตือนล่าสุด (ไม่ส่งซ้ำถ้าน้อยกว่า 7 วัน)

ALTER TABLE customer_details
  ADD COLUMN IF NOT EXISTS renewal_last_notified DATE;

COMMENT ON COLUMN customer_details.renewal_last_notified
  IS 'วันที่ส่งแจ้งเตือนต่ออายุล่าสุด — ไม่ส่งซ้ำถ้า < 7 วัน';
