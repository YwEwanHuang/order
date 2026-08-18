const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/errorHandler');
const { requestId } = require('./middleware/requestId');
const { ensureSchema } = require('./db/cloudbase');
const routes = require('./routes');

const app = express();

// 中间件
app.use(cors());
app.use(requestId);
app.use(express.json({ limit: '1mb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/api/v1', routes);

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
