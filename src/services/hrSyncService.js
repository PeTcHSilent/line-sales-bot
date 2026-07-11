'use strict';
/**
 * hrSyncService.js — ดึงข้อมูลพนักงาน (Sales/Admin) และวันหยุด
 * จาก line-hr-system มาเก็บไว้ใน Sales Bot DB
 *
 * Env vars ที่ต้องตั้งใน Railway (Sales Bot):
 *   HR_SYSTEM_URL   — https://[hr-project].railway.app
 *   HR_SYNC_SECRET  — shared secret (ตั้งค่าเดียวกันทั้งสองระบบ)
 */

const axios = require('axios');
const bcrypt = require('bcryptjs');
const db = require('../db');

const HR_URL    = process.env.HR_SYSTEM_URL;
const SYNC_KEY  = process.env.HR_SYNC_SECRET;

// ─────────────────────────────────────────────────────────────────
//  syncEmployees — ดึง Sales + Admin จาก HR → upsert admin_users
// ─────────────────────────────────────────────────────────────────
async function syncEmployees() {
  if (!HR_URL) throw new Error('HR_SYSTEM_URL ยังไม่ได้ตั้งค่า');

  const resp = await axios.get(`${HR_URL}/api/employee/notify-targets`, {
    headers: { 'x-sync-key': SYNC_KEY || '' },
    timeout: 15000,
  });

  const employees = resp.data?.employees || [];
  let synced = 0;

  for (const emp of employees) {
    // Admin dept → role='admin' (แจ้งตลอด 24ชม)
    // Sales dept → role='staff' (แจ้งเฉพาะเวลางาน)
    const role = emp.department_name === 'Admin' ? 'admin' : 'staff';
    const username = emp.employee_code.toLowerCase(); // เช่น tk0002

    // placeholder hash ที่ไม่มีใครรู้ — HR users ล็อกอิน Sales Bot ไม่ได้
    let placeholderHash;
    const existing = await db.query(
      'SELECT password_hash FROM admin_users WHERE hr_employee_code = $1',
      [emp.employee_code]
    );
    if (existing.rows[0]) {
      placeholderHash = existing.rows[0].password_hash; // เก็บ hash เดิม
    } else {
      placeholderHash = await bcrypt.hash(emp.employee_code + '_hr_sync_' + Date.now(), 10);
    }

    await db.query(`
      INSERT INTO admin_users
        (username, password_hash, display_name, line_user_id, hr_employee_code, department, role, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (hr_employee_code) WHERE hr_employee_code IS NOT NULL DO UPDATE SET
        display_name      = EXCLUDED.display_name,
        line_user_id      = CASE
                              WHEN admin_users.line_user_id IS NOT NULL THEN admin_users.line_user_id
                              ELSE EXCLUDED.line_user_id
                            END,
        department        = EXCLUDED.department,
        role              = EXCLUDED.role,
        is_active         = EXCLUDED.is_active
    `, [
      username,
      placeholderHash,
      emp.name,
      emp.line_user_id || null,
      emp.employee_code,
      emp.department_name,
      role,
      emp.is_active !== false,
    ]);

    synced++;
  }

  return { synced, total: employees.length };
}

// ─────────────────────────────────────────────────────────────────
//  syncHolidays — ดึงวันหยุดจาก HR Calendar → upsert public_holidays
// ─────────────────────────────────────────────────────────────────
async function syncHolidays() {
  if (!HR_URL) throw new Error('HR_SYSTEM_URL ยังไม่ได้ตั้งค่า');

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1]; // sync ปีนี้ + ปีหน้า
  let synced = 0;

  for (const year of years) {
    try {
      const resp = await axios.get(`${HR_URL}/api/holidays?year=${year}`, {
        timeout: 10000,
      });
      const holidays = resp.data?.holidays || [];

      for (const h of holidays) {
        await db.query(`
          INSERT INTO public_holidays (date, name, year)
          VALUES ($1, $2, $3)
          ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name
        `, [h.date, h.name, year]);
        synced++;
      }
    } catch (e) {
      // ปีหน้าอาจยังไม่มีข้อมูล — ไม่ error
      console.warn(`[hrSync] holidays ${year}:`, e.message);
    }
  }

  return { synced };
}

// ─────────────────────────────────────────────────────────────────
//  runSync — รัน sync ทั้งสอง + อัปเดต last_sync_at
// ─────────────────────────────────────────────────────────────────
async function runSync() {
  const result = { employees: null, holidays: null, error: null, synced_at: null };

  try {
    result.employees = await syncEmployees();
  } catch (e) {
    console.error('[hrSync] syncEmployees error:', e.message);
    result.error = e.message;
  }

  try {
    result.holidays = await syncHolidays();
  } catch (e) {
    console.error('[hrSync] syncHolidays error:', e.message);
    if (!result.error) result.error = e.message;
  }

  const now = new Date().toISOString();
  result.synced_at = now;

  try {
    await db.query(
      "INSERT INTO system_settings (key,value) VALUES ('last_sync_at',$1) ON CONFLICT (key) DO UPDATE SET value=$1",
      [now]
    );
  } catch { /* ถ้าตารางยังไม่มี ignore */ }

  console.log('[hrSync] done:', JSON.stringify(result));
  return result;
}

// ─────────────────────────────────────────────────────────────────
//  startAutoSync — รัน sync ตอน startup + ทุก 6 ชั่วโมง
// ─────────────────────────────────────────────────────────────────
function startAutoSync() {
  if (!HR_URL) {
    console.log('[hrSync] HR_SYSTEM_URL ไม่ได้ตั้งค่า — ข้าม auto sync');
    return;
  }

  // รันครั้งแรกหลัง startup 5 วินาที
  setTimeout(() => runSync().catch(e => console.error('[hrSync] startup sync:', e.message)), 5000);

  // sync ทุก 6 ชั่วโมง
  setInterval(() => runSync().catch(e => console.error('[hrSync] scheduled sync:', e.message)), 6 * 60 * 60 * 1000);
}

module.exports = { syncEmployees, syncHolidays, runSync, startAutoSync };
