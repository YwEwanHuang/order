// server/src/routes/mealPlans.js
const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

const MAX_NOTE = 200;
const MAX_DISHES = 20;
const MAX_FUTURE_DAYS = 6;

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInRange(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = todayISO();
  const max = shiftISO(MAX_FUTURE_DAYS);
  return dateStr >= today && dateStr <= max;
}

async function allDishIdsExist(ids) {
  if (ids.length === 0) return false;
  const [rows] = await pool.query(
    `SELECT id FROM dishes WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return rows.length === ids.length;
}

router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'invalid_date' });
    }
    const [rows] = await pool.query(
      `SELECT date, dish_ids, note, updated_at, updated_by
       FROM meal_plans WHERE date = ?`,
      [date]
    );
    if (rows.length === 0) return res.json(null);
    const row = rows[0];
    row.dish_ids = typeof row.dish_ids === 'string' ? JSON.parse(row.dish_ids) : row.dish_ids;
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const { date, dish_ids, note } = req.body || {};

    if (!dateInRange(date)) {
      return res.status(400).json({ error: 'date_out_of_range' });
    }
    if (!Array.isArray(dish_ids) || dish_ids.length === 0 || dish_ids.length > MAX_DISHES) {
      return res.status(400).json({ error: 'invalid_dish_count' });
    }
    if (!dish_ids.every((x) => Number.isInteger(x) && x > 0)) {
      return res.status(400).json({ error: 'invalid_dish_id' });
    }
    if (!(await allDishIdsExist(dish_ids))) {
      return res.status(400).json({ error: 'invalid_dish_id' });
    }
    if (typeof note === 'string' && note.length > MAX_NOTE) {
      return res.status(400).json({ error: 'note_too_long' });
    }
    const openid = req.openid || null;

    await pool.query(
      `INSERT INTO meal_plans (date, dish_ids, note, updated_by)
       VALUES (?, CAST(? AS JSON), ?, ?)
       ON DUPLICATE KEY UPDATE
         dish_ids = VALUES(dish_ids),
         note = VALUES(note),
         updated_by = VALUES(updated_by)`,
      [date, JSON.stringify(dish_ids), note || null, openid]
    );

    const [rows] = await pool.query(
      'SELECT date, dish_ids, note, updated_at, updated_by FROM meal_plans WHERE date = ?',
      [date]
    );
    const row = rows[0];
    row.dish_ids = typeof row.dish_ids === 'string' ? JSON.parse(row.dish_ids) : row.dish_ids;
    res.json(row);
  } catch (err) {
    next(err);
  }
});

module.exports = router;