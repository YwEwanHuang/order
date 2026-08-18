/**
 * @jest/integration routes
 * API integration tests using supertest with mocked DB
 * Auth middleware uses real functions; ADMIN_OPENIDS is set in beforeAll.
 *
 * Key: resolveUser() reads process.env.ADMIN_OPENIDS at call time (not require time),
 * so setting it in beforeAll is sufficient.
 */
const request = require('supertest');
const express = require('express');

const mockDishes = [
  { id: 'dish-1', name: '红烧肉', category: 'hot', description: '香', imageUrl: '', isActive: true, sortOrder: 1 },
  { id: 'dish-2', name: '清蒸鱼', category: 'hot', description: '鲜', imageUrl: '', isActive: true, sortOrder: 2 },
  { id: 'dish-3', name: '凉拌黄瓜', category: 'cold', description: '爽', imageUrl: '', isActive: false, sortOrder: 3 },
];

// Mock DB (hoisted — runs before any require)
jest.mock('../db/cloudbase', () => ({
  getActiveDishes: jest.fn(),
  getAllDishes: jest.fn(),
  getDishById: jest.fn(),
  createDish: jest.fn(),
  updateDish: jest.fn(),
  getNotificationJobs: jest.fn(),
  updateNotificationStatus: jest.fn(),
  getSubscription: jest.fn(),
  upsertSubscription: jest.fn(),
  consumeQuota: jest.fn(),
}));

const cloudbase = require('../db/cloudbase');
const dishesRouter = require('../routes/dishes');
const adminRouter = require('../routes/admin');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'test-req-id'; next(); });
  app.use('/api/v1/dishes', dishesRouter);
  app.use('/api/v1/admin', adminRouter);
  return app;
}

beforeAll(() => {
  process.env.ADMIN_OPENIDS = 'admin-1,admin-2,admin-3';
});

afterAll(() => {
  delete process.env.ADMIN_OPENIDS;
});

describe('dishes routes', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/dishes', () => {
    it('API-001: returns 401 without openid', async () => {
      const res = await request(app).get('/api/v1/dishes');
      expect(res.status).toBe(401);
    });

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

  beforeEach(() => {
    app = buildApp();
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
      const newDish = { id: 'dish-4', name: '番茄炒蛋', category: 'hot', description: '', imageUrl: '', isActive: true, sortOrder: 4 };
      cloudbase.createDish.mockResolvedValue(newDish);
      const res = await request(app)
        .post('/api/v1/admin/dishes')
        .set('X-WX-OPENID', 'admin-1')
        .send({ name: '番茄炒蛋', category: 'hot' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('番茄炒蛋');
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

  beforeEach(() => {
    app = buildApp();
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
    it('API-031: returns 409 when no quota', async () => {
      cloudbase.consumeQuota.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/v1/admin/notifications/job-1/retry')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NO_QUOTA');
    });

    it('API-032: returns 202 on successful retry', async () => {
      cloudbase.consumeQuota.mockResolvedValue(true);
      cloudbase.updateNotificationStatus.mockResolvedValue({});
      const res = await request(app)
        .post('/api/v1/admin/notifications/job-1/retry')
        .set('X-WX-OPENID', 'admin-1');
      expect(res.status).toBe(202);
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