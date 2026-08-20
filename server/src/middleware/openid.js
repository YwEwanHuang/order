module.exports = function openidMiddleware(req, _res, next) {
  req.openid = req.headers['x-wx-openid'] || null;
  next();
};