/**
 * MySQL connection pool + ensureSchema + dish seed.
 *
 * - getPool() lazily creates a singleton mysql2/promise pool bound to MYSQL_DATABASE.
 * - ensureSchema() is idempotent: CREATE DATABASE IF NOT EXISTS + CREATE TABLE IF NOT EXISTS + seed-if-empty.
 * - The exported `pool` is a thin proxy so callers can `await pool.query(...)` / `await pool.end()`.
 *
 * Env vars (all optional in dev):
 *   MYSQL_ADDRESS  host:port   (default 127.0.0.1:3306)
 *   MYSQL_USERNAME user        (default root)
 *   MYSQL_PASSWORD password    (default '')
 *   MYSQL_DATABASE db name     (default manmanorder)
 */

const mysql = require('mysql2/promise');

const DB_NAME = process.env.MYSQL_DATABASE || 'manmanorder';

const baseConfig = {
  host: (process.env.MYSQL_ADDRESS || '127.0.0.1:3306').split(':')[0],
  port: Number((process.env.MYSQL_ADDRESS || '127.0.0.1:3306').split(':')[1]) || 3306,
  user: process.env.MYSQL_USERNAME || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  multipleStatements: true,
  waitForConnections: true,
};

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...baseConfig, database: DB_NAME });
  }
  return pool;
}

const SEED_DISHES = [
  ['鸡蛋西红柿', 'hot'],
  ['凉拌豆腐皮', 'cold'],
  ['土豆炖豆角', 'hot'],
  ['排骨冬瓜汤', 'soup'],
  ['清炒生菜', 'hot'],
  ['米饭', 'staple'],
  ['大米粥', 'staple'],
  ['红烧肉', 'hot'],
  ['番茄炒蛋', 'hot'],
  ['凉拌黄瓜', 'cold'],
];

async function ensureDatabase() {
  const conn = await mysql.createConnection(baseConfig);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4`);
  } finally {
    await conn.end();
  }
}

async function ensureSchema() {
  await ensureDatabase();
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS dishes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      category VARCHAR(16) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    CREATE TABLE IF NOT EXISTS meal_plans (
      date DATE PRIMARY KEY,
      dish_ids JSON NOT NULL,
      note VARCHAR(200) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(64) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  const [rows] = await p.query('SELECT COUNT(*) AS c FROM dishes');
  if (rows[0].c === 0) {
    const values = SEED_DISHES.map(([name, category]) => [name, category]);
    await p.query('INSERT INTO dishes (name, category) VALUES ?', [values]);
  }
}

module.exports = {
  get pool() {
    return {
      query: (...args) => getPool().query(...args),
      execute: (...args) => getPool().execute(...args),
      end: () => (pool ? pool.end() : Promise.resolve()),
    };
  },
  getPool,
  ensureSchema,
};