# DECISIONS.md

> 架构决策记录（ADR）。每次决策包含背景、决定和后果。

---

## M0-D001：餐次定义

- 日期：2026-08-17
- 状态：CONFIRMED

**背景：** 开发计划第 2.2 节假设需要确认。

**决定：** 采用三个餐次 `breakfast`、`lunch`、`dinner`，对应早餐、午餐、晚餐。

**后果：** 如果实际只用到两个，删除对应枚举值即可，不影响架构。

---

## M0-D002：点菜修改规则

- 日期：2026-08-17
- 状态：CONFIRMED

**背景：** 开发计划需要确认首次提交后是否允许修改。

**决定：** 允许修改。每次修改递增 `version`，以"用户 + 日期 + 餐次"为唯一业务键。

**后果：** 需要实现乐观锁（version 冲突返回 409）；历史修改不覆盖，通过通知记录保留审计链。

---

## M0-D003：可选日期范围

- 日期：2026-08-17
- 状态：CONFIRMED

**背景：** 需要明确用户可以点哪天的菜。

**决定：** 今天至未来 30 天（含今天），过去日期不可选。前端做拦截，后端也做校验。

**后果：** 常量 `MAX_FUTURE_DAYS = 30` 写入代码；如需调整可改常量而不改逻辑。

---

## M0-D004：角色模型

- 日期：2026-08-17
- 状态：CONFIRMED

**背景：** 需要明确普通用户和管理员的边界。

**决定：** 管理员和普通用户是两个不同微信账号。管理员 openid 通过环境变量 `ADMIN_OPENIDS` 白名单配置，不写入代码或仓库。

**后果：** 所有管理操作（菜品增删改、通知查看）必须携带 `X-WX-OPENID` 并在后端核验白名单。

---

## M0-D005：提醒策略

- 日期：2026-08-17
- 状态：CONFIRMED（站内必达，微信优先）

**背景：** 订阅消息是否可用需要 Phase 0 验证。

**决定：** 站内通知必达；微信订阅消息为可选增强渠道。若模板受限或授权失败，降级为纯站内通知。

**后果：** 每次点菜提交必定创建 `notification_jobs` 记录（`in_app` 通道必达）；`wechat_subscribe` 通道依赖 Phase 0 结果。

---

## M0-D006：初始菜品清单

- 日期：2026-08-17
- 状态：CONFIRMED

**菜品（7道）：**

| 名称 | 分类 | 图片 |
|---|---|---|
| 鸡蛋西红柿 | hot | 占位图 |
| 凉拌豆腐皮 | cold | 占位图 |
| 土豆炖豆角 | hot | 占位图 |
| 排骨冬瓜汤 | soup | 占位图 |
| 清炒生菜 | hot | 占位图 |
| 米饭 | staple | 占位图 |
| 大米粥 | staple | 占位图 |

**后果：** 测试数据使用 fixture；生产数据由管理员在 UI 中录入。

---

## M0-D007：云托管配置

- 日期：2026-08-17
- 状态：CONFIRMED（敏感信息不写入仓库）

**已配置（仅存在于运行环境，不写入仓库）：**

- API 端点：`https://express-stvz-298098-6-1318283518.sh.run.tcloudbase.com`
- callContainer env: `prod-d8gkzjj6ub74bba3b`
- callContainer service: `express-stvz`
- 模板源码：`https://github.com/WeixinCloud/wxcloudrun-express`
- 账号/密码：仅存在于云托管控制台

**后果：** `.gitignore` 必须覆盖所有 `.env*`、`.private.config.json`；本地只保留占位符值。

---

## M1-D008：云托管持久化使用内置 MySQL

- 日期：2026-08-18
- 状态：CONFIRMED

**背景：** 实际微信云托管环境提供 MySQL 5.7，并通过云托管环境变量注入
`MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`。原实现使用未开通且无法由
当前微信环境管理员签发 API Key 的 CloudBase 文档数据库，导致所有数据库请求返回 500。

**决定：** Express 后端改用云托管内置 MySQL；启动时幂等创建 `manmanorder`
数据库、业务表和 7 条初始菜品。凭据只从云托管环境变量读取，不写入代码、仓库或日志。

**后果：** `server/src/db/cloudbase.js` 暂时保留文件名以减少路由改动，但内部实现为
MySQL。文档数据库索引和 `CLOUDBASE_APIKEY` 方案不再适用于本项目；数据库与服务
仅通过云托管私有网络通信，验证完成后关闭二者公网入口。

> **注意**：通知消费者 `cloudfunctions/notify-admin` 仍使用 CloudBase 文档数据库，尚未迁移到 MySQL。`wechat_subscribe` 通道目前默认关闭（`SUBSCRIBE_ENABLED=false`），直到云函数完成迁移。
