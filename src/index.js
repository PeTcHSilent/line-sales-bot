'use strict';
require('dotenv').config();

const express    = require('express');
const path       = require('path');
const webhookRoutes = require('./routes/webhookRoutes');
const leadsRoutes   = require('./routes/leadsRoutes');
const adminRoutes   = require('./routes/adminRoutes');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Body parsing (must come before LINE middleware for non-webhook routes)
app.use('/api', express.json());

// ── Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── LINE Webhook (uses raw body — LINE middleware handles its own parsing)
app.use('/', webhookRoutes);

// ── REST API
app.use('/api/leads',  leadsRoutes);
app.use('/api/admin',  adminRoutes);

// ── Admin Panel SPA
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.get('/admin/*', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/admin/index.html'))
);

// ── Root
app.get('/', (_req, res) => res.json({ name: 'LINE Sales Bot', status: 'running' }));

// ── Start
app.listen(PORT, () => {
  console.log(`[server] LINE Sales Bot running on port ${PORT}`);
  console.log(`[server] Admin panel: http://localhost:${PORT}/admin`);
});

module.exports = app;
