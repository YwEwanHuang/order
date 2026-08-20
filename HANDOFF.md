# HANDOFF.md

> 追加式交接记录。每次交接后追加一条记录。

---

## 2026-08-19 - 开发进度审计文档同步

- 状态：PARTIAL（文档同步完成；MVP 尚未完成，未部署、未发布）
- 目标：将 2026-08-19 只读审计结论同步至任务、测试与部署文档，建立可继续执行的 TODO 和验收标准。
- 改动文件：
  - `TASKS.md` — 更新 29 项双轴状态、进度估算和 P0/P1 可判定完成标准。
  - `TEST_PLAN.md` — 记录 79、93、22/25 测试快照、覆盖率缺口及数据一致性关键用例。
  - `DEPLOYMENT_CHECKLIST.md` — 记录云环境/真机/回滚未验证状态，保留云函数迁移内容。
  - `HANDOFF.md` — 追加本条记录。
- 审计结论（估算）：13/29 COMPLETE、11 PARTIAL、4 NOT STARTED、1 EXTERNAL BLOCKED；工程范围完成度约 60%–65%，发布就绪度约 35%–40%，剩余约 6–9 个有效开发日，另加模板申请和真机/体验版外部等待时间。
- 证据快照（非本轮重新执行）：后端 9 套件/79 项通过，语句 76.32%、分支 58.41%；小程序 typecheck + build + 93 tests 通过；小程序覆盖率未完成；`notify-admin` 22/25 通过。
- 主要风险：POST 未实现持久化幂等；点菜与 `in_app` 通知非同一事务；服务端校验与 PUT version 不完整；云函数正式测试未闭环；Docker、真实云 MySQL、私有链路、线上 health、双账号真机和回滚未验证。
- 下一步：
  1. 优先推进 T-031，完成幂等、事务、版本与服务端校验测试。
  2. 修复并闭环通知云函数测试与双账号真机验证。
  3. 建立统一 verify/覆盖率/密钥扫描，并完成云环境、私有链路与回滚验收。
- Git：main / `62ed28e` / dirty（本条仅文档同步；保留既有云函数迁移、测试和工作流在研修改）。

---

## 2026-08-20 - 管理员通知流闭环（重试配额 bug + 云函数测试闭环）

- 状态：PARTIAL（代码与单测闭环；真机/云环境验证仍待 T-044）
- 目标：修复 `admin/notifications/:id/retry` 在任务不存在/非 wechat_subscribe/已送达三种情况下仍消耗订阅额度的 bug；将 `notify-admin` 云函数测试从 22/25 闭环到 25/25，并把 npm test 由占位失败命令改为真实 jest 任务。
- 改动文件：
  - `server/src/routes/admin.js` — 重试接口改为四道闸门：先查任务（无则 404），再校验 channel（非 wechat_subscribe 则 400），再校验 status（已送达则 409），最后才消耗额度并回写 `pending`。中间异常不再扣减配额。
  - `server/src/routes/internal.js` — `/internal/notify/pending-jobs` SELECT 增补 `meal_type/note/created_at`，行映射同步返回 `mealType/note/createdAt/dishNames`，云函数所需的字段全部带出。
  - `server/src/routes/internal.test.js` — mock 列与断言同步更新。
  - `server/src/routes/api.test.js` — API-031/API-032 修正为 mock `getNotificationJobs`；新增 API-032a/b/c 覆盖 404 / INVALID_CHANNEL / ALREADY_SENT 三个新闸门。
  - `cloudfunctions/notify-admin/index.js` — 整体重写：原 CloudBase 文档库读取改为 `cloud.callContainer` 调内部接口；模板字段对齐用户实际模板 `thing11/time26/time36/thing4`；新增 `SUBSCRIBE_ENABLED` 早返；完整错误码映射（40014/43101/43104/43105/41030/45009）；JSDoc 中 `*/1` 误闭合注释块已改写为「每分钟一次，详见 config.json」。
  - `cloudfunctions/notify-admin/jest.config.cjs`、`jest.setup.cjs`、`index.test.js` — 新建。`wx-server-sdk` 以 `{ virtual: true }` 形式全局 mock；25 项单测覆盖 `_internals`（truncate / formatLocalDateTime / mapWxErrorCode / mealTypeDefaultTime / buildSubscribeData）与 `exports.main`（早返 / 端到端 fetch→send→report / wxErrCode 43101 → no_quota / fetchPendingJobs 抛错）。
  - `DEPLOYMENT_CHECKLIST.md` — 模板字段纠正、定时触发器示例改写、云函数环境变量补 `SUBSCRIBE_TEMPLATE_ID` / `SUBSCRIBE_ENABLED`、部署命令改为根目录 `tcb fn deploy notify-admin`、明确「不要上传 WeChatDeloy/cloudfunctions/notify-admin/ 旧副本」。
  - 删除：`WeChatDeloy/cloudfunctions/notify-admin/{config.json,index.js,package.json}` — `git rm -r` 已执行；全仓 grep 已确认零残留引用。
