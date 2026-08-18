/**
 * 用户配额路由
 * GET /api/v1/quota — 返回当前用户的订阅信息和剩余配额
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getSubscription } = require('../db/cloudbase');

/**
 * GET /api/v1/quota
 * 返回用户的订阅模板ID和剩余配额
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.user.openid);
    if (!subscription) {
      return res.json({
        data: { hasSubscription: false, remainingQuota: 0, templateId: '' },
        requestId: req.requestId,
      });
    }
    res.json({
      data: {
        hasSubscription: true,
        templateId: subscription.templateId || '',
        remainingQuota: subscription.remainingQuota || 0,
        acceptedAt: subscription.acceptedAt || null,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;