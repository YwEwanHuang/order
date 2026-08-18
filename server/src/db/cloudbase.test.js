/**
 * @jest/unit MySQL data layer.
 */

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

const database = require('../db/cloudbase');

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue([{}, []]);
  mockPool.execute.mockResolvedValue([[], []]);
  mockPool.getConnection.mockResolvedValue(mockConnection);
  mockConnection.beginTransaction.mockResolvedValue();
  mockConnection.execute.mockResolvedValue([[], []]);
  mockConnection.commit.mockResolvedValue();
  mockConnection.rollback.mockResolvedValue();
});

describe('MySQL data layer', () => {
  it('creates all tables and seeds the seven initial dishes idempotently', async () => {
    await database.ensureSchema();

    const ddl = mockPool.query.mock.calls.map(([sql]) => sql).join('\n');
    expect(ddl).toContain('CREATE DATABASE IF NOT EXISTS `manmanorder`');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS `manmanorder`.`dishes`');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS `manmanorder`.`meal_plans`');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS `manmanorder`.`notification_jobs`');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS `manmanorder`.`notification_subscriptions`');

    const seedCalls = mockPool.execute.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO `manmanorder`.`dishes`')
    );
    expect(seedCalls).toHaveLength(7);
    expect(seedCalls.map(([, values]) => values[1])).toEqual([
      '鸡蛋西红柿',
      '凉拌豆腐皮',
      '土豆炖豆角',
      '排骨冬瓜汤',
      '清炒生菜',
      '米饭',
      '大米粥',
    ]);
  });

  it('queries active dishes with parameterized category filtering', async () => {
    mockPool.execute.mockResolvedValueOnce([[
      {
        id: 'dish-tomato-egg',
        name: '鸡蛋西红柿',
        category: 'hot',
        description: '',
        image_url: '',
        is_active: 1,
        sort_order: 10,
      },
    ], []]);

    const dishes = await database.getActiveDishes({ category: 'hot' });

    expect(mockPool.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE is_active = 1 AND category = ?'),
      ['hot']
    );
    expect(dishes).toEqual([expect.objectContaining({
      id: 'dish-tomato-egg',
      name: '鸡蛋西红柿',
      isActive: true,
      sortOrder: 10,
    })]);
  });

  it('returns an owned meal plan with parsed JSON and ownership data', async () => {
    mockPool.execute.mockResolvedValueOnce([[
      {
        id: 'mp_1',
        owner_openid: 'owner-1',
        date: '2026-08-18',
        meal_type: 'dinner',
        items: '[{"dishId":"dish-1","name":"米饭"}]',
        note: '',
        version: 2,
        created_at: 1787011200000,
        updated_at: 1787011200000,
      },
    ], []]);

    const plan = await database.getMealPlanById('mp_1');

    expect(plan).toMatchObject({
      id: 'mp_1',
      ownerOpenid: 'owner-1',
      mealType: 'dinner',
      version: 2,
      items: [{ dishId: 'dish-1', name: '米饭' }],
    });
  });

  it('applies both meal-plan date bounds as SQL parameters', async () => {
    mockPool.execute.mockResolvedValueOnce([[], []]);

    await database.getMealPlansByUser('owner-1', {
      from: '2026-08-18',
      to: '2026-08-25',
    });

    expect(mockPool.execute).toHaveBeenCalledWith(
      expect.stringContaining('`date` >= ? AND `date` <= ?'),
      ['owner-1', '2026-08-18', '2026-08-25']
    );
  });

  it('creates a meal plan inside a transaction', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const plan = await database.upsertMealPlan(
      'owner-1',
      '2026-08-18',
      'dinner',
      [{ dishId: 'dish-rice', name: '米饭' }],
      '',
      undefined
    );

    expect(plan).toMatchObject({ ownerOpenid: 'owner-1', version: 1 });
    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back a stale meal-plan version', async () => {
    mockConnection.execute.mockResolvedValueOnce([[
      {
        id: 'mp_1',
        owner_openid: 'owner-1',
        date: '2026-08-18',
        meal_type: 'dinner',
        items: '[]',
        note: '',
        version: 2,
        created_at: 1787011200000,
        updated_at: 1787011200000,
      },
    ], []]);

    await expect(database.upsertMealPlan(
      'owner-1',
      '2026-08-18',
      'dinner',
      [{ dishId: 'dish-rice', name: '米饭' }],
      '',
      1
    )).rejects.toMatchObject({ code: 'VERSION_CONFLICT', statusCode: 409 });

    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
  });

  it('normalizes notification rows for the existing route contract', async () => {
    mockPool.execute.mockResolvedValueOnce([[
      {
        id: 'job-1',
        meal_plan_id: 'mp-1',
        meal_plan_version: 3,
        recipient_openid: 'admin-1',
        channel: 'in_app',
        status: 'pending',
        attempt_count: 0,
        last_error_code: null,
        created_at: 1787011200000,
        sent_at: null,
      },
    ], []]);

    await expect(database.getNotificationJobs('admin-1')).resolves.toEqual([
      expect.objectContaining({
        _id: 'job-1',
        mealPlanId: 'mp-1',
        mealPlanVersion: 3,
        recipientOpenid: 'admin-1',
      }),
    ]);
  });

  it('consumes subscription quota atomically', async () => {
    mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(database.consumeQuota('admin-1')).resolves.toBe(true);
    expect(mockPool.execute).toHaveBeenCalledWith(
      expect.stringContaining('remaining_quota = remaining_quota - 1'),
      [expect.any(Number), 'admin-1']
    );
  });
});
