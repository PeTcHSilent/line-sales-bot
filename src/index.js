'use strict';
require('dotenv').config();

const express    = require('express');
const path       = require('path');
const webhookRoutes = require('./routes/webhookRoutes');
const leadsRoutes   = require('./routes/leadsRoutes');
const adminRoutes   = require('./routes/adminRoutes');
const usageRoutes   = require('./routes/usageRoutes');
const syncRoutes    = require('./routes/syncRoutes');
const inboxRoutes        = require('./routes/inboxRoutes');
const tagsRoutes         = require('./routes/tagsRoutes');
const quickRepliesRoutes = require('./routes/quickRepliesRoutes');
const hrSync        = require('./services/hrSyncService');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Body parsing for /api routes ─────────────────────────────────
app.use('/api', express.json());

// ── Health check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── LINE Webhook + Facebook Messenger Webhook ────────────────────
// (Messenger GET/POST /webhook/messenger uses express.json() inline)
app.use('/', webhookRoutes);

// ── REST API ─────────────────────────────────────────────────────
app.use('/api/leads',  leadsRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/usage',  usageRoutes);
app.use('/api/sync',   syncRoutes);
app.use('/api/inbox',        inboxRoutes);
app.use('/api/tags',         tagsRoutes);
app.use('/api/quick-replies', quickRepliesRoutes);

// ── Admin Panel SPA ──────────────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.get('/admin/*', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/admin/index.html'))
);

// ── Staff Chat Page ───────────────────────────────────────────────
app.get('/staff', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/staff/index.html'))
);
app.get('/staff/', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/staff/index.html'))
);
app.use('/staff', express.static(path.join(__dirname, '../public/staff')));
app.get('/staff/*', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/staff/index.html'))
);

// ── Root ─────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({
  name:   'LINE Sales Bot',
  status: 'running',
  inbox:  !!process.env.FB_PAGE_ACCESS_TOKEN ? 'LINE + Messenger' : 'LINE only',
}));

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] LINE Sales Bot running on port ${PORT}`);
  console.log(`[server] Admin panel: http://localhost:${PORT}/admin`);
  if (process.env.FB_PAGE_ACCESS_TOKEN) {
    console.log('[server] Facebook Messenger webhook: /webhook/messenger');
  } else {
    console.log('[server] FB_PAGE_ACCESS_TOKEN not set — Messenger disabled');
  }
  hrSync.startAutoSync();
});

module.exports = app;
