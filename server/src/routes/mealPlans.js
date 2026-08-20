/**
 * Strip internal ownership field from meal plan DTOs sent to clients.
 * ownerOpenid is kept in the database for server-side authorization only.
 */
function toPublicDto(plan) {
  if (!plan) return plan;
  // eslint-disable-next-line no-unused-vars
  const { ownerOpenid, ...pub } = plan;
  return pub;
}

const express = require('express');
const router = express.Router();
const { requireAuth, getAdminOpenids } = require('../middleware/auth');
const {
  getMealPlansByUser,
  upsertMealPlan,
  getMealPlanById,
  createNotificationJob,
  updateNotificationStatus,
  getSubscription,
  createNotificationJobInTransaction,
  consumeQuotaInTransaction,
  getPool,
} = require('../db/cloudbase');

/**
 * 为管理员批量入队 wechat_subscribe 通知。
 * 配额扣减和任务创建在同一个事务内：配额不足则整个事务回滚，
 * 不留下悬空的通知记录。
 */
async function enqueueAdminSubscribeNotifications(planId, planVersion) {
  if (process.env.SUBSCRIBE_ENABLED !== 'true') return;
  const adminOpenids = getAdminOpenids();
  if (adminOpenids.length === 0) return;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    for (const adminOpenid of adminOpenids) {
      const consumed = await consumeQuotaInTransaction(connection, adminOpenid);
      if (!consumed) {
        // 无额度：跳过，不创建通知任务
        continue;
      }
      await createNotificationJobInTransaction(connection, planId, planVersion, 'wechat_subscribe', adminOpenid);
    }
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    console.error('[notify] wechat_subscribe enqueue failed', { errName: e?.name, errCode: e?.code });
  } finally {
    connection.release();
  }
}

// GET /api/v1/meal-plans
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const plans = await getMealPlansByUser(req.user.openid, { from, to });
    res.json({ data: plans.map(toPublicDto), requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/meal-plans（首次提交）
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { date, mealType, items, note } = req.body;

    // 基础校验
    if (!date || !mealType || !Array.isArray(items)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '缺少必填字段' },
        requestId: req.requestId,
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '至少选择一道菜' },
        requestId: req.requestId,
      });
    }

    if (items.length > 20) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '最多选择20道菜' },
        requestId: req.requestId,
      });
    }

    const idempotencyKey = req.headers['idempotency-key'];
    const plan = await upsertMealPlan(
      req.user.openid,
      date,
      mealType,
      items,
      note,
      undefined, // 首次提交不传 version
      { idempotencyKey } // 幂等键
    );

    // 订阅通知在独立事务中入队；失败不阻塞主流程
    enqueueAdminSubscribeNotifications(plan.id, plan.version).catch(console.error);

    res.status(201).json({ data: toPublicDto(plan), requestId: req.requestId });
  } catch (err) {
    if (err.code === 'IDEMPOTENCY_CONFLICT') {
      return res.status(409).json({
        error: { code: 'IDEMPOTENCY_CONFLICT', message: err.message },
        requestId: req.requestId,
      });
    }
    next(err);
  }
});

// PUT /api/v1/meal-plans/:id（修改）
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date, mealType, items, note, version } = req.body;

    // 校验记录归属
    const existing = await getMealPlanById(id);
    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: '记录不存在' },
        requestId: req.requestId,
      });
    }
    if (existing.ownerOpenid !== req.user.openid) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: '无权修改此记录' },
        requestId: req.requestId,
      });
    }

    if (version === undefined || version === null) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '缺少 version 字段' },
        requestId: req.requestId,
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '至少选择一道菜' },
        requestId: req.requestId,
      });
    }

    const plan = await upsertMealPlan(
      req.user.openid,
      existing.date, // 不允许改日期和餐次
      existing.mealType,
      items,
      note,
      version
    );

    // 订阅通知在独立事务中入队；失败不阻塞主流程
    enqueueAdminSubscribeNotifications(plan.id, plan.version).catch(console.error);

    res.json({ data: toPublicDto(plan), requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;