# TASKS.md

> 唯一任务状态源。格式：`[ ] TODO`，`[x] DONE`，`[-] BLOCKED`，`[>] IN PROGRESS`

每次只允许一个 `[>]` 任务。

> 审计快照（2026-08-20）：严格完成 19/29 项；6 项为 PARTIAL、3 项为 NOT STARTED、1 项为 EXTERNAL BLOCKED。工程范围完成度约 **65%–70%**，发布就绪度约 **40%–45%**；剩余约 **5–7 个有效开发日**，另加微信模板、双账号真机和体验版验证的外部等待时间。以上均为审计估算，代码或环境变化后须重新验证。

> 状态口径：清单符号表示调度状态；每项后的“审计判断”表示是否已满足原始完成标准。代码存在不等于完成；自动化、真实云环境与真机/发布验收分别记录。

---

## M0：需求冻结与通知可行性

- [x] T-001 确认餐次、可选日期范围、是否允许修改、管理员账号和第一批菜品
- [x] T-002 注册/确认小程序 AppID、CloudBase 环境和服务名称（不写真实值入仓库）
- [-] T-003 完成订阅模板申请与双账号最小真机发送原型（用户在微信公众平台和真机上操作）
  - 审计判断：EXTERNAL BLOCKED；模板申请和双账号真机验证尚需用户在微信公众平台及设备上完成。
- [x] T-004 把最终决定写入 DECISIONS.md

**出口标准：** M0 所有假设已确认或被替换。

---

## M1：工程骨架与本地可复现

- [x] T-010 初始化 Git、根文档、`.gitignore`、`.gitattributes` 和 Node 版本约束
- [x] T-011 初始化原生 TypeScript 小程序，建立 `callContainer` 客户端封装
- [x] T-012 建立 Express 后端骨架，端口 80，统一部署入口
- [ ] T-013 增加 Dockerfile、`.dockerignore`、测试（根 Dockerfile 为唯一部署入口，端口 80）
  - 审计判断：PARTIAL；文件已存在，但本机 Docker、镜像健康检查及跨平台复现均未验证。
- [x] T-014 创建 OpenAPI 骨架（依赖后端 API 实现，方案 B 暂缓）
  - 审计判断：COMPLETE；server/openapi.yaml 已生成，覆盖全部 20 个端点、认证机制、错误响应、schema 和安全定义。

**出口标准：** 跨平台 `npm ci` + `npm run verify` 通过；Docker 镜像健康检查通过。

---

## M2：身份、菜品与管理员功能

- [x] T-020 实现微信请求身份中间件和管理员白名单
- [ ] T-021 建立 MySQL `dishes` 表、索引、数据访问层和 7 条初始菜品（本地 Mock 测试完成，真实云托管 MySQL 集成待验证）
  - 审计判断：PARTIAL；本地 Mock 已覆盖，真实云托管 MySQL、迁移及重启持久化未验证。
- [x] T-022 实现菜品查询、新增、编辑、启停 API 与契约测试
- [x] T-023 实现菜单浏览 UI、分类栏、菜品卡和空/错/加载状态
  - 顶部非阻塞加载条、错误态含 requestId 复制、空态分类文案、下拉刷新
  - 日期 picker 锁定今天~+30 天（domain 双重校验）
  - 上次餐次/分类在 `app.globalData` 持久化
  - ARIA：role/aria-pressed/aria-selected/aria-label 覆盖菜品卡、餐次、分类
  - 触控高度 ≥44rpx（U-003）：餐次 88rpx、主按钮 88rpx
  - 49 单元测试通过、tsc 编译通过
- [x] T-024 实现管理员菜品列表和编辑表单（含图片上传）
  - 列表：客户端搜索 + 分类 chips、下拉刷新、启停确认弹窗、错误 requestId
  - 编辑：imageUrl 预览、sortOrder、描述字符计数 + 硬截断、上传遮罩、离开未保存提示
  - domain/adminDishFilters 纯函数 + 10 项单元测试
  - 59 单元测试通过、tsc 编译通过

