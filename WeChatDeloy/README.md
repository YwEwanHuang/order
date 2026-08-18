# 蔓蔓点菜 — 微信云托管部署

本目录为微信小程序端源码。后端 Express API 位于仓库根 `server/` 目录，容器化部署使用根 `Dockerfile`（端口 80）。

## 小程序开发

```sh
cd WeChatDeloy/miniprogram
npm ci
npm run dev    # 微信开发者工具导入 WeChatDeloy/ 目录
```

## 后端部署

**不要从本目录部署。** 从仓库根目录执行：

```sh
# 本地构建验证（需要 Docker）
docker build -t manmanorder-api .

# 部署到微信云托管（需提前获取 CLI 密钥，示例占位符）
wxcloud run:deploy . \
  --envId '<WX_CLOUD_ENV_ID>' \
  --serviceName '<SERVICE_NAME>' \
  --containerPort 80 \
  --dockerfile Dockerfile
```

## 环境变量（云托管环境变量中配置，不写入仓库）

| 变量 | 说明 |
|------|------|
| `MYSQL_ADDRESS` | 云托管 MySQL 连接地址（自动注入） |
| `MYSQL_USERNAME` | 云托管 MySQL 用户名（自动注入） |
| `MYSQL_PASSWORD` | 云托管 MySQL 密码（自动注入） |
| `ADMIN_OPENIDS` | 管理员 openid 白名单，逗号分隔 |
| `SUBSCRIBE_ENABLED` | `true` 时启用微信订阅消息通知（默认关闭） |
| `PORT` | 容器端口，默认 80 |