'use strict';
/**
 * dashboardRoutes.js — Analytics & Statistics
 *
 * GET /api/dashboard/summary     — today / this-week totals
 * GET /api/dashboard/staff-stats — per-staff breakdown
 * GET /api/dashboard/trend       — 7-day daily counts
 * GET /api/dashboard/tag-stats   — tag usage counts
 */

const express         = require('express');
const { requireAuth } = require('../middleware/auth');
const db              = require('../db');

const router = express.Router();

// ── GET /api/dashboard/summary ──────────────────────────────────────
router.get('/summary', requireAuth, async (_req, res) => {
  try {
    const [today, week, open, resolved, human, avgResp] = await Promise.all([
      // convs created today
      db.query(`SELECT COUNT(*) FROM inbox_conversations
                WHERE created_at >= NOW() AT TIME ZONE 'Asia/Bangkok' - INTERVAL '1 day'`),
      // convs this week
      db.query(`SELECT COUNT(*) FROM inbox_conversations
                WHERE created_at >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Bangkok')`),
      // currently open (bot + human)
      db.query(`SELECT COUNT(*) FROM inbox_conversations WHERE mode IN ('bot','human')`),
      // resolved this week
      db.query(`SELECT COUNT(*) FROM inbox_conversations
                WHERE mode='resolved'
                AND updated_at >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Bangkok')`),
      // currently in human mode
      db.query(`SELECT COUNT(*) FROM inbox_conversations WHERE mode='human'`),
      // avg first response time (minutes) — time from conv created to first out message
      db.query(`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (m.created_at - c.created_at))/60)::numeric, 1) AS avg_min
        FROM inbox_conversations c
        JOIN LATERAL (
          SELECT created_at FROM inbox_messages
          WHERE conversation_id = c.id AND direction='out'
          ORDER BY created_at ASC LIMIT 1
        ) m ON true
        WHERE c.created_at >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Bangkok')
      `),
    ]);

    res.json({
      success: true,
      today:      +today.rows[0].count,
      this_week:  +week.rows[0].count,
      open:       +open.rows[0].count,
      resolved_week: +resolved.rows[0].count,
      human_mode: +human.rows[0].count,
      avg_first_reply_min: avgResp.rows[0]?.avg_min ?? null,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/dashboard/staff-stats ─────────────────────────────────
router.get('/staff-stats', requireAuth, async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT
        u.id,
        u.display_name,
        u.job_type,
        COUNT(c.id) FILTER (WHERE c.assigned_to = u.id)            AS total_assigned,
        COUNT(c.id) FILTER (WHERE c.assigned_to = u.id AND c.mode IN ('bot','human')) AS active,
        COUNT(c.id) FILTER (WHERE c.assigned_to = u.id AND c.mode = 'resolved')      AS resolved,
        ROUND(
          AVG(
            EXTRACT(EPOCH FROM (m.created_at - c.created_at))/60
          ) FILTER (WHERE c.assigned_to = u.id)::numeric,
          1
        ) AS avg_first_reply_min
      FROM admin_users u
      LEFT JOIN inbox_conversations c ON c.assigned_to = u.id
        AND c.created_at >= NOW() - INTERVAL '30 days'
      LEFT JOIN LATERAL (
        SELECT created_at FROM inbox_messages
        WHERE conversation_id = c.id AND direction='out'
        ORDER BY created_at ASC LIMIT 1
      ) m ON true
      WHERE u.is_active = TRUE AND u.role IN ('staff','admin')
      GROUP BY u.id, u.display_name, u.job_type
      ORDER BY total_assigned DESC NULLS LAST
    `);

    res.json({ success: true, staff: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/dashboard/trend ────────────────────────────────────────
router.get('/trend', requireAuth, async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT
        (created_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
        COUNT(*)                                         AS total,
        COUNT(*) FILTER (WHERE mode = 'resolved')        AS resolved,
        COUNT(*) FILTER (WHERE lead_type = 'new')        AS new_leads,
        COUNT(*) FILTER (WHERE lead_type = 'renewal')    AS renewals
      FROM inbox_conversations
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY 1
      ORDER BY 1
    `);

    res.json({ success: true, trend: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/dashboard/tag-stats ────────────────────────────────────
router.get('/tag-stats', requireAuth, async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT t.name, t.color, COUNT(ct.conversation_id) AS usage_count
      FROM tags t
      LEFT JOIN conversation_tags ct ON ct.tag_id = t.id
      GROUP BY t.id, t.name, t.color
      ORDER BY usage_count DESC
    `);
    res.json({ success: true, tags: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
