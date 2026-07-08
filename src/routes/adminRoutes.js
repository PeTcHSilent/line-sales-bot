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
    const r = await db.query('SELECT id,username,display_name,line_user_id,is_active,created_at FROM admin_users ORDER BY id');
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

// ── POST /api/admin/users ── สร้าง admin ใหม่ ──────────────────
router.post('/users', requireAuth, async (req, res) => {
  try {
    const { username, password, display_name } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Missing fields' });

    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      'INSERT INTO admin_users (username,password_hash,display_name) VALUES ($1,$2,$3) RETURNING id,username,display_name',
      [username, hash, display_name || username]
    );
    res.status(201).json({ success: true, user: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'Username already exists' });
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

module.exports = router;
