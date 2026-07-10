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
    const r = await db.query('SELECT id,username,display_name,line_user_id,is_active,role,created_at FROM admin_users ORDER BY id');
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
    const { display_name, role, is_active, line_user_id } = req.body;
    const sets = [];
    const vals = [];
    let idx = 1;
    if (display_name !== undefined) { sets.push(`display_name=$${idx++}`); vals.push(display_name); }
    if (role !== undefined && ['admin','staff'].includes(role)) { sets.push(`role=$${idx++}`); vals.push(role); }
    if (is_active !== undefined) { sets.push(`is_active=$${idx++}`); vals.push(is_active); }
    if (line_user_id !== undefined) { sets.push(`line_user_id=$${idx++}`); vals.push(line_user_id || null); }
    if (!sets.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    vals.push(req.params.id);
    const r = await db.query(
      `UPDATE admin_users SET ${sets.join(',')} WHERE id=$${idx} RETURNING id,username,display_name,role,line_user_id,is_active`,
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
