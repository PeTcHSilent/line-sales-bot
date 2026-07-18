'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/admin/login ───────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, error: 'Missing credentials' });

    const r = await db.query(
      'SELECT * FROM admin_users WHERE username=$1 AND is_active=TRUE',
      [username]
    );
    const user = r.rows[0];
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, display_name: user.display_name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ success: true, token, display_name: user.display_name });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/admin/me ───────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── GET /api/admin/users ────────────────────────────────────────
router.get('/users', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT id,username,display_name,line_user_id,is_active,role,job_type,created_at FROM admin_users ORDER BY id');
    res.json({ success: true, users: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PATCH /api/admin/users/:id/line ── บันทึก LINE User ID ─────
router.patch('/users/:id/line', requireAuth, async (req, res) => {
  try {
    const { line_user_id } = req.body;
    const r = await db.query(
      'UPDATE admin_users SET line_user_id=$1 WHERE id=$2 RETURNING id,username,display_name,line_user_id',
      [line_user_id || null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/admin/users ── สร้าง user ใหม่ ───────────────────
router.post('/users', requireAuth, async (req, res) => {
  try {
    const { username, password, display_name, role } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Missing fields' });

    const hash = await bcrypt.hash(password, 10);
    const validRole = ['admin', 'staff'].includes(role) ? role : 'staff';
    const r = await db.query(
      'INSERT INTO admin_users (username,password_hash,display_name,role) VALUES ($1,$2,$3,$4) RETURNING id,username,display_name,role,line_user_id,is_active',
      [username, hash, display_name || username, validRole]
    );
    res.status(201).json({ success: true, user: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'Username already exists' });
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PATCH /api/admin/users/:id ── แก้ไขข้อมูลพนักงาน ───────────
router.patch('/users/:id', requireAuth, async (req, res) => {
  try {
    const { display_name, role, is_active, line_user_id, job_type } = req.body;
    const sets = [];
    const vals = [];
    let idx = 1;
    if (display_name !== undefined) { sets.push(`display_name=$${idx++}`); vals.push(display_name); }
    if (role !== undefined && ['admin','staff'].includes(role)) { sets.push(`role=$${idx++}`); vals.push(role); }
    if (is_active !== undefined) { sets.push(`is_active=$${idx++}`); vals.push(is_active); }
    if (line_user_id !== undefined) { sets.push(`line_user_id=$${idx++}`); vals.push(line_user_id || null); }
    if (job_type !== undefined && ['new_business','renewal','both'].includes(job_type)) { sets.push(`job_type=$${idx++}`); vals.push(job_type); }
    if (!sets.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    vals.push(req.params.id);
    const r = await db.query(
      `UPDATE admin_users SET ${sets.join(',')} WHERE id=$${idx} RETURNING id,username,display_name,role,line_user_id,is_active,job_type`,
      vals
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PATCH /api/admin/users/:id/password ────────────────────────
router.patch('/users/:id/password', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, error: 'Missing password' });
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE admin_users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/admin/notify-debug ── ตรวจสอบ notify recipients ────
router.get('/notify-debug', requireAuth, async (req, res) => {
  try {
    // ดึงทุก user พร้อม department เพื่อ debug
    const all = await db.query(
      'SELECT id,username,display_name,line_user_id,is_active,role,department,hr_employee_code FROM admin_users ORDER BY id'
    );
    // ดูว่าตอนนี้ inWorkingHours หรือไม่
    const now = new Date();
    const bkk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const day  = bkk.getDay();
    const hhmm = `${String(bkk.getHours()).padStart(2,'0')}:${String(bkk.getMinutes()).padStart(2,'0')}`;
    const cfg = await db.query("SELECT key,value FROM system_settings WHERE key IN ('work_start','work_end','work_days')");
    const s = {};
    cfg.rows.forEach(r => { s[r.key] = r.value; });
    const workDays = (s.work_days || '1,2,3,4,5').split(',').map(Number);
    const inHours  = workDays.includes(day) && hhmm >= (s.work_start||'08:00') && hhmm < (s.work_end||'18:00');

    // recipients ที่จะได้รับ notification จริง
    const recipientsQuery = inHours
      ? `SELECT id,username,display_name,line_user_id,department,role FROM admin_users WHERE line_user_id IS NOT NULL AND is_active=TRUE AND (department IN ('Sales','Admin') OR role='admin' OR department IS NULL)`
      : `SELECT id,username,display_name,line_user_id,department,role FROM admin_users WHERE line_user_id IS NOT NULL AND is_active=TRUE AND role='admin'`;
    const recipients = await db.query(recipientsQuery);

    res.json({
      bkk_time: hhmm,
      day_of_week: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day],
      in_working_hours: inHours,
      work_settings: s,
      total_users: all.rows.length,
      users_with_line_id: all.rows.filter(r => r.line_user_id).length,
      notify_recipients_count: recipients.rows.length,
      all_users: all.rows.map(r => ({
        ...r,
        line_user_id: r.line_user_id ? r.line_user_id.slice(0,8)+'...' : null,  // ซ่อนบางส่วน
        has_line_id: !!r.line_user_id,
      })),
      notify_recipients: recipients.rows.map(r => ({
        ...r,
        line_user_id: r.line_user_id ? r.line_user_id.slice(0,8)+'...' : null,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/admin/test-notify ── ส่ง test notification ─────────
router.post('/test-notify', requireAuth, async (req, res) => {
  try {
    const line = require('@line/bot-sdk');
    const lineClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    });

    // recipients ปัจจุบัน
    const now = new Date();
    const bkk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const day  = bkk.getDay();
    const hhmm = `${String(bkk.getHours()).padStart(2,'0')}:${String(bkk.getMinutes()).padStart(2,'0')}`;
    const cfg  = await db.query("SELECT key,value FROM system_settings WHERE key IN ('work_start','work_end','work_days')");
    const s = {};
    cfg.rows.forEach(r => { s[r.key] = r.value; });
    const workDays = (s.work_days || '1,2,3,4,5').split(',').map(Number);
    const inHours  = workDays.includes(day) && hhmm >= (s.work_start||'08:00') && hhmm < (s.work_end||'18:00');

    const q = inHours
      ? `SELECT line_user_id,display_name FROM admin_users WHERE line_user_id IS NOT NULL AND is_active=TRUE AND (department IN ('Sales','Admin') OR role='admin' OR department IS NULL)`
      : `SELECT line_user_id,display_name FROM admin_users WHERE line_user_id IS NOT NULL AND is_active=TRUE AND role='admin'`;
    const recipients = await db.query(q);

    if (!recipients.rows.length) {
      return res.json({ success: false, error: 'ไม่มี recipient — กรุณาตั้ง line_user_id ใน admin_users ก่อน', in_working_hours: inHours });
    }

    const results = [];
    for (const r of recipients.rows) {
      // ตรวจ format ก่อน: LINE user ID ต้องขึ้นต้นด้วย U ตามด้วย 32 hex chars (33 chars รวม)
      const idFormat = r.line_user_id
        ? (r.line_user_id.match(/^U[0-9a-f]{32}$/) ? '✅ valid' : `⚠️ รูปแบบผิด (${r.line_user_id.length} chars, ขึ้นต้น "${r.line_user_id.slice(0,4)}")`)
        : '❌ null';
      try {
        await lineClient.pushMessage({
          to: r.line_user_id,
          messages: [{ type: 'text', text: `🔔 ทดสอบการแจ้งเตือน Sales Bot\nผู้รับ: ${r.display_name}\nเวลา: ${hhmm} (${inHours ? 'ในเวลางาน' : 'นอกเวลางาน'})\n✅ ระบบแจ้งเตือนทำงานปกติ` }],
        });
        results.push({ display_name: r.display_name, status: 'sent', id_format: idFormat });
      } catch (e) {
        // ดึง LINE API error body จริงๆ
        const lineErr = e?.response?.data || e?.originalError?.response?.data || e?.data || null;
        results.push({
          display_name: r.display_name,
          status: 'error',
          error: e.message,
          line_api_error: lineErr,       // body จาก LINE API เช่น {message:"...",details:[]}
          id_format: idFormat,
          id_preview: r.line_user_id?.slice(0, 10) + '...',
        });
      }
    }
    res.json({ success: true, sent_to: results.length, results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/admin/settings ── ดึงค่าตั้งค่าระบบ ───────────────
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT key, value FROM system_settings');
    const settings = {};
    r.rows.forEach(row => { settings[row.key] = row.value; });
    res.json({ success: true, settings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PUT /api/admin/settings ── บันทึกค่าตั้งค่าระบบ ────────────
router.put('/settings', requireAuth, async (req, res) => {
  try {
    const allowed = ['work_start', 'work_end', 'work_days'];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ success: false, error: 'No valid settings' });

    await Promise.all(entries.map(([k, v]) =>
      db.query(
        'INSERT INTO system_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
        [k, v]
      )
    ));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
