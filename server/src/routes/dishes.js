/**
 * Strip internal ownership field from dish DTOs sent to clients.
 * createdBy is kept in the database for server-side authorization only.
 */
function toPublicDto(dish) {
  if (!dish) return dish;
  // eslint-disable-next-line no-unused-vars
  const { createdBy, ...pub } = dish;
  return pub;
}

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getActiveDishes,
  getAllDishes,
  getDishById,
  createDish,
  updateDish,
  deleteDish,
} = require('../db/cloudbase');

/**
 * GET /api/v1/dishes
 * 公开列表（只返回 is_active=1 的菜品）
 */
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    const dishes = await getActiveDishes({ category });
    res.json({ data: dishes.map(toPublicDto) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/dishes/:id
 * 公开单条（允许查非活跃，方便 admin 操作）
 */
router.get('/:id', async (req, res, next) => {
  try {
    const dish = await getDishById(req.params.id);
    if (!dish) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '菜品不存在' } });
    }
    res.json({ data: toPublicDto(dish) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/dishes
 * 创建菜品（需要认证，创建者 = 当前用户 openid）
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, category, description, imageUrl, isActive, sortOrder } = req.body;

    if (!name || !category) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'name 和 category 为必填字段' },
      });
    }

    const VALID_CATEGORIES = ['hot', 'cold', 'soup', 'staple', 'drink', 'other'];
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `category 必须是 ${VALID_CATEGORIES.join('/')} 之一` },
      });
    }

    const dish = await createDish({
      name,
      category,
      description,
      imageUrl,
      isActive,
      sortOrder,
      createdBy: req.user.openid,
    });

    res.status(201).json({ data: toPublicDto(dish) });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/dishes/:id
 * 更新菜品（需认证 + 所有权校验）
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await getDishById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '菜品不存在' } });
    }
    if (existing.createdBy !== req.user.openid) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权修改此菜品' } });
    }

    const { name, category, description, imageUrl, isActive, sortOrder } = req.body;

    if (category) {
      const VALID_CATEGORIES = ['hot', 'cold', 'soup', 'staple', 'drink', 'other'];
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: `category 必须是 ${VALID_CATEGORIES.join('/')} 之一` },
        });
      }
    }

    const updated = await updateDish(req.params.id, { name, category, description, imageUrl, isActive, sortOrder });
    res.json({ data: toPublicDto(updated) });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/dishes/:id
 * 删除菜品（软删除；需认证 + 所有权校验）
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await getDishById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '菜品不存在' } });
    }
    if (existing.createdBy !== req.user.openid) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权删除此菜品' } });
    }

    await deleteDish(req.params.id);
    res.json({ data: { id: req.params.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;