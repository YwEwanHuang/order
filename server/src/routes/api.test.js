/**
 * @jest/integration routes
 * API integration tests using supertest with mocked DB
 * Auth middleware uses real functions; ADMIN_OPENIDS is set at top level.
 *
 * Uses jest.isolateModules() so cloudbase mock is fresh in each test.
 */

// Must be set before jest.mock hoisting so getPool() doesn't fail-closed during module init
process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
process.env.MYSQL_USERNAME = 'root';
process.env.MYSQL_PASSWORD = 'password';
process.env.ADMIN_OPENIDS = 'admin-1,admin-2,admin-3';

const request = require('supertest');
const express = require('express');

const mockDishes = [
  { id: 'dish-1', name: '红烧肉', category: 'hot', description: '香', imageUrl: '', isActive: true, sortOrder: 1, createdBy: '' },
  { id: 'dish-2', name: '清蒸鱼', category: 'hot', description: '鲜', imageUrl: '', isActive: true, sortOrder: 2, createdBy: '' },
  { id: 'dish-3', name: '凉拌黄瓜', category: 'cold', description: '爽', imageUrl: '', isActive: false, sortOrder: 3, createdBy: '' },
];

// Inline mock factory — babel hoisting requires all references to be in-scope
// (prefixed with "mock" makes them valid per Jest's variable-scoping rules)
const mockGetPool = () => ({ query: jest.fn(), execute: jest.fn(), getConnection: jest.fn() });

// Error factory for dishes.errorpath-like scenarios (not used by api.test.js itself)
const mockErrorShape = () => {
  const err = new Error('Access denied for database user');
  err.name = 'Error';
  err.code = 'ER_ACCESS_DENIED_ERROR';
  return err;
};

jest.mock('../db/cloudbase', () => ({
  getActiveDishes: jest.fn(),
  getAllDishes: jest.fn(),
  getDishById: jest.fn(),
  createDish: jest.fn(),
  updateDish: jest.fn(),
  deleteDish: jest.fn(),
  getNotificationJobs: jest.fn(),
  updateNotificationStatus: jest.fn(),
  getSubscription: jest.fn(),
  upsertSubscription: jest.fn(),
  consumeQuota: jest.fn(),
  getPool: mockGetPool,
}), { virtual: true });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'test-req-id'; next(); });
  app.use('/api/v1/dishes', require('../routes/dishes'));
  app.use('/api/v1/admin', require('../routes/admin'));
  return app;
}

describe('dishes routes', () => {
  let app;
  // Top-level jest.mock makes the mock available for require at any point
  let cloudbase = require('../db/cloudbase');

  beforeEach(() => {
    app = buildApp();
    cloudbase.getActiveDishes.mockResolvedValue([]);
    jest.clearAllMocks();
  });

  describe('GET /api/v1/dishes', () => {
    it('API-002: returns active dishes for authenticated user', async () => {
      cloudbase.getActiveDishes.mockResolvedValue(mockDishes.filter(d => d.isActive));
      const res = await request(app)
        .get('/api/v1/dishes')
        .set('X-WX-OPENID', 'user-123');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject({ name: '红烧肉' });
    });

    it('API-003: filters by category query param', async () => {
      cloudbase.getActiveDishes.mockResolvedValue([mockDishes[1]]);
      const res = await request(app)
        .get('/api/v1/dishes?category=cold')
        .set('X-WX-OPENID', 'user-123');
      expect(res.status).toBe(200);
      expect(cloudbase.getActiveDishes).toHaveBeenCalledWith({ category: 'cold' });
    });
  });
});

