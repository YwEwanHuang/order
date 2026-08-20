// server/src/routes/index.js
const express = require('express');
const dishes = require('./dishes');
const mealPlans = require('./mealPlans');

const router = express.Router();
router.use('/dishes', dishes);
router.use('/meal-plans', mealPlans);

module.exports = router;
