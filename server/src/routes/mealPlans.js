const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getMealPlansByUser,
  upsertMealPlan,
} = require('../db/cloudbase');

function toPublicDto(plan) {
  if (!plan) return plan;
  const { ownerOpenid, ...pub } = plan;
  return pub;
}

// GET /api/v1/meal-plans?from&to — 自己的点菜记录
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const plans = await getMealPlansByUser(req.user.openid, { from, to });
    res.json({ data: plans.map(toPublicDto), requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/meal-plans — upsert；同一 openid+date+mealType 重复提交 = last-write-wins
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { date, mealType, items, note } = req.body;

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
    if (typeof note === 'string' && note.length > 100) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '备注不超过100字' },
        requestId: req.requestId,
      });
    }

    const plan = await upsertMealPlan(req.user.openid, date, mealType, items, note || '');
    res.status(201).json({ data: toPublicDto(plan), requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;