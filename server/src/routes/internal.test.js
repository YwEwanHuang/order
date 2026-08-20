/**
 * @jest.unit internal routes (notify-admin 专用接口)
 */
process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
process.env.MYSQL_USERNAME = 'root';
process.env.MYSQL_PASSWORD = 'password';
process.env.NOTIFY_API_TOKEN = 'test-token-abc';

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
  getTableColumns: jest.fn(),
}), { virtual: true });

const request = require('supertest');
const express = require('express');
const internalRouter = require('./internal');
const { errorHandler } = require('../middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'test-req-id'; next(); });
  app.use('/internal/notify', internalRouter);
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

describe('GET /internal/notify/pending-jobs', () => {
  it('returns 401 without X-Notify-Token', async () => {
    const res = await request(app).get('/internal/notify/pending-jobs');
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const res = await request(app)
      .get('/internal/notify/pending-jobs')
      .set('X-Notify-Token', 'wrong-token');
    expect(res.status).toBe(401);
  });

  it('returns jobs array with correct token', async () => {
    const fullCols = (cols) => new Set(cols);
    cloudbase.getTableColumns.mockImplementation(async (_pool, table) => {
      if (table === 'notification_jobs') return fullCols(['id', 'meal_plan_id', 'meal_plan_version', 'recipient_openid', 'channel', 'status', 'created_at']);
      if (table === 'notification_subscriptions') return fullCols(['recipient_openid', 'template_id']);
      if (table === 'meal_plans') return fullCols(['id', 'date', 'items', 'meal_type', 'note']);
      return fullCols([]);
    });
    mockPool.execute.mockResolvedValue([[
      {
        id: 'job-001',
        mealPlanId: 'mp_abc',
        mealPlanVersion: 1,
        recipientOpenid: 'admin-001',
        channel: 'wechat_subscribe',
        templateId: 'tmpl-001',
        date: '2026-08-18',
        mealType: 'dinner',
        items: JSON.stringify([{ name: '鸡蛋西红柿' }, { name: '土豆炖豆角' }]),
        note: '少盐',
        createdAt: 1787011200000,
      },
    ]]);

    const res = await request(app)
      .get('/internal/notify/pending-jobs')
      .set('X-Notify-Token', 'test-token-abc');

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].id).toBe('job-001');
    expect(res.body.jobs[0].templateId).toBe('tmpl-001');
    // phrase 从 items 内容拼出来
    expect(res.body.jobs[0].phrase).toBe('收到点菜：鸡蛋西红柿、土豆炖豆角');
    expect(res.body.jobs[0].todo).toBe('鸡蛋西红柿、土豆炖豆角');
    // 给云函数填充模板的字段
    expect(res.body.jobs[0].mealType).toBe('dinner');
    expect(res.body.jobs[0].note).toBe('少盐');
    expect(res.body.jobs[0].createdAt).toBe(1787011200000);
    expect(res.body.jobs[0].dishNames).toEqual(['鸡蛋西红柿', '土豆炖豆角']);
  });

  it('returns empty array when no pending jobs', async () => {
    const fullCols = (cols) => new Set(cols);
    cloudbase.getTableColumns.mockImplementation(async (_pool, table) => {
      if (table === 'notification_jobs') return fullCols(['id', 'meal_plan_id', 'meal_plan_version', 'recipient_openid', 'channel', 'status', 'created_at']);
      if (table === 'notification_subscriptions') return fullCols(['recipient_openid', 'template_id']);
      if (table === 'meal_plans') return fullCols(['id', 'date', 'items']);
      return fullCols([]);
    });
    mockPool.execute.mockResolvedValue([[]]);

    const res = await request(app)
      .get('/internal/notify/pending-jobs')
      .set('X-Notify-Token', 'test-token-abc');

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(0);
  });
});

describe('PATCH /internal/notify/jobs/:id/status', () => {
  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .patch('/internal/notify/jobs/job-001/status')
      .set('X-Notify-Token', 'test-token-abc')
      .send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('calls updateNotificationStatus with correct args', async () => {
    cloudbase.updateNotificationStatus.mockResolvedValue(undefined);

    const res = await request(app)
      .patch('/internal/notify/jobs/job-001/status')
      .set('X-Notify-Token', 'test-token-abc')
      .send({ status: 'sent', errorCode: null });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(cloudbase.updateNotificationStatus).toHaveBeenCalledWith('job-001', 'sent', null);
  });

  it('returns 500 when updateNotificationStatus throws', async () => {
    cloudbase.updateNotificationStatus.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .patch('/internal/notify/jobs/job-001/status')
      .set('X-Notify-Token', 'test-token-abc')
      .send({ status: 'failed', errorCode: '40014' });

    expect(res.status).toBe(500);
  });
});