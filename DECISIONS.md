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

---

## M2-D009：项目收缩至「蔓蔓点菜 → 看板可见」单闭环

- 日期：2026-08-20
- 状态：CONFIRMED

**背景：** 仓库累计约 10000 行 / 60+ 文件，唯一被产品要求的能力"管理员能看到蔓蔓点了什么"在原实现里从未落地（P1）。其上是睡眠/失效机器：通知任务队列、订阅配额、重试闸门、云函数、内部 token API（`SUBSCRIBE_ENABLED=false`，模板外部阻塞），以及乐观锁 + 幂等键 + 双列内省等技术债。维护成本高于价值。

**决定：** 砍掉整条通知/订阅流水线、乐观锁、幂等键、限流、动态列内省。点菜看板（管理员按日期查看所有人点菜记录）成为产品的通知/回顾唯一形态，POST 即 upsert（`INSERT ... ON DUPLICATE KEY UPDATE`，确定性主键防双击重复）。

**修正：**
- M0-D002 被本决策取代：点菜修改走 last-write-wins，无 `version`，无 409 冲突；审计通过看板即时可见，不需要通知历史链。
- M0-D005 被本决策取代：通知渠道删除，"提醒我"这一能力降级为"看板即提醒"。日后若需推送，做成提交时直发 `subscribeMessage.send` 的 ~20 行版本，不建队列、不建云函数。
- D007 口径修正：`cloudEnvId` / `cloudServiceName` 是客户端可见部署标识，不是密钥；客户端代码可保留运行时注入，不属于"敏感信息不写入仓库"范畴。但 `.gitignore` 仍保留防御性覆盖以避免开发者误提交真实账号元数据。

**后果：**
- 服务端：5 路由 → 3 路由；`cloudbase.js` 738 → ~250 行；删 `routes/internal.js|quota.js|notifications.js`、`middleware/rateLimit.js`、`cloudfunctions/notify-admin/`、`server/openapi.yaml`。
- 小程序：删订阅授权/配额/模板入口；`pages/admin/notifications/` 改造为点菜看板。
- 文档：合并为 `README.md` + `DECISIONS.md`；删除 `DEVELOPMENT_PLAN.md|TASKS.md|TEST_PLAN.md|DEPLOYMENT_CHECKLIST.md|WORKFLOW-DEV.md|HANDOFF.md`。
- 仓库目标 ≤3000 行业务代码（实际 ~2300）。

**验收：** 详见 `REFORM_PLAN.md` §4 总验收。

---

## M2-D010：callContainer 端到端真机验证通过

- 日期：2026-08-20
- 状态：CONFIRMED

**背景：** M2-D009 收缩后，前两次真机验证分别在 `app.ts` 缺失部署标识（`cloudEnvId` / `cloudServiceName` 为空字符串）与 `project.config.json` `useCompilerModule: true` 但缺 TS 编译插件（导致 `domain/date.js` 未生成）两处栽倒。两次修复后再次在模拟器验证。

**验证证据（点菜页 → 云托管 → MySQL → 返回 → 渲染）：**
- 模拟器 / 端：`pages/menu/index` 渲染 3 道菜（鸡蛋西红柿 / 土豆炖豆角 / 清炒生菜）
- 调试器 AppData：`dishes` 数组长度 3，每条 `id` / `name` / `isActive` / `category` / `sortOrder` 字段对齐
- 调试器 Console：无 `[menu] loadDishes failed` 异常
- Network XHR 列表为空 — 预期行为，`callContainer` 走微信内部私有通道，不会出现在 Network XHR 面板

**决定：** 端到端链路（小程序 → 云托管 → MySQL）验证通过。Network XHR 不可作为 callContainer 验证手段，AppData 中 `dishes` 实际填充是唯一可信证据。

**后果：**
- 真机 / 模拟器后续验证统一以"AppData 数据填充 + Console 无失败日志"为准，不依赖 Network XHR
- DevTools 模拟器已足以完成端到端数据链路验证，物理真机双账号 E2E 单独走

---

## M3-D011：单闭环重构（删 admin / 改 dinner-only / 改 7 天）

- 日期：2026-08-20
- 状态：CONFIRMED
- Spec：`docs/superpowers/specs/2026-08-20-manmanorder-single-loop-design.md`
- Plan：`docs/superpowers/plans/2026-08-20-manmanorder-single-loop.md`

**背景：** 用户实际需求为"2 人家庭晚餐"——一个人选菜，另一个人看。M2-D009 的范围仍过大（保留 admin/三餐/30 天），与需求不匹配。

**决定：**
- 餐次：仅保留 dinner；`meal_plans` 表删 `meal_type` 列。
- 日期范围：`[today, today+6]`（从 30 天缩到 7 天）。
- 鉴权：删除 `ADMIN_OPENIDS` / `requireAdmin`；任何 openid 可看可改可管理菜品。
- 上传方式：`PUT /api/v1/meal-plans` 取代 `POST`，语义即"覆盖"。
- 菜品：固定 10 道种子 + 任何人可增删改启停（无 admin 概念）。

**后果：**
- 服务端：3 路由组（dishes / meal-plans / health），`src/` ≤ 600 行。
- 小程序：3 页（home / select / dishes），无 tabBar，无 admin。
- 删除文件：cloudfunctions/、routes/{admin,internal,quota,notifications}.js、middleware/rateLimit.js、db/cloudbase.js、openapi.yaml、pages/{admin,profile,meal-plans,selection,menu}、多个 *.md 文档。

**验收：** Spec §9 不变量 1-8。