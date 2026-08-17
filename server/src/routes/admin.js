const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getAllDishes,
  getDishById,
  createDish,
  updateDish,
  getNotificationJobs,
  getSubscription,
  upsertSubscription,
} = require('../db/cloudbase');

// 所有管理接口需管理员权限
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// 菜品管理
// ---------------------------------------------------------------------------

// GET /api/v1/admin/dishes
router.get('/dishes', async (req, res, next) => {
  try {
    const dishes = await getAllDishes();
    res.json({ data: dishes, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/dishes/:id
router.get('/dishes/:id', async (req, res, next) => {
  try {
    const dish = await getDishById(req.params.id);
    if (!dish) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: '菜品不存在' },
        requestId: req.requestId,
      });
    }
    res.json({ data: dish, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/dishes
router.post('/dishes', async (req, res, next) => {
  try {
    const { name, category, description, imageUrl, isActive, sortOrder } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '菜品名称不能为空' },
        requestId: req.requestId,
      });
    }
    if (name.trim().length > 30) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '菜品名称不能超过30字' },
        requestId: req.requestId,
      });
    }

    const dish = await createDish({
      name: name.trim(),
      category: category || 'hot',
      description: description?.trim() || '',
      imageUrl: imageUrl || '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      sortOrder: sortOrder || 0,
    });

    res.status(201).json({ data: dish, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/admin/dishes/:id
router.patch('/dishes/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await getDishById(id);
    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: '菜品不存在' },
        requestId: req.requestId,
      });
    }

    const { name, category, description, imageUrl, isActive, sortOrder } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: '名称不能为空' },
          requestId: req.requestId,
        });
      }
      if (name.trim().length > 30) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: '名称不超过30字' },
          requestId: req.requestId,
        });
      }
      updates.name = name.trim();
    }
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description?.trim() || '';
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);

    const updated = await updateDish(id, updates);
    res.json({ data: updated, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 通知记录
// ---------------------------------------------------------------------------

// GET /api/v1/admin/notifications
router.get('/notifications', async (req, res, next) => {
  try {
    const jobs = await getNotificationJobs(req.user.openid);
    res.json({ data: jobs, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/subscriptions（记录订阅授权结果）
router.post('/subscriptions', async (req, res, next) => {
  try {
    const { templateId, remainingQuota } = req.body;
    if (!templateId || typeof remainingQuota !== 'number') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '参数不完整' },
        requestId: req.requestId,
      });
    }
    await upsertSubscription(req.user.openid, templateId, remainingQuota);
    res.status(201).json({ data: { ok: true }, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;