-- LINE Sales Bot — Migration v6
-- เชื่อมกับ HR System: sync พนักงาน (Sales/Admin) + วันหยุด

-- 1. เพิ่ม hr_employee_code และ department ใน admin_users
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS hr_employee_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS department       VARCHAR(50);

-- Unique index สำหรับ HR sync (NULL ไม่นับซ้ำ)
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_hr_code
  ON admin_users(hr_employee_code)
  WHERE hr_employee_code IS NOT NULL;

-- 2. ตาราง public_holidays — sync จาก HR Calendar
CREATE TABLE IF NOT EXISTS public_holidays (
  id   SERIAL      PRIMARY KEY,
  date DATE        NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  year INT         NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public_holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_year ON public_holidays(year);

-- 3. เก็บ metadata การ sync ไว้ใน system_settings
INSERT INTO system_settings (key, value) VALUES ('last_sync_at', 'never')
ON CONFLICT (key) DO NOTHING;
