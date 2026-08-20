const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/errorHandler');
const { requestId } = require('./middleware/requestId');
const { ensureSchema } = require('./db/cloudbase');
const { writeLimiter } = require('./middleware/rateLimit');
const routes = require('./routes');

const app = express();

// 中间件
app.use(cors());
app.use(requestId);
app.use(express.json({ limit: '1mb' }));

// 限流：按 openid 区分，每人每 60 秒最多 30 次写操作
// 对菜品和菜谱的写操作启用限流
app.use('/api/v1/dishes', writeLimiter);
app.use('/api/v1/meal-plans', writeLimiter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/api/v1', routes);

// 内部接口（供 notify-admin 云函数调用）
app.use('/internal/notify', require('./routes/internal'));

// 统一错误处理
app.use(errorHandler);

const PORT = process.env.PORT || 80;

async function start() {
  await ensureSchema();
  return app.listen(PORT, () => {
    console.log(`蔓蔓点菜 API 运行中，端口 ${PORT}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[Startup] 数据库初始化失败', {
      errName: err?.name,
      errCode: err?.code,
      // Only log missing env var NAMES, never their values
      missingVars: collectMissingVars(),
    });
    process.exit(1);
  });
}

function collectMissingVars() {
  const missing = [];
  if (!process.env.MYSQL_ADDRESS) missing.push('MYSQL_ADDRESS');
  if (!process.env.MYSQL_USERNAME) missing.push('MYSQL_USERNAME');
  if (!process.env.MYSQL_PASSWORD) missing.push('MYSQL_PASSWORD');
  return missing;
}

module.exports = app;
module.exports.start = start;
