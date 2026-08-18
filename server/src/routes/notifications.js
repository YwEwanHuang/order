/**
 * 用户通知订阅路由
 * POST /api/v1/notifications/subscribe — 接受订阅通知（存储订阅信息）
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { upsertSubscription } = require('../db/cloudbase');

/**
 * POST /api/v1/notifications/subscribe
 * Body: { templateId: string, quota?: number }
 * 存储/更新用户的订阅模板ID和配额
 */
router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { templateId, quota = 0 } = req.body;
    if (!templateId || typeof templateId !== 'string') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'templateId 为必填字符串' },
        requestId: req.requestId,
      });
    }
    await upsertSubscription(req.user.openid, templateId, Number(quota));
    res.json({ data: { ok: true }, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;