/**
 * CloudBase 数据库封装
 * 使用 @cloudbase/node-sdk 访问文档数据库
 */

let app = null;
let db = null;

/**
 * 获取 CloudBase 应用实例（单例）
 *
 * @cloudbase/node-sdk 3.x 的 normalizeConfig 不会从 process.env 自动读取
 * TENCENTCLOUD_SECRETID/SECRETKEY/SESSIONTOKEN（见 SDK utils.js 注释：
 * "不从环境变量读取 ... 并固化到 config 中"）。
 * 云托管平台会把这些变量注入到容器进程，但 SDK 只在收到
 * init({ context: { extendedContext: { tmpSecret: {...} } } }) 时才使用它们。
 * 缺这一步会导致 getDb().collection(...).get() 在请求期抛出
 * "missing secretId or secretKey of tencent cloud"。
 */
function getApp() {
  if (!app) {
    const envId = process.env.TCB_ENV_ID || process.env.ENV_ID || 'prod-d8gkzjj6ub74bba3b';
    const opts = { env: envId };
    const sid = process.env.TENCENTCLOUD_SECRETID;
    const skey = process.env.TENCENTCLOUD_SECRETKEY;
    const stok = process.env.TENCENTCLOUD_SESSIONTOKEN;
    if (sid && skey) {
      opts.context = {
        extendedContext: {
          tmpSecret: { secretId: sid, secretKey: skey, token: stok || '' },
        },
      };
    }
    app = require('@cloudbase/node-sdk').init(opts);
  }
  return app;
}

/**
 * 获取数据库引用
 */
function getDb() {
  if (!db) {
    db = getApp().database();
  }
  return db;
}

// ---------------------------------------------------------------------------
// dishes
// ---------------------------------------------------------------------------

/**
 * 查询启用的菜品列表（可按分类）
 * 注意：CloudBase 的 where() 每次调用会替换之前的条件，需合并为单次调用
 */
async function getActiveDishes({ category } = {}) {
  const filter = { isActive: true };
  if (category) filter.category = category;

  const { data } = await getDb().collection('dishes')
    .where(filter)
    .orderBy('sortOrder', 'asc')
    .orderBy('name', 'asc')
    .get();
  return data.map(normalizeDish);
}

/**
 * 查询所有菜品（含停用，管理员用）
 */
async function getAllDishes() {
  const { data } = await getDb().collection('dishes')
    .orderBy('sortOrder', 'asc')
    .orderBy('name', 'asc')
    .get();
  return data.map(normalizeDish);
}

/** 按 ID 获取菜品 */
async function getDishById(id) {
  const { data } = await getDb().collection('dishes').doc(id).get();
  return data[0] ? normalizeDish(data[0]) : null;
}

/** 创建菜品 */
async function createDish(fields) {
  const now = Date.now();
  const record = {
    ...fields,
    isActive: fields.isActive !== undefined ? fields.isActive : true,
    sortOrder: fields.sortOrder || 0,
    createdAt: now,
    updatedAt: now,
  };
  const { id } = await getDb().collection('dishes').add(record);
  return { id, ...record };
}

/** 更新菜品 */
async function updateDish(id, fields) {
  const update = {
    ...fields,
    updatedAt: Date.now(),
  };
  await getDb().collection('dishes').doc(id).update(update);
  return getDishById(id);
}

// ---------------------------------------------------------------------------
// meal_plans
// ---------------------------------------------------------------------------

