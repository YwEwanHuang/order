const express = require('express');
const router = express.Router();
const { requireAuth, getAdminOpenids } = require('../middleware/auth');
const {
  getMealPlansByUser,
  upsertMealPlan,
  getMealPlanById,
  createNotificationJob,
  getSubscription,
} = require('../db/cloudbase');

/**
 * 提交后为每个管理员入队通知：
 * - in_app 兜底通知：所有管理员都能看到
 * - wechat_subscribe：仅当该管理员有订阅额度时创建（consumeQuota 原子扣减）
 */
function enqueueNotifications(planId, planVersion) {
  const adminOpenids = getAdminOpenids();
  if (adminOpenids.length === 0) {
    // 未配置管理员时，落到提交者本人；不影响主流程
    createNotificationJob(planId, planVersion, 'in_app', 'unknown-admin')
      .catch(console.error);
    return;
  }
  for (const adminOpenid of adminOpenids) {
    createNotificationJob(planId, planVersion, 'in_app', adminOpenid)
      .catch(console.error);
    consumeAndEnqueueSubscribe(planId, planVersion, adminOpenid);
  }
}

/**
 * 消费一条订阅额度并入队微信订阅消息通知；无额度时跳过
 */
async function consumeAndEnqueueSubscribe(planId, planVersion, adminOpenid) {
  try {
    const { consumeQuota } = require('../db/cloudbase');
    const consumed = await consumeQuota(adminOpenid);
    if (!consumed) return;
    await createNotificationJob(planId, planVersion, 'wechat_subscribe', adminOpenid);
  } catch (e) {
    console.error('enqueue wechat_subscribe failed:', e);
  }
}

// GET /api/v1/meal-plans
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const plans = await getMealPlansByUser(req.user.openid, { from, to });
    res.json({ data: plans, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/meal-plans（首次提交）
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { date, mealType, items, note } = req.body;

    // 基础校验
    if (!date || !mealType || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '缺少必填字段' },
        requestId: req.requestId,
      });
    }

    if (items.length > 20) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '最多选择20道菜' },
        requestId: req.requestId,
      });
    }

    const plan = await upsertMealPlan(
      req.user.openid,
      date,
      mealType,
      items,
      note,
      undefined // 首次提交不传 version
    );

    // 异步入队通知（不阻塞响应）
    enqueueNotifications(plan.id, plan.version);

    res.status(201).json({ data: plan, requestId: req.requestId });
  } catch (err) {
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

    enqueueNotifications(plan.id, plan.version);

    res.json({ data: plan, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;