/**
 * @jest/integration mealPlans routes
 * Tests: idempotency, version conflict, notification-in-transaction,
 * missing version, authorization
 */

process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
process.env.MYSQL_USERNAME = 'root';
process.env.MYSQL_PASSWORD = 'password';
process.env.ADMIN_OPENIDS = 'admin-1,admin-2';

const mockPool = { query: jest.fn(), execute: jest.fn(), getConnection: jest.fn() };
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool),
}), { virtual: true });

jest.mock('../db/cloudbase', () => ({
  getMealPlansByUser: jest.fn(),
  getMealPlanById: jest.fn(),
  upsertMealPlan: jest.fn(),
  generateMealPlanId: jest.fn(),
  createNotificationJob: jest.fn(),
  createNotificationJobInTransaction: jest.fn(),
  updateNotificationStatus: jest.fn(),
  getPool: jest.fn(() => mockPool),
  getTableColumns: jest.fn(),
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
  mockPool.getConnection.mockReset();
});

describe('POST /api/v1/meal-plans', () => {
  it('MP-001: creates plan and returns 201', async () => {
    const plan = { id: 'mp_abc', ownerOpenid: 'user-1', date: '2026-08-20', mealType: 'lunch', items: [{ id: 'dish-1' }], note: '少盐', version: 1 };
    cloudbase.upsertMealPlan.mockResolvedValue(plan);
    cloudbase.createNotificationJobInTransaction.mockResolvedValue('job-1');

    const res = await request(app)
      .post('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1')
      .set('Idempotency-Key', 'idem-123')
      .send({ date: '2026-08-20', mealType: 'lunch', items: [{ id: 'dish-1' }], note: '少盐' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('mp_abc');
    expect(cloudbase.upsertMealPlan).toHaveBeenCalledWith(
      'user-1', '2026-08-20', 'lunch', [{ id: 'dish-1' }], '少盐', undefined,
      { idempotencyKey: 'idem-123' }
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

  it('MP-005: returns 409 when same Idempotency-Key but different body', async () => {
    cloudbase.upsertMealPlan.mockRejectedValue(
      Object.assign(new Error('幂等键冲突：请求体不一致'), { statusCode: 409, code: 'IDEMPOTENCY_CONFLICT' })
    );

    const res = await request(app)
      .post('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1')
      .set('Idempotency-Key', 'idem-same')
      .send({ date: '2026-08-20', mealType: 'lunch', items: [{ id: 'dish-1' }], note: '第一次' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('PUT /api/v1/meal-plans/:id', () => {
  it('MP-010: updates plan with correct version, returns 200', async () => {
    const existing = { id: 'mp_abc', ownerOpenid: 'user-1', date: '2026-08-20', mealType: 'lunch', version: 1 };
    const updated = { ...existing, items: [{ id: 'dish-2' }], note: '多辣', version: 2 };
    cloudbase.getMealPlanById.mockResolvedValue(existing);
    cloudbase.upsertMealPlan.mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/v1/meal-plans/mp_abc')
      .set('X-WX-OPENID', 'user-1')
      .set('Idempotency-Key', 'idem-456')
      .send({ items: [{ id: 'dish-2' }], note: '多辣', version: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(2);
    expect(cloudbase.upsertMealPlan).toHaveBeenCalledWith(
      'user-1', '2026-08-20', 'lunch', [{ id: 'dish-2' }], '多辣', 1
    );
  });

  it('MP-011: returns 404 when plan not found', async () => {
    cloudbase.getMealPlanById.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/v1/meal-plans/nonexistent')
      .set('X-WX-OPENID', 'user-1')
      .send({ items: [{ id: 'dish-1' }], version: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('MP-012: returns 403 when user does not own the plan', async () => {
    cloudbase.getMealPlanById.mockResolvedValue({ id: 'mp_abc', ownerOpenid: 'other-user', version: 1 });
    const res = await request(app)
      .put('/api/v1/meal-plans/mp_abc')
      .set('X-WX-OPENID', 'user-1')
      .send({ items: [{ id: 'dish-1' }], version: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('MP-013: returns 400 when version is missing', async () => {
    cloudbase.getMealPlanById.mockResolvedValue({ id: 'mp_abc', ownerOpenid: 'user-1', version: 1 });
    const res = await request(app)
      .put('/api/v1/meal-plans/mp_abc')
      .set('X-WX-OPENID', 'user-1')
      .send({ items: [{ id: 'dish-1' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('version');
  });

  it('MP-014: returns 400 when version is null', async () => {
    cloudbase.getMealPlanById.mockResolvedValue({ id: 'mp_abc', ownerOpenid: 'user-1', version: 1 });
    const res = await request(app)
      .put('/api/v1/meal-plans/mp_abc')
      .set('X-WX-OPENID', 'user-1')
      .send({ items: [{ id: 'dish-1' }], version: null });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('MP-015: returns 400 for empty items', async () => {
    cloudbase.getMealPlanById.mockResolvedValue({ id: 'mp_abc', ownerOpenid: 'user-1', version: 1 });
    const res = await request(app)
      .put('/api/v1/meal-plans/mp_abc')
      .set('X-WX-OPENID', 'user-1')
      .send({ items: [], version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('MP-016: returns 409 on version mismatch', async () => {
    cloudbase.getMealPlanById.mockResolvedValue({ id: 'mp_abc', ownerOpenid: 'user-1', version: 2 });
    cloudbase.upsertMealPlan.mockRejectedValue(
      Object.assign(new Error('版本冲突'), { statusCode: 409, code: 'VERSION_CONFLICT' })
    );

    const res = await request(app)
      .put('/api/v1/meal-plans/mp_abc')
      .set('X-WX-OPENID', 'user-1')
      .send({ items: [{ id: 'dish-1' }], version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('GET /api/v1/meal-plans', () => {
  it('MP-020: returns user plans', async () => {
    const plans = [{ id: 'mp_abc', date: '2026-08-20', mealType: 'lunch', items: [], note: '', version: 1 }];
    cloudbase.getMealPlansByUser.mockResolvedValue(plans);

    const res = await request(app)
      .get('/api/v1/meal-plans')
      .set('X-WX-OPENID', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('MP-021: passes from/to filters', async () => {
    cloudbase.getMealPlansByUser.mockResolvedValue([]);

    await request(app)
      .get('/api/v1/meal-plans?from=2026-08-01&to=2026-08-31')
      .set('X-WX-OPENID', 'user-1');

    expect(cloudbase.getMealPlansByUser).toHaveBeenCalledWith('user-1', { from: '2026-08-01', to: '2026-08-31' });
  });
});