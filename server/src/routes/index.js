const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// /me
router.get('/me', requireAuth, (req, res) => {
  res.json({ data: { role: req.user.role }, requestId: req.requestId });
});

// /dishes
router.use('/dishes', require('./dishes'));

// /meal-plans
router.use('/meal-plans', require('./mealPlans'));

// /admin/*
router.use('/admin', require('./admin'));

module.exports = router;