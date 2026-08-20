# 蔓蔓点菜 — 部署与集成验证清单

> Phase C（集成验证），需要微信云环境真实账号，不可自动化

> 当前状态（2026-08-19 审计快照）：本地 Docker、线上 Cloud Run health、真实云 MySQL 与重启持久化、生产私有链路、开发版/体验版双账号真机和回滚演练均**未验证**。线上 health 检查受本机证书链/超时影响，不能据此推断服务已下线；所有无证据项目保持未勾选。

---

## 一、环境准备

### 1.1 微信云托管（Cloud Run）

- [ ] 在微信云托管控制台确认服务名称（`cloudServiceName`）
- [ ] 确认 MySQL 实例地址、用户名、密码（平台自动注入 `MYSQL_ADDRESS` / `MYSQL_USERNAME` / `MYSQL_PASSWORD`）
- [ ] 确认已配置环境变量：

| 变量名 | 值 | 说明 |
|--------|----|------|
| `MYSQL_ADDRESS` | 自动注入 | 托管平台提供 |
| `MYSQL_USERNAME` | 自动注入 | 托管平台提供 |
| `MYSQL_PASSWORD` | 自动注入 | 托管平台提供 |
| `ADMIN_OPENIDS` | `oXXXX-xxx,oYYYY-yyy` | 管理员 openid 列表，逗号分隔 |
| `SUBSCRIBE_TEMPLATE_ID` | `Zxxxxx...` | 微信订阅消息模板 ID，需提前在公众平台申请 |
| `SUBSCRIBE_ENABLED` | `true` | 设为 `true` 才创建 wechat_subscribe 任务 |
| `NOTIFY_API_TOKEN` | `<随机字符串>` | 与 notify-admin 云函数共享的访问令牌 |

### 1.2 订阅消息模板

- [ ] 在微信公众平台申请订阅消息模板（类目：餐饮 > 点餐）
- [ ] 模板需包含以下字段（关键字必须与云函数代码中一致）：
  - `thing11` — 订单信息（菜名用「、」拼接，≤20 字）
  - `time26`  — 预定时间（`yyyy-MM-dd HH:mm`，如 `2026-08-18 18:00`）
  - `time36`  — 下单时间（`yyyy-MM-dd HH:mm`）
  - `thing4`  — 订单备注（≤20 字）
- [ ] 将模板 ID 填入 `SUBSCRIBE_TEMPLATE_ID`

### 1.3 notify-admin 云函数

- [ ] 在微信云开发控制台创建云函数 `notify-admin`
- [ ] 上传项目根目录下 `cloudfunctions/notify-admin/`（包含 `index.js`、`package.json`）—— **不要上传** `WeChatDeloy/cloudfunctions/notify-admin/` 的旧副本
- [ ] 配置环境变量：

| 变量名 | 值 |
|--------|----|
| `NOTIFY_API_URL` | Express 服务对外地址，如 `https://express-xxx.sh.run.tcloudbase.com` |
| `NOTIFY_API_TOKEN` | 与 Cloud Run 中 `NOTIFY_API_TOKEN` 一致 |
| `SUBSCRIBE_TEMPLATE_ID` | 与 1.2 中申请的模板 ID 一致 |
| `SUBSCRIBE_ENABLED` | `true`（与 Cloud Run 同步，否则云函数会跳过） |

- [ ] 配置定时触发器（每分钟）：`config.json` 中已定义 `0 */1 * * * * *`
- [ ] 配置权限：`subscribeMessage.send`

---

## 二、部署步骤

### 2.1 部署 Express API（Cloud Run）

```bash
# 在项目根目录使用根 Dockerfile 构建
docker build -t manmanorder-api -f Dockerfile .

# 部署到 Cloud Run（具体命令参考 CloudBase CLI 文档）
tcb cloudrun deploy \
  --service-name manmanorder-api \
  --port 80 \
  --env MYSQL_ADDRESS=$MYSQL_ADDRESS \
  --env MYSQL_USERNAME=$MYSQL_USERNAME \
  --env MYSQL_PASSWORD=$MYSQL_PASSWORD \
  --env ADMIN_OPENIDS=$ADMIN_OPENIDS \
  --env SUBSCRIBE_TEMPLATE_ID=$SUBSCRIBE_TEMPLATE_ID \
  --env SUBSCRIBE_ENABLED=true \
  --env NOTIFY_API_TOKEN=$NOTIFY_API_TOKEN
```

