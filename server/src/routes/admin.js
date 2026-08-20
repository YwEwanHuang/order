const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getAllDishes,
  getDishById,
  createDish,
  updateDish,
  getAllMealPlans,
} = require('../db/cloudbase');

router.use(requireAuth);
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// 菜品管理
// ---------------------------------------------------------------------------

router.get('/dishes', async (req, res, next) => {
  try {
    const dishes = await getAllDishes();
    res.json({ data: dishes, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

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
    if (imageUrl !== undefined && imageUrl !== '') {
      if (typeof imageUrl !== 'string' || imageUrl.length > 512) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: '图片地址格式无效' },
          requestId: req.requestId,
        });
      }
      if (!imageUrl.startsWith('cloud://')) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: '图片地址必须为微信云存储 cloud:// 格式' },
          requestId: req.requestId,
        });
      }
      if (/[\n\r\t]/.test(imageUrl)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: '图片地址包含非法字符' },
          requestId: req.requestId,
        });
      }
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
    if (imageUrl !== undefined) {
      if (imageUrl !== '' && (typeof imageUrl !== 'string' || imageUrl.length > 512 || !imageUrl.startsWith('cloud://') || /[\n\r\t]/.test(imageUrl))) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: '图片地址格式无效' },
          requestId: req.requestId,
        });
      }
      updates.imageUrl = imageUrl;
    }
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);

    const updated = await updateDish(id, updates);
    res.json({ data: updated, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 点菜看板
// ---------------------------------------------------------------------------

router.get('/meal-plans', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const plans = await getAllMealPlans({ from, to });
    res.json({ data: plans, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;