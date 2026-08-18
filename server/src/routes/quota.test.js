/**
 * @jest/unit quota routes
 */
process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
process.env.MYSQL_USERNAME = 'root';
process.env.MYSQL_PASSWORD = 'password';
process.env.ADMIN_OPENIDS = 'admin-1';

const mockPool = { query: jest.fn(), execute: jest.fn(), getConnection: jest.fn() };
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool),
}), { virtual: true });

jest.mock('../db/cloudbase', () => ({
  getActiveDishes: jest.fn(),
  getAllDishes: jest.fn(),
  getDishById: jest.fn(),
  createDish: jest.fn(),
  updateDish: jest.fn(),
  deleteDish: jest.fn(),
  getMealPlansByUser: jest.fn(),
  getMealPlanById: jest.fn(),
  upsertMealPlan: jest.fn(),
  generateMealPlanId: jest.fn(),
  createNotificationJob: jest.fn(),
  getNotificationJobs: jest.fn(),
  updateNotificationStatus: jest.fn(),
  getSubscription: jest.fn(),
  upsertSubscription: jest.fn(),
  consumeQuota: jest.fn(),
  getPool: jest.fn(() => mockPool),
}), { virtual: true });

const request = require('supertest');
const express = require('express');
const quotaRouter = require('./quota');
const { errorHandler } = require('../middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'test-req-id'; next(); });
  app.use('/api/v1/quota', quotaRouter);
  app.use(errorHandler);
  return app;
}

let app;
let cloudbase;

beforeEach(() => {
  app = buildApp();
  cloudbase = require('../db/cloudbase');
  jest.clearAllMocks();
  mockPool.execute.mockReset();
});

describe('GET /api/v1/quota', () => {
  it('returns 401 without openid', async () => {
    const res = await request(app).get('/api/v1/quota');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns hasSubscription=false for user without subscription', async () => {
    cloudbase.getSubscription.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/quota')
      .set('X-WX-OPENID', 'user-without-sub');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      hasSubscription: false,
      remainingQuota: 0,
      templateId: '',
    });
  });

  it('returns subscription data for subscribed user', async () => {
    cloudbase.getSubscription.mockResolvedValue({
      templateId: 'tmpl-001',
      remainingQuota: 10,
      acceptedAt: 1700000000000,
    });
    const res = await request(app)
      .get('/api/v1/quota')
      .set('X-WX-OPENID', 'subscribed-user');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      hasSubscription: true,
      templateId: 'tmpl-001',
      remainingQuota: 10,
      acceptedAt: 1700000000000,
    });
  });

  it('returns 500 when getSubscription throws', async () => {
    cloudbase.getSubscription.mockRejectedValue(new Error('DB error'));
    const res = await request(app)
      .get('/api/v1/quota')
      .set('X-WX-OPENID', 'any-user');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('服务器内部错误');
  });
});