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
    const addr = process.env.MYSQL_ADDRESS;
    if (!addr) {
      const err = new Error('MYSQL_ADDRESS is required');
      err.code = 'MISSING_ENV';
      throw err;
    }
    const user = process.env.MYSQL_USERNAME;
    const password = process.env.MYSQL_PASSWORD;
    if (!user || !password) {
      const err = new Error('MYSQL_USERNAME and MYSQL_PASSWORD are required');
      err.code = 'MISSING_ENV';
      throw err;
    }
    const { host, port } = parseMysqlAddress(addr);
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
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

/** 对已存在的表添加可能缺失的列，幂等安全 */
async function safeCreate(db, sql) {
  try {
    await db.query(sql);
  } catch (err) {
    console.warn('[ensureSchema] table create warning (non-fatal)', err.code);
  }
}

async function migrateColumn(pool, table, column, definition) {
  try {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  } catch (err) {
    // ER_DUP_FIELDNAME = 列已存在，其他错误则抛出
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

// 表列名缓存（schema 在运行时不变）。空 Set 表示没查到任何列。
const columnCache = new Map();

async function getTableColumns(db, table) {
  if (columnCache.has(table)) return columnCache.get(table);
  // 显式传 DATABASE_NAME，不用 DATABASE()：pool 没设 database 选项，
  // 否则 DATABASE() 在生产返回 NULL，查询永远 0 行 → sel 为空 → SQL 语法错误。
  const [rows] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [DATABASE_NAME, table]
  );
  const cols = new Set(rows.map(r => r.COLUMN_NAME));
  columnCache.set(table, cols);
  return cols;
}

// 从一组候选列中挑出表里实际存在的那些，保持原顺序
function pickExisting(columns, actual) {
  return columns.filter(c => actual.has(c));
}

async function ensureSchema() {
  const db = getPool();
  try {
    await db.query(
      `CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    if (err.code !== 'ER_DB_CREATE_EXISTS' && err.code !== 'ER_ACCESS_DENIED_ERROR') {
      // 非致命错误：仅记录，不阻断启动（旧表可能已有同名 database）
      console.error('[ensureSchema] database setup warning', { errName: err.name, errCode: err.code });
    }
  }

  await safeCreate(db, `
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

  await safeCreate(db, `
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

  await safeCreate(db, `
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

  await safeCreate(db, `
    CREATE TABLE IF NOT EXISTS ${TABLE.subscriptions} (
      recipient_openid VARCHAR(128) NOT NULL,
      template_id VARCHAR(128) NOT NULL,
      remaining_quota INT NOT NULL DEFAULT 0,
      accepted_at BIGINT NOT NULL,
      consumed_at BIGINT NULL,
      PRIMARY KEY (recipient_openid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 迁移：补齐旧表可能缺失的列（幂等安全；错误仅记录不阻断启动）
  try {
    await migrateColumn(db, 'manmanorder.dishes', 'description',
      'VARCHAR(100) NULL DEFAULT \'\' AFTER category');
    await migrateColumn(db, 'manmanorder.dishes', 'image_url',
      'TEXT NULL DEFAULT NULL AFTER description');
    await migrateColumn(db, 'manmanorder.dishes', 'created_by',
      'VARCHAR(128) NULL DEFAULT \'\' AFTER sort_order');
    await migrateColumn(db, 'manmanorder.notification_jobs', 'channel',
      'VARCHAR(32) NOT NULL DEFAULT \'wechat_subscribe\' AFTER recipient_openid');
    await migrateColumn(db, 'manmanorder.notification_jobs', 'meal_plan_version',
      'INT NOT NULL DEFAULT 1 AFTER meal_plan_id');
    await migrateColumn(db, 'manmanorder.meal_plans', 'items',
      'JSON NOT NULL AFTER meal_type');
    await migrateColumn(db, 'manmanorder.meal_plans', 'note',
      'VARCHAR(100) NOT NULL DEFAULT \'\' AFTER items');
    await migrateColumn(db, 'manmanorder.meal_plans', 'version',
      'INT NOT NULL DEFAULT 1 AFTER note');
    await migrateColumn(db, 'manmanorder.meal_plans', 'idempotency_key',
      'VARCHAR(128) NULL AFTER version');
    await migrateColumn(db, 'manmanorder.notification_jobs', 'last_error_code',
      'VARCHAR(64) NULL AFTER attempt_count');
    await migrateColumn(db, 'manmanorder.notification_jobs', 'sent_at',
      'BIGINT NULL AFTER last_error_code');
  } catch (err) {
    // 迁移失败不阻断启动，记录错误便于排查
    console.error('[ensureSchema] migration warning (non-fatal)', { errName: err.name, errCode: err.code });
  }

  const now = Date.now();
  try {
    for (const [id, name, category, sortOrder] of INITIAL_DISHES) {
      await db.execute(
        `INSERT INTO ${TABLE.dishes}
          (id, name, category, description, image_url, is_active, sort_order, created_by, created_at, updated_at)
         VALUES (?, ?, ?, '', '', 1, ?, '', ?, ?)
         ON DUPLICATE KEY UPDATE id = VALUES(id)`,
        [id, name, category, sortOrder, now, now]
      );
    }
  } catch (err) {
    console.warn('[ensureSchema] seed dishes warning (non-fatal)', err.code);
  }
}

// ---------------------------------------------------------------------------
// dishes
// 列名集合按实际 information_schema 动态取，无列则跳过（route 层 normalize 提供默认值）
// ---------------------------------------------------------------------------

const DISH_BASE_COLS = ['id', 'name', 'category', 'is_active', 'sort_order', 'created_at', 'updated_at'];
const DISH_OPTIONAL_COLS = ['description', 'image_url', 'created_by'];

async function selectDishes(where, params, orderBy = 'sort_order ASC, name ASC') {
  const db = getPool();
  const cols = await getTableColumns(db, 'dishes');
  const sel = pickExisting([...DISH_BASE_COLS, ...DISH_OPTIONAL_COLS], cols);
  const sql = `SELECT ${sel.join(', ')} FROM ${TABLE.dishes} ${where}${orderBy ? ' ORDER BY ' + orderBy : ''}`;
  const [rows] = await db.execute(sql, params);
  return rows.map(normalizeDish);
}

async function getActiveDishes({ category } = {}) {
  const params = [];
  let where = 'WHERE is_active = 1';
  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }
  return selectDishes(where, params);
}

async function getAllDishes() {
  return selectDishes('', []);
}

async function getDishById(id) {
  const dishes = await selectDishes('WHERE id = ? LIMIT 1', [id], null);
  return dishes[0] || null;
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
    createdBy: fields.createdBy || '',
  };
  const db = getPool();
  const cols = await getTableColumns(db, 'dishes');
  const candidates = {
    id, name: record.name, category: record.category,
    description: record.description, image_url: record.imageUrl,
    is_active: record.isActive ? 1 : 0, sort_order: record.sortOrder,
    created_by: record.createdBy, created_at: now, updated_at: now,
  };
  const useCols = pickExisting(Object.keys(candidates), cols);
  if (useCols.length === 0) {
    throw new Error('dishes 表无主键 id，无法插入');
  }
  const placeholders = useCols.map(() => '?').join(', ');
  const values = useCols.map(c => candidates[c]);
  await db.execute(
    `INSERT INTO ${TABLE.dishes} (${useCols.join(', ')}) VALUES (${placeholders})`,
    values
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
  const db = getPool();
  const cols = await getTableColumns(db, 'dishes');
  const assignments = [];
  const values = [];
  for (const [field, column] of Object.entries(columnMap)) {
    if (fields[field] === undefined) continue;
    if (!cols.has(column)) continue;
    assignments.push(`${column} = ?`);
    values.push(field === 'isActive' ? (fields[field] ? 1 : 0) : fields[field]);
  }
  if (assignments.length > 0) {
    if (cols.has('updated_at')) {
      assignments.push('updated_at = ?');
      values.push(Date.now());
    }
    values.push(id);
    await db.execute(
      `UPDATE ${TABLE.dishes} SET ${assignments.join(', ')} WHERE id = ?`,
      values
    );
  }
  return getDishById(id);
}

async function deleteDish(id) {
  const db = getPool();
  const cols = await getTableColumns(db, 'dishes');
  const sets = [];
  const values = [];
  if (cols.has('is_active')) { sets.push('is_active = 0'); }
  if (cols.has('updated_at')) { sets.push('updated_at = ?'); values.push(Date.now()); }
  if (sets.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE ${TABLE.dishes} SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
}

// ---------------------------------------------------------------------------
// meal_plans
// 列名按 information_schema 动态取，避免迁移期 ER_BAD_FIELD_ERROR
// ---------------------------------------------------------------------------

const MEAL_PLAN_CANDIDATE_COLS = [
  'id', 'owner_openid', 'date', 'meal_type', 'items', 'note', 'version',
  'created_at', 'updated_at',
];

function generateMealPlanId(openid, date, mealType) {
  const str = `${openid}:${date}:${mealType}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `mp_${Math.abs(hash).toString(36)}`;
}

async function selectMealPlans(whereClause, params, orderBy = '`date` DESC, created_at DESC', limit = null) {
  const db = getPool();
  const cols = await getTableColumns(db, 'meal_plans');
  const sel = pickExisting(MEAL_PLAN_CANDIDATE_COLS, cols);
  const sql = `SELECT ${sel.join(', ')} FROM ${TABLE.mealPlans} ${whereClause} ORDER BY ${orderBy}${limit ? ' LIMIT ' + Number(limit) : ''}`;
  const [rows] = await db.execute(sql, params);
  return rows.map(normalizeMealPlan);
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
  return selectMealPlans(`WHERE ${where.join(' AND ')}`, params);
}

async function getMealPlanById(id) {
  const rows = await selectMealPlans('WHERE id = ? LIMIT 1', [id], 'created_at DESC', 1);
  return rows[0] || null;
}

async function upsertMealPlan(openid, date, mealType, items, note, version, { idempotencyKey, tx: externalTx } = {}) {
  const id = generateMealPlanId(openid, date, mealType);
  const now = Date.now();

  // 调用方若已持有事务连接则复用；否则自己创建并管理提交
  let connection;
  let ownedTransaction = false;
  if (externalTx) {
    connection = externalTx;
  } else {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    ownedTransaction = true;
  }

  try {
    const cols = await getTableColumns(connection, 'meal_plans');
    const selectCols = pickExisting(MEAL_PLAN_CANDIDATE_COLS, cols);
    const [rows] = await connection.execute(
      `SELECT ${selectCols.join(', ')} FROM ${TABLE.mealPlans} WHERE id = ? FOR UPDATE`,
      [id]
    );
    const existing = rows[0] ? normalizeMealPlan(rows[0]) : null;
    if (existing) {
      // 版本冲突检查：无论 POST 还是 PUT 都强制要求 version 匹配
      if (existing.version !== version) {
        const err = new Error('版本冲突');
        err.statusCode = 409;
        err.code = 'VERSION_CONFLICT';
        throw err;
      }
      const newVersion = existing.version + 1;
      const setParts = [];
      const setVals = [];
      if (cols.has('items')) { setParts.push('items = ?'); setVals.push(JSON.stringify(items)); }
      if (cols.has('note')) { setParts.push('note = ?'); setVals.push(note || ''); }
      if (cols.has('version')) { setParts.push('version = ?'); setVals.push(newVersion); }
      if (cols.has('updated_at')) { setParts.push('updated_at = ?'); setVals.push(now); }
      if (setParts.length === 0) {
        const err = new Error('meal_plans 表结构不兼容');
        err.statusCode = 500;
        err.code = 'SCHEMA_MISMATCH';
        throw err;
      }
      const whereParts = ['id = ?'];
      const whereVals = [id];
      if (cols.has('version')) {
        whereParts.push('version = ?');
        whereVals.push(existing.version);
      }
      const [result] = await connection.execute(
        `UPDATE ${TABLE.mealPlans} SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`,
        [...setVals, ...whereVals]
      );
      if (cols.has('version') && result.affectedRows !== 1) {
        const err = new Error('更新失败，请重试');
        err.statusCode = 409;
        err.code = 'VERSION_CONFLICT';
        throw err;
      }
      // 修改时：仅 in_app 通知入队，同一事务内
      await createNotificationJobInTransaction(connection, id, newVersion, 'in_app', openid);
      if (ownedTransaction) await connection.commit();
      return {
        ...existing,
        items,
        note: note || '',
        version: newVersion,
        updatedAt: new Date(now).toISOString(),
      };
    }

    // 新建记录
    const candidates = {
      id,
      owner_openid: openid,
      'date': date,
      meal_type: mealType,
      items: JSON.stringify(items),
      note: note || '',
      version: 1,
      idempotency_key: idempotencyKey || null,
      created_at: now,
      updated_at: now,
    };
    const useCols = pickExisting(Object.keys(candidates), cols);
    if (!useCols.includes('id')) {
      const err = new Error('meal_plans 表无主键 id');
      err.statusCode = 500;
      err.code = 'SCHEMA_MISMATCH';
      throw err;
    }
    const placeholders = useCols.map(() => '?').join(', ');
    const values = useCols.map(c => candidates[c]);
    await connection.execute(
      `INSERT INTO ${TABLE.mealPlans} (${useCols.join(', ')}) VALUES (${placeholders})`,
      values
    );
    // 新建时：in_app 通知入队，同一事务内
    await createNotificationJobInTransaction(connection, id, 1, 'in_app', openid);
    if (ownedTransaction) await connection.commit();
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
    if (ownedTransaction) await connection.rollback();
    throw err;
  } finally {
    if (ownedTransaction) connection.release();
  }
}

// ---------------------------------------------------------------------------
// notification_jobs
// 列名按 information_schema 动态取
// ---------------------------------------------------------------------------

const JOB_CANDIDATE_COLS = [
  'id', 'meal_plan_id', 'meal_plan_version', 'recipient_openid', 'channel',
  'status', 'attempt_count', 'last_error_code', 'created_at', 'sent_at',
];

/**
 * 在已有数据库连接（事务）内创建通知任务。
 * 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现幂等：相同 (meal_plan_id,
 * meal_plan_version, channel, recipient_openid) 的重复调用不会报错，静默处理。
 * 返回 jobId。
 */
async function createNotificationJobInTransaction(connection, mealPlanId, mealPlanVersion, channel, recipientOpenid) {
  const id = `job-${randomUUID()}`;
  const cols = await getTableColumns(connection, 'notification_jobs');
  const candidates = {
    id,
    meal_plan_id: mealPlanId,
    meal_plan_version: mealPlanVersion,
    recipient_openid: recipientOpenid,
    channel,
    status: 'pending',
    attempt_count: 0,
    last_error_code: null,
    created_at: Date.now(),
    sent_at: null,
  };
  const useCols = pickExisting(Object.keys(candidates), cols);
  if (!useCols.includes('id')) {
    throw new Error('notification_jobs 表无主键 id');
  }
  const placeholders = useCols.map(() => '?').join(', ');
  const values = useCols.map(c => candidates[c]);
  // 幂等：UNIQUE KEY uq_notification_delivery 拦截重复，ON DUPLICATE KEY UPDATE 吞掉冲突
  await connection.execute(
    `INSERT INTO ${TABLE.notificationJobs} (${useCols.join(', ')}) VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE id = id`,
    values
  );
  return id;
}

async function createNotificationJob(mealPlanId, mealPlanVersion, channel, recipientOpenid) {
  return createNotificationJobInTransaction(getPool(), mealPlanId, mealPlanVersion, channel, recipientOpenid);
}

async function getNotificationJobs(recipientOpenid) {
  const db = getPool();
  const cols = await getTableColumns(db, 'notification_jobs');
  const sel = pickExisting(JOB_CANDIDATE_COLS, cols);
  const [rows] = await db.execute(
    `SELECT ${sel.join(', ')} FROM ${TABLE.notificationJobs}
     WHERE recipient_openid = ? ORDER BY created_at DESC LIMIT 100`,
    [recipientOpenid]
  );
  return rows.map(normalizeNotificationJob);
}

async function updateNotificationStatus(id, status, errorCode) {
  const db = getPool();
  const cols = await getTableColumns(db, 'notification_jobs');
  const assignments = [];
  const values = [];
  if (cols.has('status')) { assignments.push('status = ?'); values.push(status); }
  if (errorCode !== undefined && cols.has('last_error_code')) {
    assignments.push('last_error_code = ?');
    values.push(errorCode);
  }
  if (status === 'sent' && cols.has('sent_at')) {
    assignments.push('sent_at = ?');
    values.push(Date.now());
  }
  if (assignments.length === 0) return;
  values.push(id);
  await db.execute(
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

/** 在已有事务连接内原子扣配额；外部 caller 负责 commit/rollback */
async function consumeQuotaInTransaction(connection, openid) {
  const [result] = await connection.execute(
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
    createdBy: row.created_by || '',
  };
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  if (!value) return [];
  return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value);
}

function normalizeMealPlan(row) {
  const now = Date.now();
  return {
    id: row.id,
    ownerOpenid: row.owner_openid || '',
    date: row.date || '',
    mealType: row.meal_type || '',
    items: parseItems(row.items),
    note: row.note || '',
    version: Number(row.version) || 1,
    createdAt: row.created_at ? new Date(Number(row.created_at)).toISOString() : new Date(now).toISOString(),
    updatedAt: row.updated_at ? new Date(Number(row.updated_at)).toISOString() : new Date(now).toISOString(),
  };
}

function normalizeNotificationJob(row) {
  return {
    _id: row.id,
    mealPlanId: row.meal_plan_id || '',
    mealPlanVersion: Number(row.meal_plan_version) || 1,
    recipientOpenid: row.recipient_openid || '',
    channel: row.channel || '',
    status: row.status || 'pending',
    attemptCount: Number(row.attempt_count) || 0,
    lastErrorCode: row.last_error_code || null,
    createdAt: Number(row.created_at) || 0,
    sentAt: row.sent_at === null || row.sent_at === undefined ? null : Number(row.sent_at),
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
  deleteDish,
  getMealPlansByUser,
  getMealPlanById,
  upsertMealPlan,
  generateMealPlanId,
  createNotificationJob,
  createNotificationJobInTransaction,
  getNotificationJobs,
  updateNotificationStatus,
  getSubscription,
  upsertSubscription,
  consumeQuota,
  consumeQuotaInTransaction,
  // Exported for unit testing only
  getPool,
  getTableColumns,
};
