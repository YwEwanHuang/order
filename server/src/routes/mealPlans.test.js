/**
 * @jest/integration mealPlans routes — auth, ownership and notification enqueuing.
 */

const request = require('supertest');

// Mock the entire cloudbase module before requiring anything else
const mockPool = {
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
};

const mockConnection = {
  beginTransaction: jest.fn(),
  execute: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool),
}), { virtual: true });

const mockDb = {
  getMealPlansByUser: jest.fn(),
  getMealPlanById: jest.fn(),
  upsertMealPlan: jest.fn(),
  createNotificationJob: jest.fn(),
  updateNotificationStatus: jest.fn(),
  getSubscription: jest.fn(),
  consumeQuota: jest.fn(),
  getAdminOpenids: jest.fn(() => ['admin-1', 'admin-2']),
};

jest.mock('../db/cloudbase', () => mockDb, { virtual: true });

const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue([{}, []]);
  mockPool.execute.mockResolvedValue([[], []]);
  mockPool.getConnection.mockResolvedValue(mockConnection);
  mockConnection.beginTransaction.mockResolvedValue();
  mockConnection.execute.mockResolvedValue([[], []]);
  mockConnection.commit.mockResolvedValue();
  mockConnection.rollback.mockResolvedValue();
  // Mock getSubscription to return valid admin subscriptions so getAdminOpenids works
  mockDb.getSubscription.mockResolvedValue({ openid: 'admin-sub', status: 'active' });
});

describe('GET /api/v1/meal-plans', () => {
  it('returns plans WITHOUT ownerOpenid field', async () => {
    // Simulate DB returning a plan with ownerOpenid (internal field)
    const plansFromDb = [
      {
        id: 'mp_1',
        ownerOpenid: 'user-1',
        date: '2026-08-18',
        mealType: 'dinner',
        items: [{ dishId: 'dish-1', name: '米饭' }],
        note: '',
        version: 1,
        createdAt: '2026-08-18T10:00:00.000Z',
        updatedAt: '2026-08-18T10:00:00.000Z',
      },
    ];
    mockDb.getMealPlansByUser.mockResolvedValueOnce(plansFromDb);

    const res = await request(app)
      .get('/api/v1/meal-plans')
      .set('x-wx-openid', 'user-1')
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    // ownerOpenid must not appear in the API response
    expect(res.body.data[0]).not.toHaveProperty('ownerOpenid');
    // All other fields must be present
    expect(res.body.data[0]).toMatchObject({
      id: 'mp_1',
      date: '2026-08-18',
      mealType: 'dinner',
      version: 1,
    });
    expect(res.body.requestId).toBeDefined();
  });
});

