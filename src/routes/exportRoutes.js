'use strict';
/**
 * exportRoutes.js — Export CSV
 *
 * GET /api/export/conversations?mode=&lead_type=&from=&to=
 * GET /api/export/leads?lead_type=&from=&to=
 */

const express         = require('express');
const { requireAuth } = require('../middleware/auth');
const db              = require('../db');

const router = express.Router();

function toCSV(rows, columns) {
  if (!rows.length) return columns.join(',') + '\n';
  const esc = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };
  const header = columns.join(',');
  const lines  = rows.map(r => columns.map(c => esc(r[c])).join(','));
  return [header, ...lines].join('\n');
}

// ── GET /api/export/conversations ──────────────────────────────────
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const { mode, lead_type, from, to } = req.query;
    const params = [];
    const where  = [];

    if (mode)      { params.push(mode);      where.push(`c.mode = $${params.length}`); }
    if (lead_type) { params.push(lead_type); where.push(`c.lead_type = $${params.length}`); }
    if (from)      { params.push(from);      where.push(`c.created_at >= $${params.length}`); }
    if (to)        { params.push(to);        where.push(`c.created_at <= $${params.length}::date + 1`); }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const r = await db.query(`
      SELECT c.id,
             c.channel,
             c.display_name     AS customer_name,
             c.sender_id,
             c.lead_type,
             c.mode,
             c.last_message,
             c.unread_count,
             u.display_name     AS assigned_to,
             c.created_at,
             c.updated_at,
             c.last_message_at
      FROM inbox_conversations c
      LEFT JOIN admin_users u ON u.id = c.assigned_to
      ${whereStr}
      ORDER BY c.last_message_at DESC
      LIMIT 5000
    `, params);

    const csv = toCSV(r.rows, [
      'id','channel','customer_name','sender_id','lead_type','mode',
      'last_message','unread_count','assigned_to','created_at','updated_at','last_message_at',
    ]);

    const now = new Date().toISOString().slice(0,10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="conversations_${now}.csv"`);
    res.send('﻿' + csv); // BOM for Excel UTF-8
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/export/leads ─────────────────────────────────────────
router.get('/leads', requireAuth, async (req, res) => {
  try {
    const { lead_type, from, to } = req.query;
    const params = [];
    const where  = ['c.lead_type IS NOT NULL'];

    if (lead_type) { params.push(lead_type); where.push(`c.lead_type = $${params.length}`); }
    if (from)      { params.push(from);      where.push(`c.created_at >= $${params.length}`); }
    if (to)        { params.push(to);        where.push(`c.created_at <= $${params.length}::date + 1`); }

    const whereStr = 'WHERE ' + where.join(' AND ');

    const r = await db.query(`
      SELECT c.id,
             c.channel,
             c.display_name        AS customer_name,
             c.sender_id,
             c.lead_type,
             c.mode,
             c.last_message,
             u.display_name        AS assigned_to,
             string_agg(DISTINCT t.name, ', ') AS tags,
             c.created_at,
             c.last_message_at
      FROM inbox_conversations c
      LEFT JOIN admin_users u         ON u.id = c.assigned_to
      LEFT JOIN conversation_tags ct  ON ct.conversation_id = c.id
      LEFT JOIN tags t                ON t.id = ct.tag_id
      ${whereStr}
      GROUP BY c.id, u.display_name
      ORDER BY c.last_message_at DESC
      LIMIT 5000
    `, params);

    const csv = toCSV(r.rows, [
      'id','channel','customer_name','sender_id','lead_type','mode',
      'last_message','assigned_to','tags','created_at','last_message_at',
    ]);

    const now = new Date().toISOString().slice(0,10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads_${now}.csv"`);
    res.send('﻿' + csv);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
