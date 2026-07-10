-- LINE Sales Bot — Migration v5
-- เพิ่ม role สำหรับจำแนก admin/staff + system_settings สำหรับตั้งค่าเวลาแจ้งเตือน

-- 1. เพิ่ม role ให้ admin_users (admin = แจ้งเตือนตลอด, staff = แจ้งเตือนเฉพาะเวลางาน)
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'staff';

-- กำหนด user แรก (id=1) เป็น admin โดยอัตโนมัติ
UPDATE admin_users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM admin_users);

-- 2. สร้างตาราง system_settings สำหรับเก็บค่าตั้งค่าระบบ
CREATE TABLE IF NOT EXISTS system_settings (
  key   VARCHAR(50) PRIMARY KEY,
  value TEXT        NOT NULL
);

-- ค่าเริ่มต้น: เวลางาน 08:00–18:00 วันจันทร์–ศุกร์
INSERT INTO system_settings (key, value) VALUES
  ('work_start', '08:00'),
  ('work_end',   '18:00'),
  ('work_days',  '1,2,3,4,5')
ON CONFLICT (key) DO NOTHING;