/** 生成点菜记录的业务 ID（简单 hash，避免额外依赖） */
function generateMealPlanId(openid, date, mealType) {
  const str = `${openid}:${date}:${mealType}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'mp_' + Math.abs(hash).toString(36);
}

/**
 * 查询用户的点菜记录（按日期范围）
 * 注意：CloudBase 的 where() 每次调用会替换之前的条件，需合并为单次调用
 */
async function getMealPlansByUser(openid, { from, to } = {}) {
  const filter = { ownerOpenid: openid };
  const dbCmd = getDb().command;
  if (from) filter.date = dbCmd.gte(from);
  if (to) {
    if (filter.date) {
      // 如果已有 from 条件，需要用 and 合并
      filter.date = dbCmd.and(filter.date, dbCmd.lte(to));
    } else {
      filter.date = dbCmd.lte(to);
    }
  }

  const { data } = await getDb().collection('meal_plans')
    .where(filter)
    .orderBy('date', 'desc')
    .orderBy('createdAt', 'desc')
    .get();
  return data.map(normalizeMealPlan);
}

/** 按业务 ID 查询点菜记录 */
async function getMealPlanById(id) {
  const { data } = await getDb().collection('meal_plans').doc(id).get();
  return data[0] ? normalizeMealPlan(data[0]) : null;
}

/** 创建或更新点菜记录（upsert） */
async function upsertMealPlan(openid, date, mealType, items, note, version) {
  const id = generateMealPlanId(openid, date, mealType);
  const now = Date.now();

  const existing = await getMealPlanById(id);

  if (existing) {
    // 版本冲突检测
    if (version !== undefined && existing.version !== version) {
      const err = new Error('版本冲突');
      err.statusCode = 409;
      err.code = 'VERSION_CONFLICT';
      throw err;
    }
    const newVersion = existing.version + 1;
    const { stats } = await getDb().collection('meal_plans').doc(id).update({
      items,
      note: note || '',
      version: newVersion,
      updatedAt: now,
    });
    if (stats.updated === 0) {
      const err = new Error('更新失败，请重试');
      err.statusCode = 409;
      err.code = 'VERSION_CONFLICT';
      throw err;
    }
    return { ...existing, items, note: note || '', version: newVersion, updatedAt: now };
  } else {
    // 新建
    const record = {
      _id: id,
      ownerOpenid: openid,
      date,
      mealType,
      items,
      note: note || '',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await getDb().collection('meal_plans').add(record);
    return { id, ...record };
  }
}

// ---------------------------------------------------------------------------
// notification_jobs
// ---------------------------------------------------------------------------

/** 写入通知任务 */
async function createNotificationJob(mealPlanId, mealPlanVersion, channel, recipientOpenid) {
  const now = Date.now();
  const { id } = await getDb().collection('notification_jobs').add({
    mealPlanId,
    mealPlanVersion,
    recipientOpenid,
    channel,
    status: 'pending',
    attemptCount: 0,
    lastErrorCode: null,
    createdAt: now,
    sentAt: null,
  });
  return id;
}

/** 查询管理员的通知记录 */
async function getNotificationJobs(recipientOpenid) {
  const { data } = await getDb().collection('notification_jobs')
    .where({ recipientOpenid })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return data;
}

/** 更新通知状态 */
async function updateNotificationStatus(id, status, errorCode) {
  const update = { status };
  if (errorCode) update.lastErrorCode = errorCode;
  if (status === 'sent') update.sentAt = Date.now();
  await getDb().collection('notification_jobs').doc(id).update(update);
}

// ---------------------------------------------------------------------------
// notification_subscriptions（订阅额度记录）
// ---------------------------------------------------------------------------

/** 获取管理员订阅额度 */
async function getSubscription(openid) {
  const { data } = await getDb().collection('notification_subscriptions')
    .where({ recipientOpenid: openid })
    .limit(1)
    .get();
  return data[0] || null;
}

/** 记录管理员订阅授权 */
async function upsertSubscription(openid, templateId, remainingQuota) {
  const existing = await getSubscription(openid);
  const now = Date.now();
  if (existing) {
    await getDb().collection('notification_subscriptions').doc(existing._id).update({
      templateId,
      remainingQuota,
      consumedAt: null,
    });
  } else {
    await getDb().collection('notification_subscriptions').add({
      recipientOpenid: openid,
      templateId,
      remainingQuota,
      acceptedAt: now,
      consumedAt: null,
    });
  }
}

/** 消费一条订阅额度 */
async function consumeQuota(openid) {
  const sub = await getSubscription(openid);
  if (!sub || sub.remainingQuota <= 0) return false;
  await getDb().collection('notification_subscriptions').doc(sub._id).update({
    remainingQuota: sub.remainingQuota - 1,
    consumedAt: Date.now(),
  });
  return true;
}

// ---------------------------------------------------------------------------
// 规范化（把 CloudBase 的 _id 映射为 id，移走内部字段）
// ---------------------------------------------------------------------------

function normalizeDish(doc) {
  return {
    id: doc._id,
    name: doc.name,
    category: doc.category,
    description: doc.description || '',
    imageUrl: doc.imageUrl || '',
    isActive: doc.isActive,
    sortOrder: doc.sortOrder || 0,
  };
}

function normalizeMealPlan(doc) {
  return {
    id: doc._id,
    date: doc.date,
    mealType: doc.mealType,
    items: doc.items || [],
    note: doc.note || '',
    version: doc.version || 1,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

module.exports = {
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