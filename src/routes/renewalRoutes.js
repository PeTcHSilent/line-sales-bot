'use strict';
/**
 * renewalRoutes.js — Dashboard ต่ออายุกรมธรรม์
 *
 * GET /api/renewal/list?staff_id= — ลูกค้าที่ต้องแจ้งเตือน (coverage_end ≤ 90 วัน หรือหมดแล้ว)
 *   staff_id: กรองเฉพาะพนักงานคนนั้น (ถ้าไม่ระบุ = ทุกคน)
 *
 * Response: { success, total, rows: [...], months: [...] }
 */

const express         = require('express');
const { requireAuth } = require('../middleware/auth');
const db              = require('../db');

const router = express.Router();

router.get('/list', requireAuth, async (req, res) => {
  try {
    const { staff_id } = req.query;

    const params      = [];
    let staffFilter   = '';
    if (staff_id) {
      params.push(parseInt(staff_id, 10));
      staffFilter = `AND lc.assigned_to = $${params.length}`;
    }

    const r = await db.query(`
      WITH latest_conv AS (
        SELECT DISTINCT ON (sender_id, channel)
          id, sender_id, channel, display_name, assigned_to
        FROM inbox_conversations
        ORDER BY sender_id, channel, last_message_at DESC
      )
      SELECT
        cd.id,
        cd.sender_id,
        cd.channel,
        cd.cust_name,
        cd.phone,
        cd.car_brand,
        cd.car_model,
        cd.car_year,
        cd.license_plate,
        cd.coverage_start,
        cd.coverage_end,
        cd.renewal_last_notified,
        lc.display_name                        AS customer_line_name,
        lc.id                                  AS conversation_id,
        lc.assigned_to                         AS staff_id,
        a.display_name                         AS staff_name,
        (cd.coverage_end - CURRENT_DATE)::int  AS days_remaining,
        EXTRACT(YEAR  FROM cd.coverage_end)::int AS exp_year,
        EXTRACT(MONTH FROM cd.coverage_end)::int AS exp_month
      FROM customer_details cd
      LEFT JOIN latest_conv lc
        ON lc.sender_id = cd.sender_id AND lc.channel = cd.channel
      LEFT JOIN admin_users a ON a.id = lc.assigned_to
      WHERE cd.coverage_end IS NOT NULL
        AND cd.coverage_end <= CURRENT_DATE + INTERVAL '90 days'
        ${staffFilter}
      ORDER BY cd.coverage_end ASC
    `, params);

    // Build ordered month list for UI tabs
    const months  = [];
    const seenKey = new Set();
    for (const row of r.rows) {
      const key = `${row.exp_year}-${String(row.exp_month).padStart(2, '0')}`;
      if (!seenKey.has(key)) {
        seenKey.add(key);
        months.push({ key, year: row.exp_year, month: row.exp_month });
      }
    }

    res.json({ success: true, total: r.rows.length, rows: r.rows, months });
  } catch (e) {
    console.error('[renewalRoutes] error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
