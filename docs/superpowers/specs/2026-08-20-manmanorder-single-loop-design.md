# 蔓蔓点菜 · 单闭环重构设计

**日期：** 2026-08-20
**状态：** 设计待用户审阅
**取代：** `REFORM_PLAN.md`（同名产物，原范围更宽）

---

## 1. 范围与原则

### 1.1 产品一句话

一个微信小程序，让用户为今天及未来 6 天的晚餐从固定菜品库选菜，并附文字备注；任何打开小程序的人（用户 / 做饭的人）都能在首页看到当天或未来某天的晚餐选了什么，也可修改。

### 1.2 范围内

1. **菜品库**：启动时幂等插入固定 10 道菜；任何人可增、删、改名、启停、调整排序。
2. **晚餐选菜**：选今天或未来 6 天的某一天；从菜品库勾选若干道 + 文字备注（≤100 字），保存即覆盖（last-write-wins）。
3. **查看**：任何 openid 进入首页都能看到当前所选日期的晚餐；无记录则显示空态。
4. **日期切换**：首页顶部日期选择器，今天~+6 天可选；过去日期不展示。
5. **身份**：Cloud Run 网关注入 `X-WX-OPENID`，仅用于审计与显示"由 XXXX 编辑于 HH:MM"，**不做权限判断**。

### 1.3 范围外（明确不做）

- 早 / 午 餐次
- 多用户隔离、隐私保护、角色权限
- 微信订阅消息推送、通知队列、提醒
- 乐观锁、版本号、幂等键、限流
- 菜品图片（仅显示菜名 + 分类色块）
- 历史记录查看、统计、看板式多日一览

### 1.4 设计原则

- **YAGNI**：去掉任何为多用户/多餐次/推送场景准备的扩展点。
- **能删则删**：能用一个数据库字段解决的不建第二张表；能用一行 SQL 解决的不写 ORM。
- **能看到的就直接显示**：选菜者看到的内容 = 做饭的人看到的内容，零差异。

---

## 2. 架构

### 2.1 部署形态

```
WeChat miniprogram (TypeScript)
        │ wx.cloud.callContainer  (private link, 网关自动注入 X-WX-OPENID)
        ▼
Express API (Cloud Run 容器, node:18-alpine)
        │ 读取 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD
        ▼
云托管内置 MySQL 5.7 (manmanorder 库, 2 张表: dishes / meal_plans)
```

- 部署：推 `origin/main` → Cloud Run 自动拉取并构建（根 `Dockerfile`）。
- 不依赖任何云函数、文档数据库、消息队列、订阅消息 API。

### 2.2 路由（最终 7 个）

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/health` | 健康检查 | - |
| GET | `/api/v1/dishes?includeInactive=true` | 菜品列表（默认仅启用；管理页用 includeInactive=true） | openid（仅记录，无判断） |
| POST | `/api/v1/dishes` | 新增菜品 | openid（仅记录） |
| PATCH | `/api/v1/dishes/:id` | 改名 / 改分类 / 启停 / 改排序 | openid（仅记录） |
| DELETE | `/api/v1/dishes/:id` | 删除菜品 | openid（仅记录） |
| GET | `/api/v1/meal-plans?date=YYYY-MM-DD` | 读取某天晚餐 | openid（仅记录） |
| PUT | `/api/v1/meal-plans` | upsert 某天晚餐 | openid（仅记录） |

> `PUT` 用于覆盖语义明确（"把这一天的晚餐替换成我这次提交的内容"），区别于新增菜品的 `POST`。日期范围校验：服务端拒绝 `date < today` 或 `date > today + 6`。

### 2.3 目录结构（重构后）

```
WeChatDeloy/
└── miniprogram/
    ├── pages/
    │   ├── home/index.ts|wxss|wxml|json       # 首页：日期选择 + 选/看晚餐
    │   ├── select/index.ts|wxss|wxml|json     # 选菜子页
    │   └── dishes/index.ts|wxss|wxml|json     # 菜品库管理
    ├── services/api.ts                          # callContainer 封装（精简版）
    ├── domain/
    │   ├── date.ts                              # 今天/明天/周几等
    │   ├── date.test.ts                         # vitest
    │   ├── mealPlan.ts                          # 日期范围校验、序列化
    │   ├── mealPlan.test.ts                     # vitest
    │   └── dish.ts                              # 排序、过滤、分类
    └── app.ts|json

