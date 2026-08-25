/**
 * @jest/integration MySQL pool + ensureSchema + seed.
 *
 * Requires a local MySQL reachable via MYSQL_ADDRESS (default 127.0.0.1:3306).
 * If the database does not exist yet, ensureSchema() will CREATE it.
 */

process.env.MYSQL_ADDRESS = process.env.MYSQL_ADDRESS || '127.0.0.1:3306';
process.env.MYSQL_USERNAME = process.env.MYSQL_USERNAME || 'root';
process.env.MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'password';
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'manmanorder';

const { ensureSchema, pool } = require('./pool');

describe('ensureSchema', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('启动幂等：库、表、种子均不重复', async () => {
    await ensureSchema();
    await ensureSchema(); // 第二次不应抛错
    const [tables] = await pool.query("SHOW TABLES LIKE 'dishes'");
    expect(tables.length).toBe(1);
    const [seeds] = await pool.query('SELECT COUNT(*) AS c FROM dishes');
    // 种子在 [10, 20] 区间（避免硬编码后续调整时挂测试）
    expect(seeds[0].c).toBeGreaterThanOrEqual(10);
    expect(seeds[0].c).toBeLessThanOrEqual(20);
  });

  test('dishes 表必含字段', async () => {
    const [cols] = await pool.query('SHOW COLUMNS FROM dishes');
    const names = cols.map((c) => c.Field);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'name', 'category', 'is_active', 'sort_order', 'created_at'])
    );
  });

  test('meal_plans 表必含字段（无 meal_type 列）', async () => {
    const [cols] = await pool.query('SHOW COLUMNS FROM meal_plans');
    const names = cols.map((c) => c.Field);
    expect(names).toEqual(
      expect.arrayContaining(['date', 'dish_ids', 'note', 'updated_at', 'updated_by'])
    );
    expect(names).not.toContain('meal_type');
    expect(names).not.toContain('version');
    expect(names).not.toContain('idempotency_key');
  });
});