// server/src/routes/dishes.test.js
const request = require('supertest');
const express = require('express');
const dishesRouter = require('./dishes');
const { ensureSchema, pool } = require('../db/pool');

const app = express();
app.use(express.json());
app.use('/api/v1/dishes', dishesRouter);

beforeAll(async () => {
  await ensureSchema();
  await pool.query('DELETE FROM meal_plans');
  await pool.query('DELETE FROM dishes');
  await pool.query(
    'INSERT INTO dishes (name, category) VALUES (?,?), (?,?)',
    ['测试菜A', 'hot', '测试菜B', 'cold']
  );
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/v1/dishes', () => {
  test('默认仅返回启用菜品', async () => {
    const res = await request(app).get('/api/v1/dishes');
    expect(res.status).toBe(200);
    expect(res.body.every((d) => d.is_active === 1)).toBe(true);
  });

  test('includeInactive=true 返回全部', async () => {
    await pool.query('UPDATE dishes SET is_active = 0 WHERE name = ?', ['测试菜B']);
    const res = await request(app).get('/api/v1/dishes?includeInactive=true');
    expect(res.status).toBe(200);
    expect(res.body.some((d) => d.name === '测试菜B' && d.is_active === 0)).toBe(true);
  });
});

describe('POST /api/v1/dishes', () => {
  test('新增菜品', async () => {
    const res = await request(app)
      .post('/api/v1/dishes')
      .send({ name: '新菜', category: 'soup' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
    const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [res.body.id]);
    expect(rows[0].name).toBe('新菜');
    expect(rows[0].category).toBe('soup');
  });

  test('缺 name → 400', async () => {
    const res = await request(app).post('/api/v1/dishes').send({ category: 'hot' });
    expect(res.status).toBe(400);
  });

  test('缺 category → 400', async () => {
    const res = await request(app).post('/api/v1/dishes').send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  test('category 非法 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/dishes')
      .send({ name: 'x', category: 'invalid' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/dishes/:id', () => {
  test('改名', async () => {
    const [[dish]] = await pool.query('SELECT id FROM dishes WHERE name = ?', ['测试菜A']);
    const res = await request(app)
      .patch(`/api/v1/dishes/${dish.id}`)
      .send({ name: '改名A' });
    expect(res.status).toBe(200);
    const [rows] = await pool.query('SELECT name FROM dishes WHERE id = ?', [dish.id]);
    expect(rows[0].name).toBe('改名A');
  });

  test('停用', async () => {
    const [[dish]] = await pool.query('SELECT id FROM dishes WHERE name = ?', ['改名A']);
    const res = await request(app)
      .patch(`/api/v1/dishes/${dish.id}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);
    const [rows] = await pool.query('SELECT is_active FROM dishes WHERE id = ?', [dish.id]);
    expect(rows[0].is_active).toBe(0);
  });

  test('id 不存在 → 404', async () => {
    const res = await request(app).patch('/api/v1/dishes/999999').send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/dishes/:id', () => {
  test('删除存在菜品', async () => {
    const [[dish]] = await pool.query('SELECT id FROM dishes WHERE name = ?', ['新菜']);
    const res = await request(app).delete(`/api/v1/dishes/${dish.id}`);
    expect(res.status).toBe(200);
    const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [dish.id]);
    expect(rows.length).toBe(0);
  });

  test('id 不存在 → 404', async () => {
    const res = await request(app).delete('/api/v1/dishes/999999');
    expect(res.status).toBe(404);
  });
});
