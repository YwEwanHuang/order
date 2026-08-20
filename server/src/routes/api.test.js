/**
 * @jest/integration routes
 * API integration tests using supertest with mocked DB
 * Tests: dishes routes + admin dishes routes + admin meal-plans board.
 */

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

jest.mock('../db/cloudbase', () => ({
  getActiveDishes: jest.fn(),
  getAllDishes: jest.fn(),
  getDishById: jest.fn(),
  createDish: jest.fn(),
  updateDish: jest.fn(),
  deleteDish: jest.fn(),
  getAllMealPlans: jest.fn(),
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
  let cloudbase;

  beforeEach(async () => {
    await jest.isolateModules(async () => {
      app = buildApp();
      cloudbase = require('../db/cloudbase');
    });
    jest.clearAllMocks();
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

describe('admin meal-plans board', () => {
  let app;
  let cloudbase;

  beforeEach(async () => {
    await jest.isolateModules(async () => {
      app = buildApp();
      cloudbase = require('../db/cloudbase');
    });
    jest.clearAllMocks();
  });

  it('API-040: returns 403 for non-admin user', async () => {
    const res = await request(app)
      .get('/api/v1/admin/meal-plans')
      .set('X-WX-OPENID', 'regular-user');
    expect(res.status).toBe(403);
  });

  it('API-041: returns all meal plans for admin', async () => {
    const plans = [
      { id: 'mp_1', ownerOpenid: 'user-a', date: '2026-08-20', mealType: 'lunch', items: [{ name: '米饭' }], note: '', createdAt: '2026-08-20T08:00:00Z', updatedAt: '2026-08-20T08:00:00Z' },
      { id: 'mp_2', ownerOpenid: 'user-b', date: '2026-08-20', mealType: 'dinner', items: [{ name: '红烧肉' }], note: '少盐', createdAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z' },
    ];
    cloudbase.getAllMealPlans.mockResolvedValue(plans);
    const res = await request(app)
      .get('/api/v1/admin/meal-plans')
      .set('X-WX-OPENID', 'admin-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].ownerOpenid).toBe('user-a');
  });

  it('API-042: passes from/to filters', async () => {
    cloudbase.getAllMealPlans.mockResolvedValue([]);
    await request(app)
      .get('/api/v1/admin/meal-plans?from=2026-08-18&to=2026-08-25')
      .set('X-WX-OPENID', 'admin-1');
    expect(cloudbase.getAllMealPlans).toHaveBeenCalledWith({ from: '2026-08-18', to: '2026-08-25' });
  });
});