- 验证命令与结果：
  - `cd server && node node_modules/jest/bin/jest.js` → **9 suites / 79 tests pass**（含 3 个重试新闸门测试）
  - `cd cloudfunctions/notify-admin && node ../../server/node_modules/jest/bin/jest.js` → **1 suite / 25 tests pass**
  - `grep -rn 'WeChatDeloy/cloudfunctions/notify-admin'` → 0 命中
- 未解决风险（保持不变）：
  - T-031（点菜 + in_app 通知事务、幂等键）仍 PARTIAL
  - T-040（订阅额度 + 任务同一原子边界）仍 PARTIAL
  - T-044（开发版 + 体验版双账号真机）EXTERNAL BLOCKED，需用户操作
  - `sol-terra-gate` skill / `sol_reviewer` agent 本机不存在，本轮未做 Sol-Terra 评审门；用户已确认跳过
- 下一步：
  1. 推进 T-031（幂等 / 事务 / 服务端校验）。
  2. 推进 T-040（额度扣减与点菜同事务）。
  3. 用户在微信公众平台申请模板并完成双账号真机后，再补做 T-044 真机验证与覆盖率 80% 目标。
- Git：main / `62ed28e` / dirty（含本 HANDOFF 条目 + 上述全部代码/测试/文档改动，未 commit；按用户要求由其本人提交）。

---

## 2026-08-20 - notify-admin statusCode 显式校验 + mock 隔离加固

- 状态：DONE（代码与单测闭环；真机/云环境验证仍待 T-044）
- 目标：修复 2026-08-20 评审中标记的 major 问题——`cloud.callContainer` 在 HTTP 非 2xx 时不抛错，原 `fetchPendingJobs`/`reportResult` 直接信任 `res.data`，401/400/500 会被静默吞掉，DB 状态写不进且运维无任何可见日志。
- 改动文件：
  - `cloudfunctions/notify-admin/index.js` — 新增 `ensureHttpOk(res, op)` 辅助函数，统一检查 2xx 并以 `[notify-admin] ${op} HTTP ${code}` 抛错；`fetchPendingJobs` 与 `reportResult` 改走该辅助函数；`fetchPendingJobs` 顺手移除冗余的 `+ new URL(apiUrl).search`（pathname 已不含 search）。`ensureHttpOk` 经 `exports._internals` 暴露给单测。
  - `cloudfunctions/notify-admin/index.test.js` — 单测由 25 增至 35：新增 7 项 `ensureHttpOk` 用例（2xx 透传 / 199/300/401/404/500/502 抛错 / null 与 {} 均产 `HTTP undefined`），新增 2 项 `exports.main` 端到端（`fetchPendingJobs` 返回 401 → 全流程失败且不发订阅消息；`subscribeMessage` 成功但 `reportResult` 返回 500 → `successCount=1` 仍计入成功）；同时把 `processes pending jobs` / `marks job no_quota` 两个老用例的 mock 补上 `statusCode: 200`；`beforeEach` 由 `jest.clearAllMocks()` 改为 `jest.resetAllMocks()`——后者会清掉 `mockResolvedValueOnce` 队列，避免上一个用例未消费完的响应泄漏到下一个用例（评审中提出的 nit）。
- 验证命令与结果：
  - `cd cloudfunctions/notify-admin && node ../../server/node_modules/jest/bin/jest.js` → **1 suite / 35 tests pass**
  - `cd server && node node_modules/jest/bin/jest.js` → **9 suites / 79 tests pass**（无回归）
- 未解决风险（保持不变）：
  - T-031 / T-040 / T-044 / `sol-terra-gate` 评审门：本轮均无新增进展
- Git：main / `62ed28e` / dirty（在 2026-08-20 闭环条目之上再叠加本轮代码/测试改动，未 commit；按用户要求由其本人提交）。

