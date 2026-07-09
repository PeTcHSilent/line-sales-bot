'use strict';
const express      = require('express');
const db           = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/usage/summary — ภาพรวมทั้งหมด ──────────────────────
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*)                      AS total_calls,
        SUM(input_tokens)             AS total_input_tokens,
        SUM(output_tokens)            AS total_output_tokens,
        SUM(total_tokens)             AS total_tokens,
        SUM(total_cost_usd)           AS total_cost_usd,
        SUM(total_cost_usd) * 35      AS total_cost_thb,
        AVG(total_tokens)             AS avg_tokens_per_call,
        COUNT(DISTINCT line_user_id)  AS unique_users,
        MIN(created_at)               AS first_call,
        MAX(created_at)               AS last_call,
        -- เดือนนี้
        SUM(total_cost_usd) FILTER (
          WHERE DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Bangkok')
              = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Bangkok')
        ) AS this_month_cost_usd,
        -- 7 วันล่าสุด
        SUM(total_cost_usd) FILTER (
          WHERE created_at >= NOW() - INTERVAL '7 days'
        ) AS last_7d_cost_usd,
        SUM(total_tokens) FILTER (
          WHERE created_at >= NOW() - INTERVAL '7 days'
        ) AS last_7d_tokens
      FROM api_usage_logs
    `);
    res.json({ success: true, summary: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/usage/daily?days=30 — รายวัน ──────────────────────
router.get('/daily', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const r = await db.query(`
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Bangkok') AS date,
        COUNT(*)                                      AS api_calls,
        COUNT(DISTINCT line_user_id)                  AS unique_users,
        SUM(input_tokens)                             AS input_tokens,
        SUM(output_tokens)                            AS output_tokens,
        SUM(total_tokens)                             AS total_tokens,
        ROUND(SUM(total_cost_usd)::numeric, 6)        AS cost_usd,
        ROUND((SUM(total_cost_usd) * 35)::numeric, 4) AS cost_thb
      FROM api_usage_logs
      WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY DATE(created_at AT TIME ZONE 'Asia/Bangkok')
      ORDER BY date DESC
    `, [days]);
    res.json({ success: true, daily: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/usage/monthly — รายเดือน ──────────────────────────
router.get('/monthly', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS month,
        COUNT(*)                                                     AS api_calls,
        COUNT(DISTINCT line_user_id)                                 AS unique_users,
        SUM(input_tokens)                                            AS input_tokens,
        SUM(output_tokens)                                           AS output_tokens,
        SUM(total_tokens)                                            AS total_tokens,
        ROUND(SUM(total_cost_usd)::numeric, 6)                       AS cost_usd,
        ROUND((SUM(total_cost_usd) * 35)::numeric, 4)                AS cost_thb
      FROM api_usage_logs
      GROUP BY TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `);
    res.json({ success: true, monthly: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/usage/by-user?limit=20 — ต้นทุนต่อผู้ใช้ ──────────
router.get('/by-user', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const r = await db.query(`
      SELECT
        line_user_id,
        MAX(display_name)                              AS display_name,
        COUNT(*)                                       AS api_calls,
        SUM(input_tokens)                              AS input_tokens,
        SUM(output_tokens)                             AS output_tokens,
        SUM(total_tokens)                              AS total_tokens,
        ROUND(SUM(total_cost_usd)::numeric, 6)         AS cost_usd,
        ROUND((SUM(total_cost_usd) * 35)::numeric, 4)  AS cost_thb,
        MAX(created_at)                                AS last_call
      FROM api_usage_logs
      GROUP BY line_user_id
      ORDER BY SUM(total_cost_usd) DESC
      LIMIT $1
    `, [limit]);
    res.json({ success: true, users: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/usage/logs?limit=50 — raw logs ─────────────────────
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const r = await db.query(`
      SELECT id, line_user_id, display_name, model,
             input_tokens, output_tokens, total_tokens,
             ROUND(total_cost_usd::numeric,8) AS cost_usd,
             created_at
      FROM api_usage_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const cnt = await db.query('SELECT COUNT(*) FROM api_usage_logs');
    res.json({ success: true, logs: r.rows, total: parseInt(cnt.rows[0].count) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
