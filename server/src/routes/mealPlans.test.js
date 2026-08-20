// server/src/routes/mealPlans.test.js
const request = require('supertest');
const express = require('express');
const mealPlansRouter = require('./mealPlans');
const { ensureSchema, pool } = require('../db/pool');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.openid = req.headers['x-wx-openid'] || null;
  next();
});
app.use('/api/v1/meal-plans', mealPlansRouter);

let dishIds = [];

beforeAll(async () => {
  await ensureSchema();
  await pool.query('DELETE FROM meal_plans');
  await pool.query('DELETE FROM dishes');
  const [r1] = await pool.query('INSERT INTO dishes (name, category) VALUES (?,?)', ['A', 'hot']);
  const [r2] = await pool.query('INSERT INTO dishes (name, category) VALUES (?,?)', ['B', 'cold']);
  dishIds = [r1.insertId, r2.insertId];
});

afterAll(async () => {
  await pool.end();
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function shiftISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('GET /api/v1/meal-plans', () => {
  test('未保存日期 → 200 + null', async () => {
    const res = await request(app).get(`/api/v1/meal-plans?date=${todayISO()}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('缺 date → 400', async () => {
    const res = await request(app).get('/api/v1/meal-plans');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/meal-plans', () => {
  test('正常保存', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .set('x-wx-openid', 'oABCD-test')
      .send({ date: todayISO(), dish_ids: dishIds, note: '少辣' });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(todayISO());
    expect(res.body.note).toBe('少辣');
    expect(res.body.updated_by).toBe('oABCD-test');
  });

  test('日期越界（昨天）→ 400 date_out_of_range', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(-1), dish_ids: dishIds });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('date_out_of_range');
  });

  test('日期越界（+7）→ 400 date_out_of_range', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(7), dish_ids: dishIds });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('date_out_of_range');
  });

  test('今天+6 边界通过', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(6), dish_ids: dishIds });
    expect(res.status).toBe(200);
  });

  test('空 dish_ids → 400 invalid_dish_count', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(1), dish_ids: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_dish_count');
  });

  test('超过 20 道 → 400', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(1), dish_ids: Array(21).fill(dishIds[0]) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_dish_count');
  });

  test('备注超 200 字 → 400 note_too_long', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(2), dish_ids: dishIds, note: 'x'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('note_too_long');
  });

  test('引用不存在 dish_id → 400 invalid_dish_id', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(3), dish_ids: [999999] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_dish_id');
  });

  test('同一日期多次保存 = 覆盖（last-write-wins）', async () => {
    await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(4), dish_ids: [dishIds[0]] });
    await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(4), dish_ids: [dishIds[1]] });
    await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(4), dish_ids: dishIds, note: 'final' });
    const [rows] = await pool.query('SELECT * FROM meal_plans WHERE date = ?', [shiftISO(4)]);
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].dish_ids)).toEqual(dishIds);
    expect(rows[0].note).toBe('final');
  });

  test('无 X-WX-OPENID 头 → updated_by = null（不报错）', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(5), dish_ids: dishIds });
    expect(res.status).toBe(200);
    expect(res.body.updated_by).toBeNull();
  });
});