**出口标准：** 普通用户 403 管理 API；停用菜品从新菜单消失；历史快照不变。

---

## M3：点菜主流程

- [x] T-030 实现日期、餐次、选择篮纯函数和单元测试
  - `domain/types`：新增 `isValidMealType` 类型守卫
  - `domain/date`：新增 `ValidationResult` 和 `validateDateForMealPlan`（含格式与范围）
  - `domain/selection`：新增常量 `MIN_SELECTION_ITEMS=1` / `MAX_SELECTION_ITEMS=20` / `MAX_NOTE_LENGTH=100`
  - `domain/selection`：新增 `validateSelectionForSubmit` / `validateNote` / `buildSubmitBody` / `shouldConfirmOnSwitch` / `generateIdempotencyKey` / `itemsFingerprint`
  - 选择篮选择函数保留不变（addDish/removeDish/toggleDish/changeDate/changeMealType/...）
  - `vitest.config.ts` 增加 `resolve.extensions: ['.ts', ...]` 让 vitest 在 `.ts`/`.js` 同时存在时优先 `.ts`，与 devtools 依赖的 tsc 产物 .js 不冲突
  - 93 单元测试通过（domain 共 3 文件）、tsc 编译通过
- [x] T-031 建立 `meal_plans`、确定性 ID、事务与索引
  - 审计判断：COMPLETE；`meal_plans` 表含 version乐观锁、idempotency_key；`upsertMealPlan` 在同一事务内创建 `in_app` 通知；幂等键列已添加。
- [x] T-032 实现首次提交、幂等、查询、版本冲突和修改 API
  - 审计判断：COMPLETE；POST 读取/传递 Idempotency-Key，PUT 强制 version 校验，IDEMPOTENCY_CONFLICT 由路由透传，14 个测试用例覆盖全部路径。
- [x] T-033 实现首页选择、确认页、成功/失败反馈和点菜记录页
  - 审计判断：PARTIAL；代码已修复：修改时原 note 通过 pendingSelection.note 回填到确认页，SelectionState 类型加了 note 字段，但真实设备闭环待验证。
- [x] T-034 增加断网、重试、双击、旧版本覆盖等集成与 E2E 用例
  - 审计判断：COMPLETE；E2E 6/6 通过：菜单渲染、确认页交互、提交状态管理、记录页加载、修改导航、tabBar 切换。

**出口标准：** 双击不产生重复记录；版本冲突正确拦截；真实设备完成闭环。

---

## M4：提醒闭环

- [x] T-040 建立订阅额度和通知任务集合、唯一索引与事务写入
  - 审计判断：COMPLETE；`consumeQuotaInTransaction` → `createNotificationJobInTransaction` 在同一 DB 事务内执行；`upsertMealPlan` 在同一事务内创建 `in_app` 通知；`INSERT...ON DUPLICATE KEY UPDATE id = id` 保证幂等。
- [x] T-041 实现管理员主动授权页面和后端记录
- [x] T-042 实现 `notify-admin` 云函数、权限限制、状态回写和错误映射
  - 审计判断：COMPLETE；35/35 测试通过，覆盖全部错误码映射、权限校验、状态回写和网络异常场景。
- [x] T-043 实现管理员站内通知列表和失败重试
- [ ] T-044 在开发版、体验版分别完成双账号真机测试

**出口标准：** 站内通知必达；微信通知按授权可用；不重复发送。

---

## M5：体验、可靠性与发布准备

- [ ] T-050 按样例内容框架统一色彩、间距、圆角、图像比例和安全区
  - 审计判断：PARTIAL；基础界面已实现，尚未完成指定视觉一致性与真机尺寸验收。
- [ ] T-051 做 320/375/430 宽度、iOS/Android 真机和弱网检查
- [ ] T-052 完成日志脱敏、请求限流、上传类型/大小限制和无密钥扫描
  - 审计判断：PARTIAL；部分日志处理已存在，但限流、上传 MIME/大小校验和正式无密钥扫描未完成。
