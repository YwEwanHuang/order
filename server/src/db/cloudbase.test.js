/**
 * @jest/unit MySQL data layer.
 */

// Set required env vars before any modules load so mock pool is used
process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
process.env.MYSQL_USERNAME = 'root';
process.env.MYSQL_PASSWORD = 'password';

// 默认 INFORMATION_SCHEMA 视图返回的列集合，按迁移后完整 schema 给齐
const SCHEMA_COLUMNS = {
  dishes: ['id', 'name', 'category', 'description', 'image_url', 'is_active', 'sort_order', 'created_by', 'created_at', 'updated_at'],
  meal_plans: ['id', 'owner_openid', 'date', 'meal_type', 'items', 'note', 'version', 'created_at', 'updated_at'],
  notification_jobs: ['id', 'meal_plan_id', 'meal_plan_version', 'recipient_openid', 'channel', 'status', 'attempt_count', 'last_error_code', 'created_at', 'sent_at'],
  notification_subscriptions: ['recipient_openid', 'template_id', 'remaining_quota', 'accepted_at', 'consumed_at'],
};

const mockPool = {
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
};

const mockConnection = {
  beginTransaction: jest.fn(),
  query: jest.fn(),
  execute: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool),
}), { virtual: true });

let database;

function mockSchemaQuery(target = mockPool) {
  target.query.mockImplementation(async (sql, params) => {
    if (sql && sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      const tableName = params[0];
      const cols = SCHEMA_COLUMNS[tableName] || [];
      return [cols.map(c => ({ COLUMN_NAME: c })), []];
    }
    return [[], []];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSchemaQuery();
  mockPool.execute.mockResolvedValue([[], []]);
  mockPool.getConnection.mockResolvedValue(mockConnection);
  mockSchemaQuery(mockConnection);
  mockConnection.beginTransaction.mockResolvedValue();
  mockConnection.execute.mockResolvedValue([[], []]);
  mockConnection.commit.mockResolvedValue();
  mockConnection.rollback.mockResolvedValue();
  // Re-load inside isolate so cloudbase.js is never in the shared module cache
  jest.isolateModules(() => {
    database = require('../db/cloudbase');
  });
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

describe('getPool() fail-closed', () => {
  const origAddr = process.env.MYSQL_ADDRESS;
  const origUser = process.env.MYSQL_USERNAME;
  const origPass = process.env.MYSQL_PASSWORD;

  // We need to test that getPool() throws without env vars.
  // To do this without jest.resetModules() (which would break other tests' hoisted mocks),
  // we use jest.isolateModules() to create an isolated module scope.
  it('throws with code MISSING_ENV when MYSQL_ADDRESS is missing', async () => {
    let threw = false;
    let thrownErr = null;

    await jest.isolateModules(async () => {
      // Override the env vars for this isolated scope
      const originalAddr = process.env.MYSQL_ADDRESS;
      const originalUser = process.env.MYSQL_USERNAME;
      const originalPass = process.env.MYSQL_PASSWORD;
      delete process.env.MYSQL_ADDRESS;
      delete process.env.MYSQL_USERNAME;
      delete process.env.MYSQL_PASSWORD;

      jest.resetModules();

      jest.doMock('mysql2/promise', () => ({
        createPool: jest.fn(() => mockPool),
      }), { virtual: true });

      try {
        const db = require('../db/cloudbase');
        db.getPool();
      } catch (e) {
        threw = true;
        thrownErr = e;
      } finally {
        // Restore env vars
        process.env.MYSQL_ADDRESS = originalAddr;
        process.env.MYSQL_USERNAME = originalUser;
        process.env.MYSQL_PASSWORD = originalPass;
      }
    });

    expect(threw).toBe(true);
    expect(thrownErr).toMatchObject({ code: 'MISSING_ENV' });
  });

  it('throws with code MISSING_ENV when MYSQL_USERNAME is missing', async () => {
    let threw = false;
    let thrownErr = null;

    await jest.isolateModules(async () => {
      const originalAddr = process.env.MYSQL_ADDRESS;
      const originalUser = process.env.MYSQL_USERNAME;
      const originalPass = process.env.MYSQL_PASSWORD;
      process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
      delete process.env.MYSQL_USERNAME;
      delete process.env.MYSQL_PASSWORD;

      jest.resetModules();

      jest.doMock('mysql2/promise', () => ({
        createPool: jest.fn(() => mockPool),
      }), { virtual: true });

      try {
        const db = require('../db/cloudbase');
        db.getPool();
      } catch (e) {
        threw = true;
        thrownErr = e;
      } finally {
        process.env.MYSQL_ADDRESS = originalAddr;
        process.env.MYSQL_USERNAME = originalUser;
        process.env.MYSQL_PASSWORD = originalPass;
      }
    });

    expect(threw).toBe(true);
    expect(thrownErr).toMatchObject({ code: 'MISSING_ENV' });
  });

  it('throws with code MISSING_ENV when MYSQL_PASSWORD is missing', async () => {
    let threw = false;
    let thrownErr = null;

    await jest.isolateModules(async () => {
      const originalAddr = process.env.MYSQL_ADDRESS;
      const originalUser = process.env.MYSQL_USERNAME;
      const originalPass = process.env.MYSQL_PASSWORD;
      process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
      process.env.MYSQL_USERNAME = 'root';
      delete process.env.MYSQL_PASSWORD;

      jest.resetModules();

      jest.doMock('mysql2/promise', () => ({
        createPool: jest.fn(() => mockPool),
      }), { virtual: true });

      try {
        const db = require('../db/cloudbase');
        db.getPool();
      } catch (e) {
        threw = true;
        thrownErr = e;
      } finally {
        process.env.MYSQL_ADDRESS = originalAddr;
        process.env.MYSQL_USERNAME = originalUser;
        process.env.MYSQL_PASSWORD = originalPass;
      }
    });

    expect(threw).toBe(true);
    expect(thrownErr).toMatchObject({ code: 'MISSING_ENV' });
  });
});

describe('ensureSchema() graceful CREATE DATABASE failure', () => {
  it('CREATE DATABASE failure does not crash the process (logged gracefully)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockReturnValue();
    // Simulate CREATE DATABASE failing with a non-ER_DB_CREATE_EXISTS / non-ER_ACCESS_DENIED error
    mockPool.query.mockRejectedValueOnce(new Error('Some other DB error'));

    // Should not throw
    await expect(database.ensureSchema()).resolves.not.toThrow();
    // Error should be logged
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ensureSchema] database setup warning',
      expect.objectContaining({ errName: 'Error' })
    );
    consoleSpy.mockRestore();
  });
});

describe('notification job helpers', () => {
  it('createNotificationJob returns a job id string', async () => {
    mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const jobId = await database.createNotificationJob('mp-1', 1, 'in_app', 'admin-1');

    expect(typeof jobId).toBe('string');
    expect(jobId).toMatch(/^job-/);
  });

  it('updateNotificationStatus correctly updates status and optionally error code', async () => {
    mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await database.updateNotificationStatus('job-1', 'no_quota', 'NO_QUOTA_ON_ENQUEUE');

    expect(mockPool.execute).toHaveBeenCalledWith(
      expect.stringContaining('status = ?'),
      ['no_quota', 'NO_QUOTA_ON_ENQUEUE', 'job-1']
    );
  });
});