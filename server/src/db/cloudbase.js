/**
 * MySQL 数据访问层。
 *
 * 文件名保留为 cloudbase.js 避免无关路由改名；存储用微信云托管注入的
 * MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD。
 *
 * 设计原则：
 *  - schema 由 ensureSchema 唯一拥有；列名固定；漂移时人工 ALTER，不再动态内省
 *  - meal_plans 主键 = hash(openid, date, mealType)；重复提交 = last-write-wins
 *  - upsert 走 INSERT ... ON DUPLICATE KEY UPDATE，无事务、无锁、无 version
 */

const crypto = require('crypto');
const mysql = require('mysql2/promise');

const DATABASE_NAME = 'manmanorder';
const TABLE = {
  dishes: '`manmanorder`.`dishes`',
  mealPlans: '`manmanorder`.`meal_plans`',
};

const INITIAL_DISHES = [
  ['dish-tomato-egg', '鸡蛋西红柿', 'hot', 10],
  ['dish-tofu-skin', '凉拌豆腐皮', 'cold', 20],
  ['dish-potato-bean', '土豆炖豆角', 'hot', 30],
  ['dish-rib-melon-soup', '排骨冬瓜汤', 'soup', 40],
  ['dish-lettuce', '清炒生菜', 'hot', 50],
  ['dish-rice', '米饭', 'staple', 60],
  ['dish-porridge', '大米粥', 'staple', 70],
];

let pool = null;

function parseMysqlAddress(address) {
  const addr = address || '127.0.0.1:3306';
  const sep = addr.lastIndexOf(':');
  if (sep <= 0) return { host: addr, port: 3306 };
  const port = Number.parseInt(addr.slice(sep + 1), 10);
  return { host: addr.slice(0, sep), port: Number.isInteger(port) && port > 0 ? port : 3306 };
}

function getPool() {
  if (pool) return pool;
  const addr = process.env.MYSQL_ADDRESS;
  const user = process.env.MYSQL_USERNAME;
  const password = process.env.MYSQL_PASSWORD;
  if (!addr || !user || !password) {
    const err = new Error('MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD are required');
    err.code = 'MISSING_ENV';
    throw err;
  }
  const { host, port } = parseMysqlAddress(addr);
  pool = mysql.createPool({
    host, port, user, password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    enableKeepAlive: true,
    decimalNumbers: true,
  });
  return pool;
}