describe('PUT /api/v1/meal-plans/:id', () => {
  it('user A cannot modify user B\'s plan (403)', async () => {
    mockDb.getMealPlanById.mockResolvedValueOnce({
      id: 'mp_1',
      ownerOpenid: 'user-b',
      date: '2026-08-18',
      mealType: 'dinner',
      items: [],
      note: '',
      version: 1,
    });

    const res = await request(app)
      .put('/api/v1/meal-plans/mp_1')
      .set('x-wx-openid', 'user-a')
      .send({ items: [{ dishId: 'dish-1', name: '米饭' }], version: 1 })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('user A CAN modify their own plan (200)', async () => {
    const plan = {
      id: 'mp_1',
      ownerOpenid: 'user-a',
      date: '2026-08-18',
      mealType: 'dinner',
      items: [{ dishId: 'dish-1', name: '米饭' }],
      note: '',
      version: 2,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T11:00:00.000Z',
    };
    mockDb.getMealPlanById.mockResolvedValueOnce({
      id: 'mp_1',
      ownerOpenid: 'user-a',
      date: '2026-08-18',
      mealType: 'dinner',
      items: [],
      note: '',
      version: 1,
    });
    mockDb.upsertMealPlan.mockResolvedValueOnce(plan);
    mockDb.createNotificationJob.mockResolvedValue('job-new');

    const res = await request(app)
      .put('/api/v1/meal-plans/mp_1')
      .set('x-wx-openid', 'user-a')
      .send({ items: [{ dishId: 'dish-1', name: '米饭' }], version: 1 })
      .expect(200);

    expect(res.body.data.version).toBe(2);
  });
});

describe('consumeAndEnqueueSubscribe', () => {
  it('without SUBSCRIBE_ENABLED, only in_app jobs are created, no wechat_subscribe', async () => {
    // SUBSCRIBE_ENABLED is not set
    const plan = {
      id: 'mp_1',
      ownerOpenid: 'user-a',
      date: '2026-08-18',
      mealType: 'dinner',
      items: [{ dishId: 'dish-1', name: '米饭' }],
      note: '',
      version: 1,
    };
    mockDb.getMealPlanById.mockResolvedValueOnce({
      id: 'mp_1',
      ownerOpenid: 'user-a',
      date: '2026-08-18',
      mealType: 'dinner',
      items: [],
      note: '',
      version: 1,
    });
    mockDb.upsertMealPlan.mockResolvedValueOnce(plan);
    // in_app jobs are created for each admin
    mockDb.createNotificationJob.mockResolvedValue('job-inapp');

    await request(app)
      .post('/api/v1/meal-plans')
      .set('x-wx-openid', 'user-a')
      .send({ date: '2026-08-18', mealType: 'dinner', items: [{ dishId: 'dish-1', name: '米饭' }] })
      .expect(201);

    // wechat_subscribe should never be called when SUBSCRIBE_ENABLED !== 'true'
    const subscribeCalls = mockDb.createNotificationJob.mock.calls.filter(
      ([, , channel]) => channel === 'wechat_subscribe'
    );
    expect(subscribeCalls).toHaveLength(0);
  });

  it('no quota = job marked no_quota with code', async () => {
    // Mock SUBSCRIBE_ENABLED = 'true' via env
    const originalSubscribeEnabled = process.env.SUBSCRIBE_ENABLED;
    const originalAdminOpenids = process.env.ADMIN_OPENIDS;
    process.env.SUBSCRIBE_ENABLED = 'true';
    process.env.ADMIN_OPENIDS = 'admin-1,admin-2';

    // 2 admins: each gets in_app + wechat_subscribe jobs (4 total createNotificationJob calls)
    // consumeAndEnqueueSubscribe marks each wechat_subscribe job as no_quota
    mockDb.createNotificationJob
      .mockResolvedValueOnce('job-inapp-1')   // admin-1 in_app
      .mockResolvedValueOnce('job-wx-1')      // admin-1 wechat_subscribe
      .mockResolvedValueOnce('job-inapp-2')   // admin-2 in_app
      .mockResolvedValueOnce('job-wx-2');     // admin-2 wechat_subscribe
    mockDb.consumeQuota.mockResolvedValue(false);
    mockDb.updateNotificationStatus.mockResolvedValue(undefined);

    const plan = {
      id: 'mp_1',
      ownerOpenid: 'user-a',
      date: '2026-08-18',
      mealType: 'dinner',
      items: [{ dishId: 'dish-1', name: '米饭' }],
      note: '',
      version: 1,
    };
    mockDb.getMealPlanById.mockResolvedValueOnce({
      id: 'mp_1',
      ownerOpenid: 'user-a',
      date: '2026-08-18',
      mealType: 'dinner',
      items: [],
      note: '',
      version: 1,
    });
    mockDb.upsertMealPlan.mockResolvedValueOnce(plan);

    await request(app)
      .post('/api/v1/meal-plans')
      .set('x-wx-openid', 'user-a')
      .send({ date: '2026-08-18', mealType: 'dinner', items: [{ dishId: 'dish-1', name: '米饭' }] })
      .expect(201);

    // Verify that wechat_subscribe jobs were created
    const wechatSubscribeCalls = mockDb.createNotificationJob.mock.calls.filter(
      ([, , channel]) => channel === 'wechat_subscribe'
    );
    expect(wechatSubscribeCalls).toHaveLength(2); // 2 admins

    // Verify updateNotificationStatus was called with no_quota for each admin
    const noQuotaCalls = mockDb.updateNotificationStatus.mock.calls.filter(
      ([, status, code]) => status === 'no_quota' && code === 'NO_QUOTA_ON_ENQUEUE'
    );
    expect(noQuotaCalls).toHaveLength(2);

    process.env.SUBSCRIBE_ENABLED = originalSubscribeEnabled;
    process.env.ADMIN_OPENIDS = originalAdminOpenids;
  });
});