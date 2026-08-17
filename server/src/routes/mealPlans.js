const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getMealPlansByUser,
  upsertMealPlan,
  getMealPlanById,
  createNotificationJob,
  getSubscription,
  consumeQuota,
} = require('../db/cloudbase');

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

    // 异步创建通知任务（不阻塞响应）
    createNotificationJob(plan.id, plan.version, 'in_app', req.user.openid)
      .catch(console.error);

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

    createNotificationJob(plan.id, plan.version, 'in_app', req.user.openid)
      .catch(console.error);

    res.json({ data: plan, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;