### 2.2 部署云函数

```bash
# 在项目根目录下（cloudfunctions/ 目录在根目录）
tcb fn deploy notify-admin
```

---

## 三、集成验证（真机测试）

### 3.1 订阅授权（管理员操作一次）

1. 用管理员账号打开小程序 → "我的"
2. 点击"开启提醒" → 微信弹出订阅授权 → 点击"允许"
3. 确认页面显示"已开启，下次点菜将收到微信提醒"和"剩余 1 次授权"

**验证点：** `notification_subscriptions` 表中该管理员有一条记录，`remaining_quota = 1`

### 3.2 普通用户提交点菜（蔓蔓账号）

1. 用普通用户账号打开小程序
2. 选择日期、餐次、至少一道菜
3. 点击"去确认" → 确认提交
4. 看到"点菜已保存"

**验证点：**
- `meal_plans` 表有新记录
- `notification_jobs` 表有两条新记录（`in_app` + `wechat_subscribe`），状态均为 `pending`
- `notification_subscriptions` 表中该管理员的 `remaining_quota` 被扣减为 `0`

### 3.3 站内通知（自动）

1. 用管理员账号打开小程序 → "我的" → "通知记录"
2. 看到刚提交的点菜记录，状态为"站内通知: 已送达"

### 3.4 微信订阅消息（云函数触发）

等待云函数定时触发（约 1 分钟内），或手动在云函数控制台点击"测试"：

**验证点：**
- `notification_jobs` 表中该 `wechat_subscribe` 记录状态变为 `sent`，`sent_at` 有值
- 管理员手机收到微信服务通知，点击后跳到小程序点菜记录页

### 3.5 无配额场景

用管理员取消订阅后重复 3.2：

**验证点：** `notification_jobs` 表中该 `wechat_subscribe` 记录状态为 `no_quota`，错误码为 `NO_QUOTA_ON_ENQUEUE`

---

## 四、验证命令汇总

```bash
# 服务端测试（本地）
cd server && npx jest

# 小程序单测（本地）
cd WeChatDeloy/miniprogram && npx vitest run

# TypeScript 类型检查（本地）
cd WeChatDeloy/miniprogram && npx tsc --noEmit
```

---

## 五、发布阻塞项与验收记录

- [ ] Docker 镜像可从项目根 Dockerfile 构建，容器 health 检查通过，并保留脱敏日志证据。
- [ ] 真实云 MySQL 完成表结构/迁移验证；容器重启后菜品、点菜和通知数据仍存在。
- [ ] 生产业务 API 仅经 `callContainer` 私有链路访问；公网伪造身份头不能访问业务 API。
- [ ] 线上 health 通过独立网络与有效证书链复核；本轮未验证不表示服务下线。
- [ ] 云函数部署、权限、定时触发器、配额和状态回写与 3.1–3.5 的数据库结果一致。
- [ ] 开发版和体验版以普通用户/管理员双账号完成端到端验证；微信通知两分钟内送达并跳转正确记录。
- [ ] 部署切流与回滚演练完成；回滚后核心 API 可用且数据不丢失。
- [ ] 日志不含真实密钥、token、openid、数据库凭据或请求正文。

---

## 六、常见问题

| 现象 | 可能原因 |
|------|----------|
| 云函数调用 Express 返回 401 | `NOTIFY_API_TOKEN` 两端不一致 |
| 管理员收不到微信通知 | `SUBSCRIBE_ENABLED` 未设为 `true`，或模板 ID 未配置 |
| 站内通知无记录 | `ADMIN_OPENIDS` 未正确配置管理员 openid |
| 配额已扣但状态仍是 pending | 云函数未成功触发或回写失败，检查云函数日志 |