（全部移除）
- pages/meal-plans/index, pages/profile/index, pages/admin/*
- pages/selection/confirm.ts（被 pages/select/index 替代）
- pages/menu/index.ts（被 pages/home/index 替代）
- tabBar 配置
```

```
server/
├── src/
│   ├── index.js                 # express 启动
│   ├── routes/
│   │   ├── index.js             # 路由挂载
│   │   ├── dishes.js            # 菜品 CRUD
│   │   └── mealPlans.js         # 晚餐 upsert + 读取
│   ├── db/
│   │   └── pool.js              # mysql2 连接池 + ensureSchema（建表 + 种子）
│   └── middleware/
│       └── openid.js            # 把 X-WX-OPENID 写入 req.openid（不判断）
└── e2e/
    └── e2e.test.ts              # 端到端脚本（如保留则精简；不强求）

（全部移除）
- routes/admin.js, internal.js, quota.js, notifications.js
- db/cloudbase.js（被 pool.js 替代）
- middleware/rateLimit.js
- openapi.yaml
```

```
cloudfunctions/  →  整目录删除
```

---

## 3. 数据模型

### 3.1 `dishes` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT AUTO_INCREMENT PK | |
| `name` | VARCHAR(64) NOT NULL | |
| `category` | VARCHAR(16) NOT NULL | enum: `hot` / `cold` / `soup` / `staple` |
| `is_active` | TINYINT(1) NOT NULL DEFAULT 1 | 0=停用、1=启用 |
| `sort_order` | INT NOT NULL DEFAULT 0 | 升序展示 |
| `created_at` | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | |

启动种子（`pool.js` `ensureSchema` 末尾，若 `dishes` 表为空则幂等插入；不写文件、不暴露常量表外的种子）：

```
鸡蛋西红柿(hot)、凉拌豆腐皮(cold)、土豆炖豆角(hot)、排骨冬瓜汤(soup)、
清炒生菜(hot)、米饭(staple)、大米粥(staple)、红烧肉(hot)、
番茄炒蛋(hot)、凉拌黄瓜(cold)
```

### 3.2 `meal_plans` 表（关键简化：唯一业务键就是日期）

| 字段 | 类型 | 说明 |
|---|---|---|
| `date` | DATE PK | `YYYY-MM-DD`；天然唯一；过去日期不可写 |
| `dish_ids` | JSON NOT NULL | 数组，元素为 `dishes.id`；选菜至少 1 道、至多 20 道 |
| `note` | VARCHAR(200) NULL | |
| `updated_at` | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | |
| `updated_by` | VARCHAR(64) NULL | `X-WX-OPENID`；首页显示为"由 XXXX 编辑于 HH:MM" |

- **无 `meal_type` 列**（永远只 dinner；要扩展时再 ALTER 加枚举列，不预先埋）。
- **无 `version`、`idempotency_key`、`status` 列**（PUT 即 upsert，冲突 = 覆盖）。
- **无 `created_at` 永久列**（`updated_at` 足够）。

---

## 4. 业务规则

### 4.1 菜品

| 规则 | 说明 |
|---|---|
| 列表排序 | `is_active DESC, sort_order ASC, id ASC` |
| 普通用户看到 | 仅 `is_active = 1` 的；菜品管理页带 `includeInactive=true` 看全部 |
| 重名 | 允许（同一菜名多次出现；不强求唯一） |
| 删除已被引用的菜品 | **允许**（历史记录里的 `dish_ids` 仍存旧 id，前端渲染时按 id 查 `dishes`；找不到就显示"已删除菜品"占位） |

### 4.2 晚餐选菜

| 规则 | 说明 |
|---|---|
| 可选日期 | `[today, today + 6]`（含两端）；`today` 由服务端 `Date.now()` 决定（避免客户端时间漂移） |
| 同一日期多次保存 | 整条记录覆盖（last-write-wins），不做版本合并、不返回 409 |
| 菜数限制 | `1 ≤ len(dish_ids) ≤ 20` |
| 备注长度 | `0 ≤ len(note) ≤ 200` 字符（前端 + 后端校验） |
| 选菜必须从菜品库选 | 不接受自由文本作为菜；自由文本只能作为 `note` |
| `dish_ids` 元素类型 | 整数；后端校验后写入 JSON；读取时返回原数组 |
| 不存在的 `dish_id` | 服务端在写入前校验：若 `dish_ids` 含 `dishes` 表中不存在的 id，返回 400 + 错误明细 |

### 4.3 首页状态

| 状态 | 触发条件 | UI |
|---|---|---|
| loading | 首屏未返回数据 | 全屏 loading 占位 |
| empty | 该日期无 `meal_plans` 行 | 标题 "今晚还没选" + 主按钮「选晚餐」 |
| success | 该日期有 `meal_plans` 行 | 菜名列表（按 `dishes.sort_order`）+ 备注 + "由 XXXX 编辑于 HH:MM" + 「改一下」按钮 |
| error | API 失败 | toast + 重试按钮（保留 30 秒前的最后成功数据） |

### 4.4 选菜子页状态

- loading → success；菜品列表始终显示（不视作空态）。
- 用户未选任何菜时，「保存」按钮 disabled + tooltip "至少选 1 道"。
- 「保存」期间按钮 disabled 防双提交；成功 toast "已保存"，返回首页刷新。

### 4.5 菜品库管理状态

- 列表：每行 `[菜名 | 分类 tag | 启停开关 | 编辑 | 删除]`。
- 新增 / 编辑：内嵌抽屉或行内表单，name (1-16 字符)、category (下拉 4 选 1)、sort_order (整数，可选默认 0)。
- 删除：confirm modal 二次确认。
- 启停切换：直接 PATCH，无需确认（可来回切）。

---

## 5. 数据流

### 5.1 首页加载

```
home.onLoad
  → GET /api/v1/dishes                       # 用于渲染勾选/菜品名（缓存到 setData）
  → GET /api/v1/meal-plans?date=today        # 渲染选菜结果
  → 渲染 success / empty
```

日期切换时仅重新请求 `GET /api/v1/meal-plans?date=...`。

### 5.2 修改晚餐

```
home 点「改一下」/ 点「选晚餐」
  → wx.navigateTo(/pages/select/index?date=YYYY-MM-DD)
select.onLoad
  → GET /api/v1/dishes                       # 加载可选菜品
  → GET /api/v1/meal-plans?date=YYYY-MM-DD   # 加载既有选菜（用于预选）
  → 用户勾选 + 写备注
  → 点「保存」
  → PUT /api/v1/meal-plans { date, dish_ids, note }
  → 成功 toast + wx.navigateBack()
home.onShow
  → 重新拉 meal-plans（首页 onShow 刷新机制）
```

### 5.3 菜品管理

```
dishes.onLoad
  → GET /api/v1/dishes?includeInactive=true
dishes 新增 / 编辑 / 启停 / 删除
  → 对应 POST/PATCH/DELETE
  → 成功后本地 list 状态更新（不重拉全表）
home.onShow
  → 重新拉 dishes（用于 select 页下次进来看到最新）
```

### 5.4 写入路径的所有权

- 客户端：`services/api.ts` 唯一封装 `wx.cloud.callContainer`；任何 Page 不得直接调用。
- 服务端：`routes/dishes.js`、`routes/mealPlans.js` 只做参数校验 + 调 `pool.js`；业务规则只在路由层（不写到 SQL）。
- DB 层：`pool.js` 只暴露 `query()`、`execute()`、`withTransaction()`、`ensureSchema()`；**不做动态列内省、不做 schema 漂移防御**。

---

## 6. 错误处理

| 场景 | 客户端表现 | 服务端响应 |
|---|---|---|
| 网络断开 / callContainer 失败 | toast "网络异常" + 重试按钮 | - |
| 日期越界 (`date < today \|\| date > today+6`) | toast "只能选今天到未来 6 天" | 400 `{ error: 'date_out_of_range' }` |
| 菜数越界 (0 或 >20) | 「保存」按钮 disabled + tooltip | 400 `{ error: 'invalid_dish_count' }` |
| 备注过长 (>200) | 输入框红框 + 字数计数 | 400 `{ error: 'note_too_long' }` |
| 引用不存在 dish_id | 「保存」前校验，过滤非法 id | 400 `{ error: 'invalid_dish_id', ids: [...] }` |
| 菜品已删除（首页渲染历史） | 显示「已删除菜品」占位字符串 | 200（数据照常返回） |
| 服务端 5xx | toast "服务异常，稍后重试" | - |

所有错误响应统一格式：`{ error: string_code, message?: string }`；前端按 `error` 字段走分支。

---

## 7. 测试策略

### 7.1 后端（jest）

`server/src/**/*.test.js`，每个路由一个文件：

- `routes/dishes.test.js`
  - 列出仅启用菜品（默认）
  - `includeInactive=true` 列出全部
  - 新增 → list 出现
  - PATCH 改名 / 启停 / 改排序 → 列表正确
  - DELETE → 列表移除
- `routes/mealPlans.test.js`
  - GET 不存在的日期 → 200 + null
  - PUT 越界日期（昨天 / +7）→ 400 `date_out_of_range`
  - PUT 空菜（dish_ids=[]）→ 400 `invalid_dish_count`
  - PUT 超过 20 道 → 400 `invalid_dish_count`
  - PUT 引用不存在 dish_id → 400 `invalid_dish_id`
  - PUT 备注 201 字 → 400 `note_too_long`
  - PUT 同一日期 3 次 → 数据库只 1 行，内容为最后 1 次
  - GET 该日期 → 返回最后 1 次内容
  - PUT 不依赖 `X-WX-OPENID` 头存在（mock 网关测试也通过；缺头时 `updated_by=null`）
- `middleware/openid.test.js`
  - 头存在 → `req.openid` 设置
  - 头缺失 → `req.openid = null`，不抛错
- `db/pool.test.js`
  - 冷启动：库不存在 → 自动建库；表不存在 → 自动建表；种子不存在 → 自动插
  - 热启动：库/表/种子都在 → `ensureSchema` 幂等不重复执行

### 7.2 小程序（vitest，`WeChatDeloy/miniprogram/domain/`）

- `date.test.ts`：今天/明天/周几格式化；范围 `[today, today+6]` 计算
- `mealPlan.test.ts`：
  - `validateDate(date)` 边界（含 today、today+6、today-1、today+7）
  - `serializeDishes(dishIds)` → 后端 payload 格式
  - `countDishes(note)` 长度校验（中英文都算 1 字符或按需文档化规则）
- `dish.test.ts`：排序（active 优先、sort_order 升序、id 升序）、过滤 is_active、分组 by category

### 7.3 集成验证（wechat-devtools MCP，按 `verification.md`）

每个改动后强制跑：

```
edit code
  → npx tsc --noEmit
  → npx vitest run
  → wechat-devtools MCP: open / compile
  → read compile errors + console
  → navigate to home
  → exercise: 切换日期 / 选菜 / 保存 / 返回首页 / 修改 / 改菜品
  → screenshot
  → confirm expected state
