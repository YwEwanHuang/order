const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.get('/me', requireAuth, (req, res) => {
  res.json({
    data: { role: req.user.role },
    requestId: req.requestId,
  });
});

router.use('/dishes', require('./dishes'));
router.use('/meal-plans', require('./mealPlans'));
router.use('/admin', require('./admin'));

module.exports = router;