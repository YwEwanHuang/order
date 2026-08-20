const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

// 所有管理接口先要求已登录，再要求是管理员
router.use(requireAuth);
router.use(requireAdmin);
const {
  getAllDishes,
  getDishById,
  createDish,
  updateDish,
  getNotificationJobs,
  getSubscription,
  upsertSubscription,
  updateNotificationStatus,
  consumeQuota,
} = require('../db/cloudbase');

// 所有管理接口需管理员权限
router.use(requireAdmin);

// 管理端写操作同样受全局限流控制
router.use(writeLimiter);

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
// 通知记录
// ---------------------------------------------------------------------------

// GET /api/v1/admin/notifications
router.get('/notifications', async (req, res, next) => {
  try {
    const jobs = await getNotificationJobs(req.user.openid);
    const decorated = jobs.map(normalizeNotificationJob);
    res.json({ data: decorated, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/notifications/:id/retry
router.post('/notifications/:id/retry', async (req, res, next) => {
  try {
    const { id } = req.params;
    // 找到对应任务（仅管理员自己的）
    const jobs = await getNotificationJobs(req.user.openid);
    const job = jobs.find(j => j._id === id);
    if (!job) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: '任务不存在' },
        requestId: req.requestId,
      });
    }
    // 只重试 wechat_subscribe 任务（in_app 无外部消费者，重试没意义，且不应消耗订阅额度）
    if (job.channel !== 'wechat_subscribe') {
      return res.status(400).json({
        error: { code: 'INVALID_CHANNEL', message: '该任务不能重试' },
        requestId: req.requestId,
      });
    }
    // 已送达的任务不重试
    if (job.status === 'sent') {
      return res.status(409).json({
        error: { code: 'ALREADY_SENT', message: '任务已送达' },
        requestId: req.requestId,
      });
    }
    // 消耗一次订阅额度
    const consumed = await consumeQuota(req.user.openid);
    if (!consumed) {
      return res.status(409).json({
        error: { code: 'NO_QUOTA', message: '没有可用的订阅额度' },
        requestId: req.requestId,
      });
    }
    await updateNotificationStatus(id, 'pending', null);
    res.status(202).json({
      data: { id, status: 'pending' },
      requestId: req.requestId,
    });
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

// ---------------------------------------------------------------------------
// 通知记录规范化
// ---------------------------------------------------------------------------
function normalizeNotificationJob(doc) {
  return {
    id: doc._id,
    mealPlanId: doc.mealPlanId,
    mealPlanVersion: doc.mealPlanVersion,
    channel: doc.channel,
    status: doc.status,
    attemptCount: doc.attemptCount || 0,
    lastErrorCode: doc.lastErrorCode || null,
    createdAt: new Date(doc.createdAt).toISOString(),
    sentAt: doc.sentAt ? new Date(doc.sentAt).toISOString() : null,
  };
}