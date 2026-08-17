/**
 * notify-admin 云函数
 *
 * 职责：消费 notification_jobs 中 status='pending' 的任务并发送。
 * - channel='in_app'：管理员的站内通知已通过列表展示即视为送达；此处仅落库状态。
 * - channel='wechat_subscribe'：调用 cloud.openapi.subscribeMessage.send 真发送。
 *
 * 触发方式：
 * 1. 定时触发器（云函数控制台配置 cron），周期性扫描 pending 并发送。
 * 2. HTTP/手动触发：wx.cloud.callFunction({ name: 'notify-admin' }).
 *
 * 模板 ID：可通过事件参数 event.templateId 或环境变量 SUBSCRIBE_TEMPLATE_ID 注入。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _cmd = db.command;

const MAX_BATCH = 20;
const STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  NO_QUOTA: 'no_quota',
  REJECTED: 'rejected',
  FAILED: 'failed',
};

/** 查询待处理任务 */
async function listPending(limit = MAX_BATCH) {
  const { data } = await db.collection('notification_jobs')
    .where({ status: STATUS.PENDING })
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();
  return data || [];
}

/** 加载点菜记录（用于渲染订阅消息模板字段） */
async function loadMealPlan(mealPlanId) {
  const { data } = await db.collection('meal_plans').doc(mealPlanId).get();
  return data && data[0] ? data[0] : null;
}

/** 把任务标记为 sent，并累加 attemptCount */
async function markSent(job) {
  await db.collection('notification_jobs').doc(job._id).update({
    data: {
      status: STATUS.SENT,
      sentAt: Date.now(),
      attemptCount: _cmd.inc(1),
    },
  });
}

/** 把任务标记为失败（no_quota / rejected / failed），记录 lastErrorCode */
async function markFailed(job, status, errorCode) {
  await db.collection('notification_jobs').doc(job._id).update({
    data: {
      status,
      lastErrorCode: errorCode || null,
      attemptCount: _cmd.inc(1),
    },
  });
}

/** 站内通知：仅需落库状态 */
async function processInApp(job) {
  await markSent(job);
  return { id: job._id, status: STATUS.SENT };
}

/**
 * 微信订阅消息：根据实际模板的字段填充 data。
 * 真实模板字段由 admin 在小程序后台配置后填到这里；这里给出通用默认结构。
 */
function buildSubscribeData(plan) {
  const items = Array.isArray(plan && plan.items) ? plan.items : [];
  const names = items.map((i) => (i && i.name) || '').filter(Boolean).slice(0, 5);
  const mealTypeLabel = ({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐' })[plan && plan.mealType] || '';
  return {
    // 字段 key 需与微信后台订阅消息模板一致；缺失字段会被微信拒收
    thing1: { value: (plan && plan.date) || '' },
    thing2: { value: mealTypeLabel },
    thing3: { value: names.join('、') || '（未选择菜品）' },
    thing4: { value: (plan && plan.note) || '无备注' },
  };
}

/** 调用微信 OpenAPI 发送订阅消息；返回 { ok, errorCode } */
async function sendSubscribeMessage(recipientOpenid, templateId, plan) {
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: recipientOpenid,
      templateId,
      data: buildSubscribeData(plan),
      // miniprogramState: 'formal' // 默认正式版
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, errorCode: e.errCode || e.code || 'UNKNOWN', errMsg: e.errMsg || e.message || '' };
  }
}

/** 微信订阅消息：发送并落库状态 */
async function processSubscribe(job, templateId) {
  if (!templateId) {
    await markFailed(job, STATUS.NO_QUOTA, 'TEMPLATE_NOT_CONFIGURED');
    return { id: job._id, status: STATUS.NO_QUOTA };
  }
  if (!job.recipientOpenid) {
    await markFailed(job, STATUS.FAILED, 'NO_RECIPIENT');
    return { id: job._id, status: STATUS.FAILED };
  }
  const plan = await loadMealPlan(job.mealPlanId);
  if (!plan) {
    await markFailed(job, STATUS.FAILED, 'MEAL_PLAN_NOT_FOUND');
    return { id: job._id, status: STATUS.FAILED };
  }
  const result = await sendSubscribeMessage(job.recipientOpenid, templateId, plan);
  if (result.ok) {
    await markSent(job);
    return { id: job._id, status: STATUS.SENT };
  }
  // 错误码映射：参见微信小程序文档
  // 43101 用户未订阅 / 已用尽 -> no_quota
  // 43104 用户拒绝订阅 -> rejected
  // 其他 -> failed
  let status = STATUS.FAILED;
  if (result.errorCode === '43101') status = STATUS.NO_QUOTA;
  else if (result.errorCode === '43104') status = STATUS.REJECTED;
  await markFailed(job, status, result.errorCode);
  return { id: job._id, status, errorCode: result.errorCode };
}

/** 主入口：拉一批 pending 任务并处理 */
async function runOnce(templateId, limit) {
  const jobs = await listPending(limit);
  const results = [];
  for (const job of jobs) {
    try {
      if (job.channel === 'in_app') results.push(await processInApp(job));
      else if (job.channel === 'wechat_subscribe') results.push(await processSubscribe(job, templateId));
      else results.push({ id: job._id, status: 'skipped', reason: 'UNKNOWN_CHANNEL' });
    } catch (e) {
      console.error('job failed', job._id, e);
      try { await markFailed(job, STATUS.FAILED, 'INTERNAL_ERROR'); } catch (_) {}
      results.push({ id: job._id, status: STATUS.FAILED, error: String(e) });
    }
  }
  return { processed: jobs.length, results };
}

exports.main = async (event) => {
  const templateId = (event && event.templateId) || process.env.SUBSCRIBE_TEMPLATE_ID || '';
  const limit = (event && event.limit) || MAX_BATCH;
  return await runOnce(templateId, limit);
};

// 暴露给单元测试
exports._internals = {
  runOnce,
  listPending,
  loadMealPlan,
  markSent,
  markFailed,
  processInApp,
  processSubscribe,
  buildSubscribeData,
  sendSubscribeMessage,
  STATUS,
};