/**
 * @jest/integration mealPlans routes
 * Tests: validation, upsert (POST), GET own plans. No version, no PUT, no idempotency.
 */

process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
process.env.MYSQL_USERNAME = 'root';
process.env.MYSQL_PASSWORD = 'password';
process.env.ADMIN_OPENIDS = 'admin-1,admin-2';

jest.mock('../db/cloudbase', () => ({
  getMealPlansByUser: jest.fn(),
  upsertMealPlan: jest.fn(),
  generateMealPlanId: jest.fn(),
}), { virtual: true });

const request = require('supertest');
const express = require('express');
const mealPlansRouter = require('./mealPlans');
const { errorHandler } = require('../middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'test-req-id'; next(); });
  app.use('/api/v1/meal-plans', mealPlansRouter);
  app.use(errorHandler);
  return app;
}

let app;
let cloudbase;

beforeEach(async () => {
  await jest.isolateModules(async () => {
    app = buildApp();
    cloudbase = require('../db/cloudbase');
  });
  jest.clearAllMocks();
});

describe('POST /api/v1/meal-plans (POST = upsert)', () => {
  it('MP-001: creates plan and returns 201', async () => {
    const plan = { id: 'mp_abc', ownerOpenid: 'user-1', date: '2026-08-20', mealType: 'lunch', items: [{ id: 'dish-1' }], note: '少盐' };
    cloudbase.upsertMealPlan.mockResolvedValue(plan);

    const res = await request(app)
      .post('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1')
      .send({ date: '2026-08-20', mealType: 'lunch', items: [{ id: 'dish-1' }], note: '少盐' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('mp_abc');
    expect(cloudbase.upsertMealPlan).toHaveBeenCalledWith(
      'user-1', '2026-08-20', 'lunch', [{ id: 'dish-1' }], '少盐'
    );
  });

  it('MP-002: returns 400 for missing date', async () => {
    const res = await request(app)
      .post('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1')
      .send({ mealType: 'lunch', items: [{ id: 'dish-1' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('MP-003: returns 400 for empty items', async () => {
    const res = await request(app)
      .post('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1')
      .send({ date: '2026-08-20', mealType: 'lunch', items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('至少选择一道菜');
  });

  it('MP-004: returns 400 for >20 items', async () => {
    const res = await request(app)
      .post('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1')
      .send({ date: '2026-08-20', mealType: 'lunch', items: Array(21).fill({ id: 'dish-1' }) });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('20');
  });

  it('MP-005: rejects note >100 chars', async () => {
    const res = await request(app)
      .post('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1')
      .send({ date: '2026-08-20', mealType: 'lunch', items: [{ id: 'dish-1' }], note: 'x'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('100');
  });
});

describe('GET /api/v1/meal-plans', () => {
  it('MP-020: returns user plans (no ownerOpenid leaked)', async () => {
    const plans = [
      { id: 'mp_abc', date: '2026-08-20', mealType: 'lunch', items: [], note: '', ownerOpenid: 'user-1' },
    ];
    cloudbase.getMealPlansByUser.mockResolvedValue(plans);

    const res = await request(app)
      .get('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('ownerOpenid');
  });

  it('MP-021: passes from/to filters', async () => {
    cloudbase.getMealPlansByUser.mockResolvedValue([]);

    await request(app)
      .get('/api/v1/meal-plans?from=2026-08-01&to=2026-08-31')
      .set('X-WX-OPENID', 'user-1');

    expect(cloudbase.getMealPlansByUser).toHaveBeenCalledWith('user-1', { from: '2026-08-01', to: '2026-08-31' });
  });
});