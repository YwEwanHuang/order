/**
 * @jest/unit MySQL data layer.
 */

process.env.MYSQL_ADDRESS = '127.0.0.1:3306';
process.env.MYSQL_USERNAME = 'root';
process.env.MYSQL_PASSWORD = 'password';

const mockPool = {
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
};

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool),
}), { virtual: true });

let database;

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue([[], []]);
  mockPool.execute.mockResolvedValue([[], []]);
  jest.isolateModules(() => {
    database = require('../db/cloudbase');
  });
});

describe('MySQL data layer', () => {
  it('creates only dishes and meal_plans (no notification tables)', async () => {
    await database.ensureSchema();

    const ddl = mockPool.query.mock.calls.map(([sql]) => sql).join('\n');
    expect(ddl).toContain('CREATE DATABASE IF NOT EXISTS `manmanorder`');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS `manmanorder`.`dishes`');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS `manmanorder`.`meal_plans`');
    expect(ddl).not.toContain('notification_jobs');
    expect(ddl).not.toContain('notification_subscriptions');
    expect(ddl).not.toContain('INFORMATION_SCHEMA');
    expect(ddl).not.toContain('ALTER TABLE');

    const seedCalls = mockPool.execute.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO `manmanorder`.`dishes`')
    );
    expect(seedCalls).toHaveLength(7);
  });

  it('upsertMealPlan uses ON DUPLICATE KEY UPDATE with deterministic id', async () => {
    mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockPool.execute.mockResolvedValueOnce([[{
      id: 'mp_abc', owner_openid: 'owner-1', date: '2026-08-18', meal_type: 'dinner',
      items: '[{"dishId":"dish-rice","name":"米饭"}]', note: '',
      created_at: 1787011200000, updated_at: 1787011200000,
    }], []]);

    const plan = await database.upsertMealPlan(
      'owner-1', '2026-08-18', 'dinner', [{ dishId: 'dish-rice', name: '米饭' }], ''
    );

    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
    expect(sql).toContain('items = VALUES(items)');
    expect(sql).toContain('updated_at = VALUES(updated_at)');
    expect(sql).not.toContain('version');
    expect(sql).not.toContain('idempotency_key');
    expect(sql).not.toContain('beginTransaction');
    expect(params[0]).toMatch(/^mp_[0-9a-f]{16}$/);
    expect(plan.items).toEqual([{ dishId: 'dish-rice', name: '米饭' }]);
  });

  it('generateMealPlanId is stable for same owner+date+mealType', () => {
    const id1 = database.generateMealPlanId('owner-1', '2026-08-18', 'dinner');
    const id2 = database.generateMealPlanId('owner-1', '2026-08-18', 'dinner');
    expect(id1).toBe(id2);
    const id3 = database.generateMealPlanId('owner-1', '2026-08-18', 'lunch');
    expect(id1).not.toBe(id3);
  });

  it('getAllMealPlans filters by from/to and returns all owners', async () => {
    mockPool.execute.mockResolvedValueOnce([[
      { id: 'mp_1', owner_openid: 'user-a', date: '2026-08-18', meal_type: 'lunch', items: '[]', note: '', created_at: 1, updated_at: 1 },
      { id: 'mp_2', owner_openid: 'user-b', date: '2026-08-19', meal_type: 'dinner', items: '[]', note: '', created_at: 2, updated_at: 2 },
    ], []]);

    const plans = await database.getAllMealPlans({ from: '2026-08-18', to: '2026-08-31' });

    expect(mockPool.execute).toHaveBeenCalledWith(
      expect.stringContaining('`date` >= ? AND `date` <= ?'),
      ['2026-08-18', '2026-08-31']
    );
    expect(plans).toHaveLength(2);
    expect(plans[0].ownerOpenid).toBe('user-a');
    expect(plans[1].ownerOpenid).toBe('user-b');
  });
});

describe('getPool() fail-closed', () => {
  it('throws with code MISSING_ENV when MYSQL_ADDRESS is missing', async () => {
    let threw = false;
    let thrownErr = null;

    await jest.isolateModules(async () => {
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
  it('CREATE DATABASE failure does not crash (logged gracefully)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockReturnValue();
    mockPool.query.mockRejectedValueOnce(new Error('Some other DB error'));

    await expect(database.ensureSchema()).resolves.not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ensureSchema] database setup warning',
      expect.objectContaining({ errName: 'Error' })
    );
    consoleSpy.mockRestore();
  });
});