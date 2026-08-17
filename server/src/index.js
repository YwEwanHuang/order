const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/errorHandler');
const { requestId } = require('./middleware/requestId');
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`蔓蔓点菜 API 运行中，端口 ${PORT}`);
});

module.exports = app;