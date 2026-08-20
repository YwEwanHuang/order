# 整改方案（拨乱反正版）

> 编制日期：2026-08-20
> 结论：项目偏离核心需求。「管理员查看蔓蔓点的菜」——唯一被要求的功能——未实现；
> 周边堆砌了大量休眠/失效机器。本方案将项目收缩到预期功能，约 10000 行 → 约 2500 行。
> 本文档取代 DEVELOPMENT_PLAN.md / TASKS.md / TEST_PLAN.md 作为唯一执行基线。

---

## 1. 问题清单（证据）

| # | 问题 | 位置 |
|---|---|---|
| P1 | 管理员无任何接口/页面能看到蔓蔓点的菜。`GET /api/v1/meal-plans` 只返回本人记录；「通知记录」页只显示任务元数据（mealPlanId、版本、状态），无菜名无日期 | `server/src/routes/mealPlans.js:60`、`pages/admin/notifications/` |
| P2 | 站内通知 recipient 写成提交者本人（蔓蔓），管理员按自己 openid 查询永远为空——通知机器即使开启也不通 | `server/src/db/cloudbase.js:463,501` |
| P3 | 幂等键：客户端生成、服务端存列，但从未读回去重；同 key 重放实际返回 409，契约形同虚设 | `mealPlans.js:94`、`cloudbase.js:483` |
| P4 | version 乐观锁 + 409 冲突：2 人应用无并发场景，纯增加复杂度 | `cloudbase.js:427-461` |
| P5 | 通知任务队列 + 订阅配额 + 重试闸门 + 云函数轮询 + 内部 token API：`SUBSCRIBE_ENABLED=false`，模板申请外部阻塞，整条流水线休眠 | `routes/internal.js`、`quota.js`、`notifications.js`、`cloudfunctions/notify-admin/` |
| P6 | INFORMATION_SCHEMA 动态列内省遍布 DB 层：自己 `ensureSchema` 建的表又当不可知 schema 防御，DB 层 738 行一半是这个 | `cloudbase.js` |
| P7 | express-rate-limit：用户共 2 人 | `middleware/rateLimit.js` |
| P8 | 仓库垃圾：coverage/ 与 ts-out/ 编译产物入库、e2e.test.js/.ts 双份、两处 quickstartFunctions 模板、~15 张模板遗留图片、app.js/app.ts 双份 | 全仓 |
| P9 | 文档 5 份约 1500 行（DEVELOPMENT_PLAN/TASKS/TEST_PLAN/DEPLOYMENT_CHECKLIST/WORKFLOW-DEV），维护成本高于价值 | 根目录 |
| P10 | `api.ts:39-41` 硬编码 envId/serviceName 与 DECISIONS D007「不入仓库」口径矛盾；`baseUrl` 为死配置 | `services/api.ts` |
| P11 | 云托管公网入口未确认关闭：`X-WX-OPENID` 头在公网下可任意伪造 | 云托管控制台 |
| P12 | `emptyKind` 三元表达式两分支相同，空态判断失效 | `pages/menu/index.ts:92` |

---

## 2. 目标产品定义（收缩后）

**核心闭环：蔓蔓点菜 → 我打开小程序看到 → 做饭。**

### 范围内

1. 菜品库：管理员新增/编辑/启停菜品（含图片），普通用户浏览启用菜品。
2. 点菜：蔓蔓选日期（今天~+30 天）+ 餐次（早/午/晚）+ 多道菜 + 备注，提交。
   同一「人 + 日期 + 餐次」重复提交 = 覆盖（last-write-wins）。
3. 我的记录：本人按日期查看自己的点菜。
4. **点菜看板（新增，核心）**：管理员查看所有人的点菜记录，按日期分组，显示菜名/餐次/备注/提交时间。
5. 身份：网关注入 `X-WX-OPENID` + `ADMIN_OPENIDS` 白名单（保持现状，正确）。

### 范围外（明确砍掉）

- 微信订阅消息推送全链路（任务队列、配额、重试、云函数、内部 API）
- 幂等键机制、version 乐观锁、PUT 修改接口（POST 即 upsert）
- 限流、动态列内省
- 若日后需要推送：做成提交时直接调 `subscribeMessage.send` 的 ~20 行版本，不建队列

