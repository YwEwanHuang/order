/**
 * @jest/unit notification routes
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
const notificationsRouter = require('./notifications');
const { errorHandler } = require('../middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'test-req-id'; next(); });
  app.use('/api/v1/notifications', notificationsRouter);
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

describe('POST /api/v1/notifications/subscribe', () => {
  it('returns 401 without openid', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .send({ templateId: 'tmpl-001', quota: 10 });
    expect(res.status).toBe(401);
  });

  it('returns 400 when templateId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .set('X-WX-OPENID', 'user-123')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when templateId is not a string', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .set('X-WX-OPENID', 'user-123')
      .send({ templateId: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('calls upsertSubscription with correct args and returns 200', async () => {
    cloudbase.upsertSubscription.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .set('X-WX-OPENID', 'user-123')
      .send({ templateId: 'tmpl-001', quota: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
    expect(cloudbase.upsertSubscription).toHaveBeenCalledWith('user-123', 'tmpl-001', 10);
  });

  it('uses default quota=0 when not provided', async () => {
    cloudbase.upsertSubscription.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .set('X-WX-OPENID', 'user-123')
      .send({ templateId: 'tmpl-002' });
    expect(res.status).toBe(200);
    expect(cloudbase.upsertSubscription).toHaveBeenCalledWith('user-123', 'tmpl-002', 0);
  });

  it('returns 500 when upsertSubscription throws', async () => {
    cloudbase.upsertSubscription.mockRejectedValue(new Error('DB error'));
    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .set('X-WX-OPENID', 'user-123')
      .send({ templateId: 'tmpl-001' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});