```

物理真机 E2E 不强制（仅 2 人场景下模拟器 AppData 数据填充即可信；见 DECISIONS M2-D010）。

---

## 8. 删除清单（最终）

### 8.1 仓库卫生

- 删除 `server/coverage/`、`WeChatDeloy/ts-out/`、`*.tsbuildinfo`
- 删除 `server/e2e/e2e.test.js`（保留 `e2e.test.ts` 单份；若 ts 版不存在则一并删）
- 删除 `cloudfunctions/quickstartFunctions/`、`WeChatDeloy/cloudfunctions/` 整目录
- 删除 `WeChatDeloy/miniprogram/app.js`（保留 `app.ts`）
- 删除 `.codex/workflows/`、`.agents/`（不写入新内容即可）
- `images/` 下模板遗留图片：ai_example* / cloud_dev / create_* / database* / env-select / function_deploy / scf-enter 等与业务无关的 png
- `.gitignore` 增补 `coverage/`、`ts-out/`、`*.tsbuildinfo`

### 8.2 服务端

- `server/src/routes/admin.js`（整文件 + .test.js）
- `server/src/routes/internal.js`（整文件 + .test.js）
- `server/src/routes/quota.js`（整文件 + .test.js）
- `server/src/routes/notifications.js`（整文件 + .test.js）
- `server/src/middleware/rateLimit.js`（含 `package.json` 的 `express-rate-limit` 依赖、`index.js` 中的挂载）
- `server/src/db/cloudbase.js`（被 `pool.js` 替代；不保留同名以免混淆）
- `server/openapi.yaml`（API 表收进 README）

### 8.3 小程序

- `pages/meal-plans/index`（整目录）
- `pages/profile/index`（整目录）
- `pages/admin/`（整目录）
- `pages/selection/confirm.ts`（被 `pages/select/index.ts` 替代）
- `pages/menu/index.ts`（被 `pages/home/index.ts` 替代；旧文件删除）
- `app.json`：删除 tabBar 配置 + 上述页面注册
- `services/api.ts`：删除 `quota/subscription/notification/updateMealPlan` 相关函数
- `domain/types.ts`：删除对应类型
- `pages/selection/confirm` 下的 `version / idempotencyKey / existingPlanId` 分支

### 8.4 文档

- 保留：`README.md`（重写 ≤120 行）、`DECISIONS.md`（追加 M3 决策）、`CLAUDE.md`（更新链接）
- 删除：`DEVELOPMENT_PLAN.md`、`TASKS.md`、`TEST_PLAN.md`、`DEPLOYMENT_CHECKLIST.md`、`WORKFLOW-DEV.md`、`HANDOFF.md`
- `REFORM_PLAN.md`：本 spec 取代之；删除（或在 README 中说明历史已合并）

### 8.5 Cloud Run 环境变量

- 保留：`MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`、`PORT`
- 移除：`ADMIN_OPENIDS`、`NOTIFY_*`、`SUBSCRIBE_*`

---

## 9. 不变量 / 验收（Definition of Done）

1. **真机闭环**：A 账号在小程序为今天选菜，B 账号打开首页立刻看到同一份菜 + 备注。
2. **覆盖语义**：A 账号连续为今天保存 3 次不同菜，首页只显示第 3 次；数据库只 1 行。
3. **日期范围**：昨天 / +7 天被前端拦截，后端返回 400；今天 ~ +6 天可选。
4. **菜品可管理**：任何人可新增 / 改名 / 启停 / 删除菜品；首页 / 选菜页即时反映。
5. **跨设备一致**：A、B 两台设备同一时刻打开首页，看到的内容一致（无缓存差异）。
6. **零敏感信息**：`git grep -E "AppSecret|API_KEY|openid-[a-z0-9]{20,}"` 在 `WeChatDeloy/miniprogram/`、`README.md`、`CLAUDE.md` 零命中。
7. **构建/测试通过**：`cd server && npx jest` 退出 0；`cd WeChatDeloy/miniprogram && npx tsc --noEmit && npx vitest run` 退出 0；wechat-devtools 真实编译无 error。
8. **代码量**：服务端 `src/` 业务代码 ≤ 600 行；小程序 `pages + services + domain` 业务代码 ≤ 2000 行；全仓业务代码（不含 node_modules / 锁文件）≤ 3000 行。

---

## 10. 后续可能的扩展点（不在本 spec 范围，仅记录）

- 多餐次（早 / 午）：`meal_plans` 加 `meal_type ENUM('breakfast','lunch','dinner')` 列，PK 改 `(date, meal_type)`，无需重建表。
- 推送：在 PUT 成功后调一次 `wx.requestSubscribeMessage` + 后端直发 `subscribeMessage.send`，~20 行，无需队列。
- 多人隔离：`meal_plans` 加 `owner_openid` 列，GET 路径过滤。

---

## 附录 A：API 一览（最终版，供 README）

```
GET    /health
GET    /api/v1/dishes?includeInactive=true
POST   /api/v1/dishes
PATCH  /api/v1/dishes/:id
DELETE /api/v1/dishes/:id
GET    /api/v1/meal-plans?date=YYYY-MM-DD
PUT    /api/v1/meal-plans  body={ date, dish_ids:[int], note?:string }
```