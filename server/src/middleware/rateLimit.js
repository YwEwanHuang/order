const rateLimit = require('express-rate-limit');

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.openid || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } },
});

module.exports = { writeLimiter };