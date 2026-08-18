/**
 * MySQL 数据访问层。
 *
 * 文件名暂时保留为 cloudbase.js，避免无关路由改名；实际存储使用微信云托管
 * 自动注入的 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD。
 */

const { randomUUID } = require('crypto');
const mysql = require('mysql2/promise');

const DATABASE_NAME = 'manmanorder';
const TABLE = {
  dishes: '`manmanorder`.`dishes`',
  mealPlans: '`manmanorder`.`meal_plans`',
  notificationJobs: '`manmanorder`.`notification_jobs`',
  subscriptions: '`manmanorder`.`notification_subscriptions`',
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

function parseMysqlAddress(address = '127.0.0.1:3306') {
  const separator = address.lastIndexOf(':');
  if (separator <= 0) return { host: address, port: 3306 };
  const port = Number(address.slice(separator + 1));
  return {
    host: address.slice(0, separator),
    port: Number.isInteger(port) && port > 0 ? port : 3306,
  };
}

function getPool() {
  if (!pool) {
    const { host, port } = parseMysqlAddress(process.env.MYSQL_ADDRESS);
    pool = mysql.createPool({
      host,
      port,
      user: process.env.MYSQL_USERNAME,
      password: process.env.MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      enableKeepAlive: true,
      decimalNumbers: true,
    });
  }
  return pool;
}

async function ensureSchema() {
  const db = getPool();
  await db.query(
    `CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE.dishes} (
      id VARCHAR(64) NOT NULL,
      name VARCHAR(30) NOT NULL,
      category VARCHAR(20) NOT NULL,
      description VARCHAR(100) NOT NULL DEFAULT '',
      image_url TEXT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
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
      version INT NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_meal_plans_owner_date_created (owner_openid, \`date\`, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE.notificationJobs} (
      id VARCHAR(64) NOT NULL,
      meal_plan_id VARCHAR(64) NOT NULL,
      meal_plan_version INT NOT NULL,
      recipient_openid VARCHAR(128) NOT NULL,
      channel VARCHAR(32) NOT NULL,
      status VARCHAR(20) NOT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      last_error_code VARCHAR(64) NULL,
      created_at BIGINT NOT NULL,
      sent_at BIGINT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_notification_delivery (
        meal_plan_id, meal_plan_version, channel, recipient_openid
      ),
      KEY idx_notification_recipient_created (recipient_openid, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE.subscriptions} (
      recipient_openid VARCHAR(128) NOT NULL,
      template_id VARCHAR(128) NOT NULL,
      remaining_quota INT NOT NULL DEFAULT 0,
      accepted_at BIGINT NOT NULL,
      consumed_at BIGINT NULL,
      PRIMARY KEY (recipient_openid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const now = Date.now();
  for (const [id, name, category, sortOrder] of INITIAL_DISHES) {
    await db.execute(
      `INSERT INTO ${TABLE.dishes}
        (id, name, category, description, image_url, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, '', '', 1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = VALUES(id)`,
      [id, name, category, sortOrder, now, now]
    );
  }
}

// ---------------------------------------------------------------------------
// dishes
// ---------------------------------------------------------------------------

async function getActiveDishes({ category } = {}) {
  const params = [];
  let where = 'WHERE is_active = 1';
  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }
  const [rows] = await getPool().execute(
    `SELECT id, name, category, description, image_url, is_active, sort_order
     FROM ${TABLE.dishes}
     ${where}
     ORDER BY sort_order ASC, name ASC`,
    params
  );
  return rows.map(normalizeDish);
}

async function getAllDishes() {
  const [rows] = await getPool().execute(
    `SELECT id, name, category, description, image_url, is_active, sort_order
     FROM ${TABLE.dishes}
     ORDER BY sort_order ASC, name ASC`,
    []
  );
  return rows.map(normalizeDish);
}

async function getDishById(id) {
  const [rows] = await getPool().execute(
    `SELECT id, name, category, description, image_url, is_active, sort_order
     FROM ${TABLE.dishes} WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? normalizeDish(rows[0]) : null;
}

async function createDish(fields) {
  const id = `dish-${randomUUID()}`;
  const now = Date.now();
  const record = {
    id,
    name: fields.name,
    category: fields.category,
    description: fields.description || '',
    imageUrl: fields.imageUrl || '',
    isActive: fields.isActive !== undefined ? Boolean(fields.isActive) : true,
    sortOrder: Number(fields.sortOrder) || 0,
  };
  await getPool().execute(
    `INSERT INTO ${TABLE.dishes}
      (id, name, category, description, image_url, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.name,
      record.category,
      record.description,
      record.imageUrl,
      record.isActive ? 1 : 0,
      record.sortOrder,
      now,
      now,
    ]
  );
  return record;
}

async function updateDish(id, fields) {
  const columnMap = {
    name: 'name',
    category: 'category',
    description: 'description',
    imageUrl: 'image_url',
    isActive: 'is_active',
    sortOrder: 'sort_order',
  };
  const assignments = [];
  const values = [];
  for (const [field, column] of Object.entries(columnMap)) {
    if (fields[field] === undefined) continue;
    assignments.push(`${column} = ?`);
    values.push(field === 'isActive' ? (fields[field] ? 1 : 0) : fields[field]);
  }
  if (assignments.length > 0) {
    assignments.push('updated_at = ?');
    values.push(Date.now(), id);
    await getPool().execute(
      `UPDATE ${TABLE.dishes} SET ${assignments.join(', ')} WHERE id = ?`,
      values
    );
  }
  return getDishById(id);
}

// ---------------------------------------------------------------------------
// meal_plans
// ---------------------------------------------------------------------------

function generateMealPlanId(openid, date, mealType) {
  const str = `${openid}:${date}:${mealType}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `mp_${Math.abs(hash).toString(36)}`;
}

async function getMealPlansByUser(openid, { from, to } = {}) {
  const where = ['owner_openid = ?'];
  const params = [openid];
  if (from) {
    where.push('`date` >= ?');
    params.push(from);
  }
  if (to) {
    where.push('`date` <= ?');
    params.push(to);
  }
  const [rows] = await getPool().execute(
    `SELECT * FROM ${TABLE.mealPlans}
     WHERE ${where.join(' AND ')}
     ORDER BY \`date\` DESC, created_at DESC`,
    params
  );
  return rows.map(normalizeMealPlan);
}

async function getMealPlanById(id) {
  const [rows] = await getPool().execute(
    `SELECT * FROM ${TABLE.mealPlans} WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? normalizeMealPlan(rows[0]) : null;
}

async function upsertMealPlan(openid, date, mealType, items, note, version) {
  const id = generateMealPlanId(openid, date, mealType);
  const now = Date.now();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT * FROM ${TABLE.mealPlans} WHERE id = ? FOR UPDATE`,
      [id]
    );
    const existing = rows[0] ? normalizeMealPlan(rows[0]) : null;
    if (existing) {
      if (version !== undefined && existing.version !== version) {
        const err = new Error('版本冲突');
        err.statusCode = 409;
        err.code = 'VERSION_CONFLICT';
        throw err;
      }
      const newVersion = existing.version + 1;
      const [result] = await connection.execute(
        `UPDATE ${TABLE.mealPlans}
         SET items = ?, note = ?, version = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
        [JSON.stringify(items), note || '', newVersion, now, id, existing.version]
      );
      if (result.affectedRows !== 1) {
        const err = new Error('更新失败，请重试');
        err.statusCode = 409;
        err.code = 'VERSION_CONFLICT';
        throw err;
      }
      await connection.commit();
      return {
        ...existing,
        items,
        note: note || '',
        version: newVersion,
        updatedAt: new Date(now).toISOString(),
      };
    }

    await connection.execute(
      `INSERT INTO ${TABLE.mealPlans}
        (id, owner_openid, \`date\`, meal_type, items, note, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, openid, date, mealType, JSON.stringify(items), note || '', now, now]
    );
    await connection.commit();
    return {
      id,
      ownerOpenid: openid,
      date,
      mealType,
      items,
      note: note || '',
      version: 1,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ---------------------------------------------------------------------------
// notification_jobs
// ---------------------------------------------------------------------------

async function createNotificationJob(mealPlanId, mealPlanVersion, channel, recipientOpenid) {
  const id = `job-${randomUUID()}`;
  await getPool().execute(
    `INSERT INTO ${TABLE.notificationJobs}
      (id, meal_plan_id, meal_plan_version, recipient_openid, channel, status,
       attempt_count, last_error_code, created_at, sent_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, ?, NULL)`,
    [id, mealPlanId, mealPlanVersion, recipientOpenid, channel, Date.now()]
  );
  return id;
}

async function getNotificationJobs(recipientOpenid) {
  const [rows] = await getPool().execute(
    `SELECT * FROM ${TABLE.notificationJobs}
     WHERE recipient_openid = ? ORDER BY created_at DESC LIMIT 100`,
    [recipientOpenid]
  );
  return rows.map(normalizeNotificationJob);
}

async function updateNotificationStatus(id, status, errorCode) {
  const assignments = ['status = ?'];
  const values = [status];
  if (errorCode !== undefined) {
    assignments.push('last_error_code = ?');
    values.push(errorCode);
  }
  if (status === 'sent') {
    assignments.push('sent_at = ?');
    values.push(Date.now());
  }
  values.push(id);
  await getPool().execute(
    `UPDATE ${TABLE.notificationJobs} SET ${assignments.join(', ')} WHERE id = ?`,
    values
  );
}

// ---------------------------------------------------------------------------
// notification_subscriptions
// ---------------------------------------------------------------------------

async function getSubscription(openid) {
  const [rows] = await getPool().execute(
    `SELECT * FROM ${TABLE.subscriptions} WHERE recipient_openid = ? LIMIT 1`,
    [openid]
  );
  return rows[0] ? normalizeSubscription(rows[0]) : null;
}

async function upsertSubscription(openid, templateId, remainingQuota) {
  const now = Date.now();
  await getPool().execute(
    `INSERT INTO ${TABLE.subscriptions}
      (recipient_openid, template_id, remaining_quota, accepted_at, consumed_at)
     VALUES (?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       template_id = VALUES(template_id),
       remaining_quota = VALUES(remaining_quota),
       accepted_at = VALUES(accepted_at),
       consumed_at = NULL`,
    [openid, templateId, remainingQuota, now]
  );
}

async function consumeQuota(openid) {
  const [result] = await getPool().execute(
    `UPDATE ${TABLE.subscriptions}
     SET remaining_quota = remaining_quota - 1, consumed_at = ?
     WHERE recipient_openid = ? AND remaining_quota > 0`,
    [Date.now(), openid]
  );
  return result.affectedRows === 1;
}

function normalizeDish(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description || '',
    imageUrl: row.image_url || '',
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
  };
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  if (!value) return [];
  return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value);
}

function normalizeMealPlan(row) {
  return {
    id: row.id,
    ownerOpenid: row.owner_openid,
    date: row.date,
    mealType: row.meal_type,
    items: parseItems(row.items),
    note: row.note || '',
    version: Number(row.version) || 1,
    createdAt: new Date(Number(row.created_at)).toISOString(),
    updatedAt: new Date(Number(row.updated_at)).toISOString(),
  };
}

function normalizeNotificationJob(row) {
  return {
    _id: row.id,
    mealPlanId: row.meal_plan_id,
    mealPlanVersion: row.meal_plan_version,
    recipientOpenid: row.recipient_openid,
    channel: row.channel,
    status: row.status,
    attemptCount: row.attempt_count,
    lastErrorCode: row.last_error_code,
    createdAt: Number(row.created_at),
    sentAt: row.sent_at === null ? null : Number(row.sent_at),
  };
}

function normalizeSubscription(row) {
  return {
    _id: row.recipient_openid,
    recipientOpenid: row.recipient_openid,
    templateId: row.template_id,
    remainingQuota: Number(row.remaining_quota),
    acceptedAt: Number(row.accepted_at),
    consumedAt: row.consumed_at === null ? null : Number(row.consumed_at),
  };
}

module.exports = {
  ensureSchema,
  getActiveDishes,
  getAllDishes,
  getDishById,
  createDish,
  updateDish,
  getMealPlansByUser,
  getMealPlanById,
  upsertMealPlan,
  generateMealPlanId,
  createNotificationJob,
  getNotificationJobs,
  updateNotificationStatus,
  getSubscription,
  upsertSubscription,
  consumeQuota,
};