describe('admin dishes routes', () => {
  let app;
  let cloudbase;

  beforeEach(async () => {
    await jest.isolateModules(async () => {
      app = buildApp();
      cloudbase = require('../db/cloudbase');
    });
    jest.clearAllMocks();
  });

  describe('GET /api/v1/admin/dishes', () => {
    it('API-010: returns 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'regular-user');
      expect(res.status).toBe(403);
    });

    it('API-011: returns all dishes for admin', async () => {
      cloudbase.getAllDishes.mockResolvedValue(mockDishes);
      const res = await request(app)
        .get('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
    });
  });

  describe('GET /api/v1/admin/dishes/:id', () => {
    it('API-012: returns 404 for non-existent dish', async () => {
      cloudbase.getDishById.mockResolvedValue(null);
      const res = await request(app)
        .get('/api/v1/admin/dishes/nonexistent')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('API-013: returns dish by id', async () => {
      cloudbase.getDishById.mockResolvedValue(mockDishes[0]);
      const res = await request(app)
        .get('/api/v1/admin/dishes/dish-1')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('红烧肉');
    });
  });

  describe('POST /api/v1/admin/dishes', () => {
    it('API-014: returns 400 for empty name', async () => {
      const res = await request(app)
        .post('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '   ', category: 'hot' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('API-015: returns 400 for name exceeding 30 chars', async () => {
      const res = await request(app)
        .post('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: 'a'.repeat(31), category: 'hot' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('30');
    });

    it('API-016: creates dish with valid data', async () => {
      const newDish = { id: 'dish-4', name: '番茄炒蛋', category: 'hot', description: '', imageUrl: '', isActive: true, sortOrder: 4, createdBy: '' };
      cloudbase.createDish.mockResolvedValue(newDish);
      const res = await request(app)
        .post('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '番茄炒蛋', category: 'hot' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('番茄炒蛋');
    });

    it('API-016a: rejects non-cloud:// imageUrl', async () => {
      const res = await request(app)
        .post('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '红烧肉', category: 'hot', imageUrl: 'https://example.com/image.jpg' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('cloud://');
    });

    it('API-016b: rejects imageUrl > 512 chars', async () => {
      const res = await request(app)
        .post('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '红烧肉', category: 'hot', imageUrl: 'cloud://xxx/' + 'x'.repeat(504) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('API-016c: accepts cloud:// imageUrl', async () => {
      const newDish = { id: 'dish-5', name: '红烧肉', category: 'hot', imageUrl: 'cloud://abc123/test.jpg' };
      cloudbase.createDish.mockResolvedValue(newDish);
      const res = await request(app)
        .post('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '红烧肉', category: 'hot', imageUrl: 'cloud://abc123/test.jpg' });
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /api/v1/admin/dishes/:id', () => {
    it('API-017: returns 404 when updating non-existent dish', async () => {
      cloudbase.getDishById.mockResolvedValue(null);
      const res = await request(app)
        .patch('/api/v1/admin/dishes/nonexistent')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '新名称' });
      expect(res.status).toBe(404);
    });

    it('API-018: updates dish name', async () => {
      cloudbase.getDishById
        .mockResolvedValueOnce(mockDishes[0])
        .mockResolvedValueOnce({ ...mockDishes[0], name: '新红烧肉' });
      cloudbase.updateDish.mockResolvedValue({ ...mockDishes[0], name: '新红烧肉' });
      const res = await request(app)
        .patch('/api/v1/admin/dishes/dish-1')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '新红烧肉' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('新红烧肉');
    });

    it('API-019: rejects empty name on update', async () => {
      cloudbase.getDishById.mockResolvedValue(mockDishes[0]);
      const res = await request(app)
        .patch('/api/v1/admin/dishes/dish-1')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '' });
      expect(res.status).toBe(400);
    });
  });
});

describe('admin notification routes', () => {
  let app;
  let cloudbase;

  beforeEach(async () => {
    await jest.isolateModules(async () => {
      app = buildApp();
      cloudbase = require('../db/cloudbase');
    });
    jest.clearAllMocks();
  });

  describe('GET /api/v1/admin/notifications', () => {
    it('API-030: returns notification list for admin', async () => {
      const jobs = [
        { _id: 'job-1', mealPlanId: 'mp_abc', channel: 'in_app', status: 'sent', attemptCount: 1, createdAt: Date.now() },
      ];
      cloudbase.getNotificationJobs.mockResolvedValue(jobs);
      const res = await request(app)
        .get('/api/v1/admin/notifications')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(200);
      expect(res.body.data[0].status).toBe('sent');
    });
  });

  describe('POST /api/v1/admin/notifications/:id/retry', () => {
    const wechatJob = (overrides = {}) => ({
      _id: 'job-1',
      mealPlanId: 'mp_abc',
      channel: 'wechat_subscribe',
      status: 'failed',
      attemptCount: 1,
      createdAt: Date.now(),
      ...overrides,
    });

    it('API-031: returns 409 when no quota', async () => {
      cloudbase.getNotificationJobs.mockResolvedValue([wechatJob()]);
      cloudbase.consumeQuota.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/v1/admin/notifications/job-1/retry')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NO_QUOTA');
    });

    it('API-032: returns 202 on successful retry', async () => {
      cloudbase.getNotificationJobs.mockResolvedValue([wechatJob()]);
      cloudbase.consumeQuota.mockResolvedValue(true);
      cloudbase.updateNotificationStatus.mockResolvedValue({});
      const res = await request(app)
        .post('/api/v1/admin/notifications/job-1/retry')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe('pending');
      expect(cloudbase.consumeQuota).toHaveBeenCalledTimes(1);
      expect(cloudbase.updateNotificationStatus).toHaveBeenCalledWith('job-1', 'pending', null);
    });

    it('API-032a: returns 404 when job not found', async () => {
      cloudbase.getNotificationJobs.mockResolvedValue([wechatJob({ _id: 'other' })]);
      const res = await request(app)
        .post('/api/v1/admin/notifications/job-1/retry')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(404);
      expect(cloudbase.consumeQuota).not.toHaveBeenCalled();
    });

    it('API-032b: returns 400 and skips quota drain for in_app job', async () => {
      cloudbase.getNotificationJobs.mockResolvedValue([wechatJob({ channel: 'in_app' })]);
      const res = await request(app)
        .post('/api/v1/admin/notifications/job-1/retry')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CHANNEL');
      expect(cloudbase.consumeQuota).not.toHaveBeenCalled();
    });

    it('API-032c: returns 409 and skips quota drain for already-sent job', async () => {
      cloudbase.getNotificationJobs.mockResolvedValue([wechatJob({ status: 'sent' })]);
      const res = await request(app)
        .post('/api/v1/admin/notifications/job-1/retry')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_SENT');
      expect(cloudbase.consumeQuota).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/admin/subscriptions', () => {
    it('API-033: returns 400 for missing params', async () => {
      const res = await request(app)
        .post('/api/v1/admin/subscriptions')
        .set('X-WX-OPENID', 'admin-1')
        .send({});
      expect(res.status).toBe(400);
    });

    it('API-034: creates subscription with valid params', async () => {
      cloudbase.upsertSubscription.mockResolvedValue();
      const res = await request(app)
        .post('/api/v1/admin/subscriptions')
        .set('X-WX-OPENID', 'admin-1')
        .send({ templateId: 'tmpl-123', remainingQuota: 3 });
      expect(res.status).toBe(201);
    });
  });
});