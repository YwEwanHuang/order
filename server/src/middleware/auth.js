/**
 * 身份认证中间件
 * 从微信云托管网关注入的 X-WX-OPENID 读取用户身份
 * 不接受客户端自报的 openid
 */

// 管理员白名单，从环境变量读取（逗号分隔）
function getAdminOpenids() {
  const env = process.env.ADMIN_OPENIDS || '';
  return env.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * 解析当前用户身份
 * 微信云托管会将 openid 注入到这个 header
 */
function resolveUser(req) {
  const openid = req.headers['x-wx-openid'];
  if (!openid) return null;

  const adminOpenids = getAdminOpenids();
  return {
    openid,
    role: adminOpenids.includes(openid) ? 'admin' : 'user',
  };
}

/**
 * 要求已登录（必须有 openid）
 */
function requireAuth(req, res, next) {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: '无法识别用户身份' },
      requestId: req.requestId,
    });
  }
  req.user = user;
  next();
}

/**
 * 要求是管理员
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: '需要管理员权限' },
      requestId: req.requestId,
    });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, resolveUser, getAdminOpenids };