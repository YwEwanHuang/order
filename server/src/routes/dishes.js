// server/src/routes/dishes.js
const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

const VALID_CATEGORIES = ['hot', 'cold', 'soup', 'staple'];

function isValidImageUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  return /^cloud:\/\//.test(value) || /^https?:\/\//.test(value);
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const sql = includeInactive
      ? 'SELECT id, name, category, is_active, sort_order, image_url, created_at FROM dishes ORDER BY is_active DESC, sort_order ASC, id ASC'
      : 'SELECT id, name, category, is_active, sort_order, image_url, created_at FROM dishes WHERE is_active = 1 ORDER BY sort_order ASC, id ASC';
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, category, image_url } = req.body || {};
    if (typeof name !== 'string' || name.length === 0 || name.length > 64) {
      return res.status(400).json({ error: 'invalid_name' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'invalid_category' });
    }
    if (image_url !== undefined && image_url !== null && !isValidImageUrl(image_url)) {
      return res.status(400).json({ error: 'invalid_image_url' });
    }
    const [result] = await pool.query(
      'INSERT INTO dishes (name, category, image_url) VALUES (?, ?, ?)',
      [name, category, image_url || null]
    );
    const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const fields = [];
    const values = [];
    if ('name' in (req.body || {})) {
      if (typeof req.body.name !== 'string' || req.body.name.length === 0 || req.body.name.length > 64) {
        return res.status(400).json({ error: 'invalid_name' });
      }
      fields.push('name = ?');
      values.push(req.body.name);
    }
    if ('category' in (req.body || {})) {
      if (!VALID_CATEGORIES.includes(req.body.category)) {
        return res.status(400).json({ error: 'invalid_category' });
      }
      fields.push('category = ?');
      values.push(req.body.category);
    }
    if ('is_active' in (req.body || {})) {
      fields.push('is_active = ?');
      values.push(req.body.is_active ? 1 : 0);
    }
    if ('sort_order' in (req.body || {})) {
      const so = Number(req.body.sort_order);
      if (!Number.isInteger(so)) return res.status(400).json({ error: 'invalid_sort_order' });
      fields.push('sort_order = ?');
      values.push(so);
    }
    if ('image_url' in (req.body || {})) {
      if (req.body.image_url !== null && !isValidImageUrl(req.body.image_url)) {
        return res.status(400).json({ error: 'invalid_image_url' });
      }
      fields.push('image_url = ?');
      values.push(req.body.image_url);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'no_fields' });
    values.push(id);
    const [result] = await pool.query(`UPDATE dishes SET ${fields.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
    const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    const [result] = await pool.query('DELETE FROM dishes WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