---

## 3. 整改项与验收标准

### 阶段 1：仓库卫生

**改动：**

- `git rm -r`：`server/coverage/`、`WeChatDeloy/ts-out/`、`server/e2e/e2e.test.js`（保留 .ts）、
  `cloudfunctions/quickstartFunctions/`、`WeChatDeloy/cloudfunctions/`、
  `WeChatDeloy/miniprogram/app.js`（保留 app.ts）、`.codex/workflows/`
- 删除模板遗留图片：`images/` 下 ai_example*、cloud_dev、create_*、database*、env-select、
  function_deploy、scf-enter 等与业务无关的 png
- `.gitignore` 补：`coverage/`、`ts-out/`、`*.tsbuildinfo`

**验收：**

- [ ] `git status` 干净；上述路径不再被 git 跟踪
- [ ] `find . -name "*.test.js" -path "*/e2e/*"` 仅剩一份 e2e 实现
- [ ] 小程序在 DevTools 仍能编译（删除 app.js/ts-out 不破坏构建链）

### 阶段 2：服务端手术

**删除文件：**

- `server/src/routes/internal.js` + `internal.test.js`
- `server/src/routes/quota.js` + `quota.test.js`
- `server/src/routes/notifications.js` + `notifications.test.js`
- `server/src/middleware/rateLimit.js`（及 index.js 中挂载、package.json 依赖）
- `cloudfunctions/notify-admin/`（整个目录）
- `server/openapi.yaml`（API 表收进 README）

**改写 `server/src/db/cloudbase.js`（738 → ~250 行）：**

- 删除：`getTableColumns`/`pickExisting`/`migrateColumn`/`columnCache` 及所有动态列拼 SQL；
  改为固定列名。schema 由 `ensureSchema` 唯一拥有，漂移时人工 ALTER
- 删除：notification_jobs / notification_subscriptions 两表的建表与全部读写函数
- 删除：meal_plans 的 `idempotency_key` 逻辑与 version 冲突分支
- `upsertMealPlan` 简化为 `INSERT ... ON DUPLICATE KEY UPDATE items/note/updated_at`
  （确定性主键防双击重复，无需事务、锁、版本）
- 新增：`getAllMealPlans({ from, to })` 返回全部用户记录

**改写路由：**

- `routes/mealPlans.js`：删 PUT、幂等键、`enqueueAdminSubscribeNotifications`；
  保留 GET（本人）+ POST（upsert，校验 date/mealType/items 1~20/note ≤100）
- `routes/admin.js`：删 notifications/retry/subscriptions 三组端点及重复的
  `router.use(requireAdmin)`；新增 `GET /api/v1/admin/meal-plans?from&to`
- `routes/index.js`、`src/index.js`：同步摘除已删模块挂载

**验收：**

- [ ] `cd server && npx jest` 全部通过（保留 auth/dishes/mealPlans/admin 用例，删除机器的用例一并删）
- [ ] 本地 `MYSQL_* 指向测试库` 启动后 curl 验证：
  - `POST /api/v1/meal-plans` 同一 openid+date+mealType 连打 3 次 → 数据库仅 1 行，内容为最后一次
  - `GET /api/v1/admin/meal-plans`：管理员 openid 返回含他人记录（含菜名快照）；普通 openid 返回 403
  - `GET /api/v1/dishes` 普通用户仅见启用菜品
- [ ] `grep -rn "notification\|quota\|subscri\|idempoten\|rateLimit" server/src/` 零命中（大小写不敏感）
- [ ] `server/src` 总行数 ≤ 600

### 阶段 3：小程序手术

**改动：**

- `pages/admin/notifications/` → 改造为「点菜看板」：调 `GET /api/v1/admin/meal-plans`，
  按日期分组展示 餐次/菜名列表/备注/提交时间，默认展示今天起近 7 天，支持下拉刷新
