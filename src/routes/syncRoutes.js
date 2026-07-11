'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const hrSync = require('../services/hrSyncService');
const db = require('../db');

const router = express.Router();

// ── POST /api/sync/run — trigger manual sync (admin panel)
router.post('/run', requireAuth, async (req, res) => {
  try {
    const result = await hrSync.runSync();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/sync/status — ดู last sync time
router.get('/status', requireAuth, async (req, res) => {
  try {
    const r = await db.query("SELECT value FROM system_settings WHERE key = 'last_sync_at'");
    res.json({
      success: true,
      last_sync_at: r.rows[0]?.value || 'never',
      hr_url_configured: !!process.env.HR_SYSTEM_URL,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
