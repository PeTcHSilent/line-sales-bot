-- migration_v14.sql
-- Customer Details — ข้อมูลส่วนตัว/รถ/กรมธรรม์ของลูกค้า

CREATE TABLE IF NOT EXISTS customer_details (
  id              SERIAL PRIMARY KEY,
  sender_id       VARCHAR(200) NOT NULL,
  channel         VARCHAR(50)  NOT NULL DEFAULT 'line',
  cust_name       VARCHAR(200),          -- ชื่อ-นามสกุล
  phone           VARCHAR(50),           -- เบอร์โทรศัพท์
  car_brand       VARCHAR(100),          -- ยี่ห้อรถ เช่น Toyota, Honda
  car_model       VARCHAR(100),          -- รุ่นรถ เช่น Camry, Civic
  car_year        VARCHAR(10),           -- ปีรถ (พ.ศ.) เช่น 2566
  license_plate   VARCHAR(50),           -- ทะเบียนรถ เช่น กข 1234
  coverage_start  DATE,                  -- วันเริ่มคุ้มครอง
  coverage_end    DATE,                  -- วันหมดอายุ (คำนวณ start + 1 ปี)
  extra_notes     TEXT,                  -- หมายเหตุเพิ่มเติม
  updated_by      INT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sender_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_customer_details_sender
  ON customer_details(sender_id, channel);

-- Index สำหรับแจ้งเตือนก่อนหมดอายุ
CREATE INDEX IF NOT EXISTS idx_customer_details_coverage_end
  ON customer_details(coverage_end) WHERE coverage_end IS NOT NULL;
