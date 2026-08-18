const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// /me
router.get('/me', requireAuth, (req, res) => {
  // 订阅模板 ID 从环境变量读取；为空时前端不会弹订阅窗
  const subscribeTemplateId = process.env.SUBSCRIBE_TEMPLATE_ID || '';
  res.json({
    data: { role: req.user.role, subscribeTemplateId },
    requestId: req.requestId,
  });
});

// /dishes
router.use('/dishes', require('./dishes'));

// /meal-plans
router.use('/meal-plans', require('./mealPlans'));

// /quota
router.use('/quota', require('./quota'));

// /notifications
router.use('/notifications', require('./notifications'));

// /admin/*
router.use('/admin', require('./admin'));

module.exports = router;