async function ensureSchema() {
  const db = getPool();
  try {
    await db.query(
      `CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    if (err.code !== 'ER_DB_CREATE_EXISTS' && err.code !== 'ER_ACCESS_DENIED_ERROR') {
      console.error('[ensureSchema] database setup warning', { errName: err.name, errCode: err.code });
    }
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE.dishes} (
      id VARCHAR(64) NOT NULL,
      name VARCHAR(30) NOT NULL,
      category VARCHAR(20) NOT NULL,
      description VARCHAR(100) NOT NULL DEFAULT '',
      image_url TEXT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_by VARCHAR(128) NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_dishes_active_category_sort_name (is_active, category, sort_order, name),
      KEY idx_dishes_sort_name (sort_order, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE.mealPlans} (
      id VARCHAR(64) NOT NULL,
      owner_openid VARCHAR(128) NOT NULL,
      \`date\` CHAR(10) NOT NULL,
      meal_type VARCHAR(20) NOT NULL,
      items JSON NOT NULL,
      note VARCHAR(100) NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_meal_plans_owner_date_meal (owner_openid, \`date\`, meal_type),
      KEY idx_meal_plans_date (date),
      KEY idx_meal_plans_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const now = Date.now();
  for (const [id, name, category, sortOrder] of INITIAL_DISHES) {
    await db.execute(
      `INSERT INTO ${TABLE.dishes}
        (id, name, category, description, image_url, is_active, sort_order, created_by, created_at, updated_at)
       VALUES (?, ?, ?, '', '', 1, ?, '', ?, ?)
       ON DUPLICATE KEY UPDATE id = VALUES(id)`,
      [id, name, category, sortOrder, now, now]
    );
  }
}

// ---------------------------------------------------------------------------
// dishes
// ---------------------------------------------------------------------------

const DISH_COLS = 'id, name, category, description, image_url, is_active, sort_order, created_by';

function normalizeDish(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description || '',
    imageUrl: row.image_url || '',
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
    createdBy: row.created_by || '',
  };
}

async function getActiveDishes({ category } = {}) {
  const params = [];
  let where = 'WHERE is_active = 1';
  if (category) { where += ' AND category = ?'; params.push(category); }
  const [rows] = await getPool().execute(
    `SELECT ${DISH_COLS} FROM ${TABLE.dishes} ${where} ORDER BY sort_order ASC, name ASC`, params
  );
  return rows.map(normalizeDish);
}

async function getAllDishes() {
  const [rows] = await getPool().execute(
    `SELECT ${DISH_COLS} FROM ${TABLE.dishes} ORDER BY sort_order ASC, name ASC`
  );
  return rows.map(normalizeDish);
}

async function getDishById(id) {
  const [rows] = await getPool().execute(
    `SELECT ${DISH_COLS} FROM ${TABLE.dishes} WHERE id = ? LIMIT 1`, [id]
  );
  return rows[0] ? normalizeDish(rows[0]) : null;
}

async function createDish(fields) {
  const { name, category, description = '', imageUrl = '', isActive = true, sortOrder = 0, createdBy = '' } = fields;
  const id = `dish-${crypto.randomUUID()}`;
  const now = Date.now();
  await getPool().execute(
    `INSERT INTO ${TABLE.dishes} (id, name, category, description, image_url, is_active, sort_order, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, category, description, imageUrl, isActive ? 1 : 0, Number(sortOrder) || 0, createdBy, now, now]
  );
  return { id, name, category, description, imageUrl, isActive: Boolean(isActive), sortOrder: Number(sortOrder) || 0, createdBy };
}

const DISH_UPDATE_MAP = { name: 'name', category: 'category', description: 'description', imageUrl: 'image_url', isActive: 'is_active', sortOrder: 'sort_order' };

async function updateDish(id, fields) {
  const sets = [];
  const values = [];
  for (const [field, col] of Object.entries(DISH_UPDATE_MAP)) {
    if (fields[field] === undefined) continue;
    sets.push(`${col} = ?`);
    values.push(field === 'isActive' ? (fields[field] ? 1 : 0) : fields[field]);
  }
  if (sets.length === 0) return getDishById(id);
  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  await getPool().execute(
    `UPDATE ${TABLE.dishes} SET ${sets.join(', ')} WHERE id = ?`, values
  );
  return getDishById(id);
}

// ---------------------------------------------------------------------------
// meal_plans
// ---------------------------------------------------------------------------

const MEAL_PLAN_COLS = 'id, owner_openid, `date`, meal_type, items, note, created_at, updated_at';

function generateMealPlanId(openid, date, mealType) {
  const hash = crypto.createHash('sha1').update(`${openid}:${date}:${mealType}`).digest('hex');
  return `mp_${hash.slice(0, 16)}`;
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString('utf8'));
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function normalizeMealPlan(row) {
  return {
    id: row.id,
    ownerOpenid: row.owner_openid || '',
    date: row.date || '',
    mealType: row.meal_type || '',
    items: parseItems(row.items),
    note: row.note || '',
    createdAt: row.created_at ? new Date(Number(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
  };
}

async function upsertMealPlan(openid, date, mealType, items, note) {
  const id = generateMealPlanId(openid, date, mealType);
  const now = Date.now();
  await getPool().execute(
    `INSERT INTO ${TABLE.mealPlans} (id, owner_openid, \`date\`, meal_type, items, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE items = VALUES(items), note = VALUES(note), updated_at = VALUES(updated_at)`,
    [id, openid, date, mealType, JSON.stringify(items), note || '', now, now]
  );
  return getMealPlanById(id);
}

async function getMealPlanById(id) {
  const [rows] = await getPool().execute(
    `SELECT ${MEAL_PLAN_COLS} FROM ${TABLE.mealPlans} WHERE id = ? LIMIT 1`, [id]
  );
  return rows[0] ? normalizeMealPlan(rows[0]) : null;
}

async function getMealPlansByUser(openid, { from, to } = {}) {
  const where = ['owner_openid = ?'];
  const params = [openid];
  if (from) { where.push('`date` >= ?'); params.push(from); }
  if (to) { where.push('`date` <= ?'); params.push(to); }
  const [rows] = await getPool().execute(
    `SELECT ${MEAL_PLAN_COLS} FROM ${TABLE.mealPlans} WHERE ${where.join(' AND ')} ORDER BY \`date\` ASC, meal_type ASC`, params
  );
  return rows.map(normalizeMealPlan);
}

async function getAllMealPlans({ from, to } = {}) {
  const where = ['1=1'];
  const params = [];
  if (from) { where.push('`date` >= ?'); params.push(from); }
  if (to) { where.push('`date` <= ?'); params.push(to); }
  const [rows] = await getPool().execute(
    `SELECT ${MEAL_PLAN_COLS} FROM ${TABLE.mealPlans} WHERE ${where.join(' AND ')} ORDER BY \`date\` ASC, meal_type ASC, updated_at ASC`, params
  );
  return rows.map(normalizeMealPlan);
}

module.exports = {
  ensureSchema,
  getActiveDishes,
  getAllDishes,
  getDishById,
  createDish,
  updateDish,
  generateMealPlanId,
  upsertMealPlan,
  getMealPlanById,
  getMealPlansByUser,
  getAllMealPlans,
  getPool,
};