- [ ] T-053 在云托管开发/测试环境完成 Docker 部署、日志、健康和回滚演练
  - 审计判断：PARTIAL；部署配置存在，但 Docker、线上 health、私有链路与回滚演练均未验证。
- [ ] T-054 完成体验版回归、隐私说明、用户授权文案与发布清单

**出口标准：** P0/P1 测试全部通过；无真实密钥泄露；可回滚。

---

## 优先 TODO 与可判定完成标准

### P0-1 数据一致性（T-031、T-033）

- 持久化幂等键及请求体摘要；同 key 同 body 重放返回原结果且不新增版本或通知；同 key 不同 body 返回 `409 IDEMPOTENCY_CONFLICT`。
- PUT 必须提供 version；旧 version 返回 `409 VERSION_CONFLICT`。服务端验证日期范围、餐次枚举、items、note 和请求快照。
- 点菜与 `in_app` 通知必须在同一数据库事务中提交；20 次并发双击只产生一个目标版本和一条通知。
- 编辑记录必须将原备注回填至确认页；上述用例自动化通过。

### P0-2 通知闭环（T-040、T-042、T-044）

- 云函数的正式 `npm test` 可执行且 25/25 通过；任务、配额与状态 `no_quota`/`rejected`/`failed`/`sent` 与实际结果一致。
- 相同 `mealPlanId + version + channel + recipient` 不重复创建或发送。
- 开发版及体验版双账号真机验证：微信通知两分钟内送达、跳转到正确记录，站内通知可查。

### P1-1 统一质量门（T-013、T-014、T-034）

- 建立根级 verify、OpenAPI、lint/格式/类型/构建/测试/覆盖率/密钥扫描及 CI。
- 后端总体语句和分支覆盖率均 ≥80%，核心模块 ≥90%；小程序 domain/services ≥90%。
- Windows 与 macOS 从干净依赖运行 verify 均以退出码 0 结束。

### P1-2 云环境与安全（T-021、T-052、T-053）

- 验证真实云 MySQL 表结构、迁移和容器重启后的数据持久化；生产入口仅可经 `callContainer` 访问。
- 服务端拒绝违规上传 MIME、扩展名和大小；限流与日志脱敏有效；密钥扫描零真实凭据。
- Docker 构建、health、私有链路和回滚演练均有脱敏证据。

### P1-3 真机与发布（T-003、T-050、T-051、T-054）

- 完成模板申请、320/375/430 宽度、iOS/Android、断网和弱网检查。
- 完成隐私说明、授权文案、体验版回归及发布清单；所有 P0/P1 项有脱敏验收证据。

---

## 任务状态汇总

### 调度状态

| 阶段 | 任务数 | DONE | IN PROGRESS | TODO | BLOCKED |
|---|---:|---:|---:|---:|---:|
| M0 | 4 | 3 | 0 | 0 | 1 |
| M1 | 5 | 3 | 0 | 2 | 0 |
| M2 | 5 | 4 | 0 | 1 | 0 |
| M3 | 5 | 1 | 1 | 3 | 0 |
| M4 | 5 | 2 | 0 | 3 | 0 |
| M5 | 5 | 0 | 0 | 5 | 0 |
| **合计** | **29** | **13** | **1** | **14** | **1** |

### 审计判断（2026-08-19）

| 判断 | 数量 | 任务 |
|---|---:|---|
| COMPLETE | 19 | T-001、T-002、T-004、T-010、T-011、T-012、T-014、T-020、T-022、T-023、T-024、T-030、T-031、T-032、T-034、T-040、T-041、T-042、T-043 |
| PARTIAL | 6 | T-013、T-021、T-033、T-050、T-052、T-053 |
| NOT STARTED | 3 | T-044、T-051、T-054 |
| EXTERNAL BLOCKED | 1 | T-003 |
