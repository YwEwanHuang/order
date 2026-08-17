const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getActiveDishes } = require('../db/cloudbase');

// GET /api/v1/dishes
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { category } = req.query;
    const dishes = await getActiveDishes({ category });
    res.json({ data: dishes, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;