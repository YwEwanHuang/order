/**
 * 为每个请求生成唯一 requestId
 */
const { randomUUID } = require('crypto');

function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = { requestId };