- `pages/profile/`：删订阅授权入口、配额显示、模板缺失提示；管理入口改为「菜品管理」+「点菜看板」
- `pages/selection/confirm.ts`：删 version/existingPlanId 分支、幂等键、`loadNotificationStatus`；
  统一走 `submitMealPlan`（服务端 upsert）
- `pages/meal-plans/`：修改入口改为带当前选择跳回 confirm 重新提交（无需 planId/version）
- `services/api.ts`：删 quota/subscription/notification/retry/updateMealPlan/generateIdempotencyKey
  及 `baseUrl` 死配置；`domain/types.ts` 同步删除对应类型
- 修 `pages/menu/index.ts:92`：`emptyKind` 按 `dishes.length === 0` 正确赋 'none'/'category'
- `app.json`：页面注册同步更新

**验收：**

- [ ] `cd WeChatDeloy/miniprogram && npx tsc --noEmit` 通过；`npx vitest run` domain 测试全绿
- [ ] DevTools 真实编译零报错（按 `.claude/skills/wechat-miniprogram-dev/references/verification.md` 流程）
- [ ] DevTools 截图证据：菜单页、确认页、我的记录页、点菜看板页各一张
- [ ] `grep -rn "quota\|subscri\|idempoten\|version" WeChatDeloy/miniprogram/{pages,services,domain}` 仅剩与业务无关命中（如 npm 包内部）

### 阶段 4：部署与真机闭环

**改动：** 重新部署云托管（根 Dockerfile 不变）；核对环境变量仅需
`MYSQL_ADDRESS/MYSQL_USERNAME/MYSQL_PASSWORD/ADMIN_OPENIDS`，删除 NOTIFY_*/SUBSCRIBE_* 配置。

**验收：**

- [ ] 云托管新版本 `/health` 200；启动日志无表结构报错
- [ ] **公网入口关闭**，小程序经 `callContainer` 全部功能正常（P11 的唯一有效防线）
- [ ] 双账号真机闭环：蔓蔓账号点菜提交 → 管理员账号打开看板看到该记录（菜名、餐次、备注正确）
- [ ] 蔓蔓账号访问看板/菜品管理 → 提示无权限，接口 403
- [ ] 同餐次重复提交 → 看板只显示最新一次，无重复行

### 阶段 5：文档合并

**改动：**

- 新建 `README.md`（≤120 行）：项目一句话定位、架构图 3 行、API 一张表、
  本地开发/测试/部署命令、环境变量清单（占位符）
- `DECISIONS.md` 追加一条 ADR：记录本次收缩决策（砍推送/锁/幂等键/队列，POST 即 upsert）
  并修正 D007 口径（env id/service 名为客户端可见标识，非密钥）
- 删除：`DEVELOPMENT_PLAN.md`、`TASKS.md`、`TEST_PLAN.md`、`DEPLOYMENT_CHECKLIST.md`、
  `WORKFLOW-DEV.md`、`HANDOFF.md`（历史留在 git）
- `CLAUDE.md` 中指向已删文档的引用同步更新

**验收：**

- [ ] `grep -rn "DEVELOPMENT_PLAN\|TASKS.md\|TEST_PLAN" --include="*.md" .` 零残留引用
- [ ] 新人只读 README 能完成：本地起服务 → 跑测试 → 部署

---

## 4. 总验收（Definition of Done）

1. 真机：蔓蔓选菜提交，管理员打开小程序 30 秒内在看板看到点了什么。
2. 双击/重试/重复提交不产生重复记录；重复提交 = 覆盖。
3. 普通用户无法访问任何 admin 接口（403），无法读他人记录。
4. 公网入口关闭后全功能可用；仓库无真实密钥/openid。
5. `server && npx jest` 与 `miniprogram && npx vitest run && npx tsc --noEmit` 退出码 0。
6. 全仓业务代码（不含 node_modules/锁文件）≤ 3000 行。

---

## 5. 待拍板

| 决策 | 建议 | 状态 |
|---|---|---|
| 微信订阅消息推送 v1 是否砍掉 | 砍。看板即产品；日后要推送做 20 行直发版 | 已建议，待确认 |
| HANDOFF.md 是否删除 | 删（历史在 git log） | 已建议，待确认 |