---

## 2026-08-17 18:41 - 项目状态审查 + 测试计划制定（Claude Code）

- 状态：DONE（审查完成，计划已制定）
- 目标：审查项目状态、制定测试用例、开发计划，使用 goal 模式继续开发
- 改动文件：
  - 新增 `TEST_PLAN.md` — 完整测试计划（M2–M5），含单元/API/边界测试用例
  - 新增 `WORKFLOW-DEV.md` — 开发流水线配置文件（备用）
  - 修正 `TASKS.md` 汇总表（原来显示"0 完成"已纠正为"5 完成"）
  - `HANDOFF.md` — 追加本条记录
- 验证命令与结果：
  - `git status --short` → `M WeChatDeloy/project.private.config.json`（未提交私钥配置）
  - 确认 domain/date.test.ts 和 selection.test.ts 已存在（质量良好）
  - 确认 server/package.json 缺少 jest/supertest（test infra agent 正在处理）
- 未解决风险：
  - T-003 仍阻塞 M4（订阅消息真机验证需用户在微信公众平台操作）
  - server 端测试框架尚未建立（agent server-test-setup 正在处理）
  - 前端页面与后端 API 对接未验证（需部署后联调）
  - cloudTipModal 组件仍是旧模板 JS（HANDOFF 遗留）
  - tabBar 图标文件路径待验证
- 下一步：
  1. 等待 server-test-setup agent 完成 jest 配置
  2. 等待 server-unit-tests 和 miniprogram-unit-tests agents 完成
  3. 运行 `cd WeChatDeloy/miniprogram && npm run verify` 验证前端编译
  4. 推进 M2（身份 + 菜品 API + 小程序 UI 对接）
  5. 推进 T-003 订阅消息真机验证（需用户操作）
- Git：main / 60c6fd0 / dirty（project.private.config.json 未提交）

---

## 2026-08-17 10:16 - T-011 TypeScript 小程序骨架

- 状态：DONE
- 目标：建立 TypeScript 小程序基础架构、domain 层、services 层和 7 个页面
- 改动文件：
  - `WeChatDeloy/miniprogram/package.json` + `tsconfig.json`
  - `WeChatDeloy/miniprogram/domain/` — types.ts、date.ts、selection.ts
  - `WeChatDeloy/miniprogram/services/api.ts` — callContainer 封装
  - `WeChatDeloy/miniprogram/app.ts` — 替换 app.js
  - `WeChatDeloy/miniprogram/app.json` — 注册 7 个页面 + tabBar
  - `WeChatDeloy/miniprogram/pages/` — menu、selection/confirm、meal-plans、profile、admin/dishes、admin/dish-edit、admin/notifications
  - `WeChatDeloy/project.config.json` — 项目名改为 manmanorder，关闭 urlCheck
- 验证命令与结果：项目结构已验证，commit `5d8c9bb` 成功
- 未解决风险：
  - 后端 API 尚未实现，前端页面骨架依赖的 `/api/v1/*` 接口全部空缺
  - WXML 中 `getSelectedCount()` 和 `isSelected()` 需改为 WXS 响应式（已创建 selection-helpers.wxs，WXML 引用待完善）
  - cloudTipModal 组件仍是旧模板 JS，未迁移
  - tabBar 图标文件路径可能需调整
- 下一步：
  1. 在微信开发者工具中验证小程序编译无报错
  2. 等待后端 API 实现后对接（方案 B）
  3. 完善 WXS helper 在 WXML 中的引用
  4. T-003 订阅消息真机验证
- Git：main / 5d8c9bb / clean

---

## 2026-08-17 09:46 - Claude Code 初始化

- 状态：DONE（部分）
- 目标：分析代码库，创建 CLAUDE.md，建立项目基础文档
- 改动文件：
  - 新增 `CLAUDE.md`
  - 新增 `DECISIONS.md`
  - 新增 `TASKS.md`
  - 初始化 Git 仓库（root commit）
- 验证命令与结果：`git log --oneline` → `d37d06d Initial commit: empty project baseline`
- 未解决风险：
  - Phase 0（订阅消息可行性）需用户手动在微信公众平台和真机上操作
  - 云托管账号密码已知但未写入仓库（正确做法）
- 下一步：
  - 用户完成 Phase 0 验证
  - 确认后开始 M1 工程骨架（T-010～T-014）
- Git：main / d37d06d / clean
