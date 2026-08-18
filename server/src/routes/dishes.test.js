/**
 * @jest/integration dishes routes — DTO stripping, ownership and CRUD.
 *
 * Mock pattern copied from mealPlans.test.js: set env + mock in beforeEach (NOT at
 * file top level) so each test gets a fresh mock without module-registry pollution.
 */

const mockPool = { query: jest.fn(), execute: jest.fn(), getConnection: jest.fn() };

let app;
let mockDb;

beforeEach(() => {
  // Set env BEFORE any require so getPool() doesn't throw during module init
  process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
  process.env.MYSQL_USERNAME = 'root';
  process.env.MYSQL_PASSWORD = 'password';

  jest.mock('mysql2/promise', () => ({
    createPool: jest.fn(() => mockPool),
  }), { virtual: true });

  jest.mock('../db/cloudbase', () => ({
    getActiveDishes: jest.fn().mockResolvedValue([]),
    getAllDishes: jest.fn().mockResolvedValue([]),
    getDishById: jest.fn().mockResolvedValue(null),
    createDish: jest.fn().mockResolvedValue({}),
    updateDish: jest.fn().mockResolvedValue({}),
    deleteDish: jest.fn().mockResolvedValue(undefined),
    getPool: jest.fn(() => mockPool),
  }), { virtual: true });

  // Load fresh app + cloudbase mock inside the same beforeEach (after mocks are registered)
  // eslint-disable-next-line global-require
  app = require('../index');
  // eslint-disable-next-line global-require
  mockDb = require('../db/cloudbase');

  jest.clearAllMocks();
});
const request = require('supertest');

describe('GET /api/v1/dishes', () => {
  it('returns dishes WITHOUT createdBy field', async () => {
    const dishesFromDb = [
      {
        id: 'dish-1',
        name: '西红柿炒蛋',
        category: 'hot',
        description: '',
        imageUrl: '',
        isActive: true,
        sortOrder: 10,
        createdBy: 'user-123', // internal field — must NOT appear in response
      },
    ];
    mockDb.getActiveDishes.mockResolvedValueOnce(dishesFromDb);

    const res = await request(app)
      .get('/api/v1/dishes')
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('createdBy');
    expect(res.body.data[0]).toMatchObject({
      id: 'dish-1',
      name: '西红柿炒蛋',
      category: 'hot',
    });
  });

  it('filters by category when provided', async () => {
    mockDb.getActiveDishes.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/v1/dishes?category=cold')
      .expect(200);

    expect(mockDb.getActiveDishes).toHaveBeenCalledWith({ category: 'cold' });
  });

  it('returns 404 when dish not found', async () => {
    mockDb.getDishById.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/dishes/nonexistent')
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/dishes', () => {
  it('creates dish and returns it WITHOUT createdBy', async () => {
    const created = {
      id: 'dish-new',
      name: '红烧肉',
      category: 'hot',
      description: '美味',
      imageUrl: '',
      isActive: true,
      sortOrder: 5,
      createdBy: 'user-1',
    };
    mockDb.createDish.mockResolvedValueOnce(created);

    const res = await request(app)
      .post('/api/v1/dishes')
      .set('x-wx-openid', 'user-1')
      .send({ name: '红烧肉', category: 'hot', description: '美味' })
      .expect(201);

    expect(res.body.data).not.toHaveProperty('createdBy');
    expect(res.body.data.name).toBe('红烧肉');
    expect(mockDb.createDish).toHaveBeenCalledWith(
      expect.objectContaining({ name: '红烧肉', createdBy: 'user-1' })
    );
  });

  it('returns 400 for missing name or category', async () => {
    const res = await request(app)
      .post('/api/v1/dishes')
      .set('x-wx-openid', 'user-1')
      .send({ name: '红烧肉' }) // missing category
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid category', async () => {
    const res = await request(app)
      .post('/api/v1/dishes')
      .set('x-wx-openid', 'user-1')
      .send({ name: '红烧肉', category: 'invalid_cat' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .post('/api/v1/dishes')
      .send({ name: '红烧肉', category: 'hot' })
      .expect(401);
  });
});

describe('PUT /api/v1/dishes/:id', () => {
  it('owner can update their own dish (200)', async () => {
    mockDb.getDishById.mockResolvedValueOnce({
      id: 'dish-1', createdBy: 'user-1', name: '红烧肉', category: 'hot',
    });
    mockDb.updateDish.mockResolvedValueOnce({
      id: 'dish-1', createdBy: 'user-1', name: '修改后的红烧肉', category: 'hot',
    });

    const res = await request(app)
      .put('/api/v1/dishes/dish-1')
      .set('x-wx-openid', 'user-1')
      .send({ name: '修改后的红烧肉' })
      .expect(200);

    expect(res.body.data).not.toHaveProperty('createdBy');
  });

  it('non-owner gets 403', async () => {
    mockDb.getDishById.mockResolvedValueOnce({
      id: 'dish-1', createdBy: 'user-b', name: '红烧肉', category: 'hot',
    });

    const res = await request(app)
      .put('/api/v1/dishes/dish-1')
      .set('x-wx-openid', 'user-a')
      .send({ name: '偷改' })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('DELETE /api/v1/dishes/:id', () => {
  it('owner can delete their own dish (200)', async () => {
    mockDb.getDishById.mockResolvedValueOnce({
      id: 'dish-1', createdBy: 'user-1', name: '红烧肉', category: 'hot',
    });
    mockDb.deleteDish.mockResolvedValueOnce(undefined);

    await request(app)
      .delete('/api/v1/dishes/dish-1')
      .set('x-wx-openid', 'user-1')
      .expect(200);
  });

  it('non-owner gets 403', async () => {
    mockDb.getDishById.mockResolvedValueOnce({
      id: 'dish-1', createdBy: 'user-b', name: '红烧肉', category: 'hot',
    });

    const res = await request(app)
      .delete('/api/v1/dishes/dish-1')
      .set('x-wx-openid', 'user-a')
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
