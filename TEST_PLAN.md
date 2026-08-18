# 测试计划 — 蔓蔓点菜 MVP

> 文档状态：初稿 v1
> 编制日期：2026-08-17
> 覆盖范围：M2–M5 功能测试，不含 M0 订阅真机验证

---

## 1. 测试策略

### 1.1 测试金字塔

| 层级 | 工具 | 覆盖范围 | 目标 |
|------|------|----------|------|
| 纯逻辑单元 | Vitest | domain/、services/、route handlers | ≥90% 分支覆盖率 |
| API 集成 | Supertest + Mock | Express routes + auth middleware | ≥80% 分支 |
| 小程序组件 | 微信官方 simulate | menu、confirm、record 页面核心交互 | 手动验证 |
| E2E | miniprogram-automator | 完整用户流程 | 手动 + CI |
| 容器 smoke | curl + Docker | 镜像构建、健康检查、日志脱敏 | 自动化 |

### 1.2 测试文件位置

```
WeChatDeloy/miniprogram/
├── domain/
│   ├── date.test.ts
│   ├── selection.test.ts
│   └── types.test.ts
├── services/
│   └── api.test.ts          # mock callContainer
└── vitest.config.ts

server/
├── src/
│   ├── middleware/
│   │   └── auth.test.js
│   ├── routes/
│   │   ├── dishes.test.js
│   │   ├── mealPlans.test.js
│   │   └── admin.test.js
│   └── db/
│       └── cloudbase.test.js  # mock @cloudbase/node-sdk
└── jest.config.js
```

---

## 2. 单元测试用例

### 2.1 domain/date.ts

| ID | 场景 | 输入 | 期望 |
|----|------|------|------|
| D-001 | 今天日期格式化 | `new Date()` | `YYYY-MM-DD` 格式 |
| D-002 | 上海时区 UTC+8 | 假设本地 `new Date()` | 转换为上海时间 |
| D-003 | 日期是否在范围内（今天） | 今天 | `true` |
| D-004 | 日期是否在范围内（+30天） | 今天+30 | `true` |
| D-005 | 日期是否在范围内（+31天） | 今天+31 | `false` |
| D-006 | 日期是否在范围内（昨天） | 昨天 | `false` |
| D-007 | 日期是否在过去 | 昨天 | `true` |
| D-008 | 日期是否在过去 | 今天 | `false` |
| D-009 | 日期是否在过去 | 明天 | `false` |
| D-010 | 生成日期列表 | 无 | 31 项，从今天到+30天 |
| D-011 | 日期列表第一天标签 | 今天 | 包含"今天" |
| D-012 | 日期列表第二天标签 | 明天 | 包含"明天" |
| D-013 | 日期列表第三天标签 | 后天 | 包含"后天" |
| D-014 | 推断餐次（5:00） | 凌晨 | `breakfast` |
| D-015 | 推断餐次（10:00） | 上午10点 | `lunch` |
| D-016 | 推断餐次（17:00） | 下午5点 | `dinner` |
| D-017 | 两天之间天数（相邻） | 今天、明天 | 1 |
| D-018 | 两天之间天数（跨周） | 本周一、下周一 | 7 |
| D-019 | YYYY-MM-DD 解析 | `"2026-08-17"` | `Date(2026, 7, 17)` |
| D-020 | Date 对象格式化为 YYYY-MM-DD | `Date(2026,7,17)` | `"2026-08-17"` |

### 2.2 domain/selection.ts

| ID | 场景 | 输入 | 期望 |
|----|------|------|------|
| S-001 | 添加第一道菜 | 空 state + dish | items.length=1 |
| S-002 | 添加重复菜品 | 已有该菜品的 state | state 不变，items.length 不变 |
| S-003 | 移除已选菜品 | 有 dishId 的 state | items.length -1 |
| S-004 | 移除未选菜品 | 无该 dishId 的 state | state 不变 |
| S-005 | 切换已选菜品 | 已选的 dish | 变为未选 |
| S-006 | 切换未选菜品 | 未选的 dish | 变为已选 |
| S-007 | 获取已选数量 | items=[a,b,c] | 3 |
| S-008 | 获取已选数量（空） | items=[] | 0 |
| S-009 | 检查是否有未保存变更 | items=[a] | `true` |
| S-010 | 检查是否有未保存变更 | items=[] | `false` |
| S-011 | 清空选择篮 | items=[a,b] | items=[] |
| S-012 | 切换日期 | 新日期 | items=[], date=新日期, mealType 不变 |
| S-013 | 切换餐次 | 新 mealType | items=[], mealType=新值, date 不变 |
| S-014 | 初始状态创建 | date=今天, mealType=午餐 | { date, mealType, items=[] } |
| S-015 | toggleDish 幂等 | 连续点击同一道菜两次 | 回到原状态 |

### 2.3 auth 中间件

| ID | 场景 | 输入 | 期望 |
|----|------|------|------|
| A-001 | 无 openid header | `{}` | 401 + `{ code: 'UNAUTHORIZED' }` |
| A-002 | 有效 openid，非管理员 | `x-wx-openid: oaaa` | `req.user = { openid: 'oaaa', role: 'user' }` |
| A-003 | 有效 openid，在白名单 | `x-wx-openid: 管理员id` | `req.user.role = 'admin'` |
| A-004 | requireAdmin 普通用户 | `role: 'user'` | 403 |
| A-005 | requireAdmin 管理员 | `role: 'admin'` | next() |
| A-006 | 多管理员白名单解析 | `ADMIN_OPENIDS=a,b,c` | 返回 [a,b,c] |
| A-007 | 空 ADMIN_OPENIDS | `''` | 返回 [] |

---

## 3. API 测试用例

### 3.1 /api/v1/me

| ID | 场景 | 请求 | 期望状态 | 期望 body.data.role |
|----|------|------|----------|---------------------|
| ME-001 | 带有效 openid | GET /me | 200 | `user` / `admin` |
| ME-002 | 无 openid | GET /me | 401 | error |

### 3.2 /api/v1/dishes

| ID | 场景 | 请求 | 期望状态 |
|----|------|------|----------|
| D-001 | 普通用户获取启用菜品 | GET /dishes | 200 + 只含 isActive=true |
| D-002 | 按分类筛选 | GET /dishes?category=hot | 200 + 全是 hot |
| D-003 | 无 openid | GET /dishes | 401 |
| D-004 | 分类非法值 | GET /dishes?category=invalid | 400 或忽略筛选（实现决定） |
| D-005 | 数据库返回空 | GET /dishes | 200 + `data: []` |

### 3.3 /api/v1/admin/dishes

| ID | 场景 | 请求 | 期望状态 |
|----|------|------|----------|
| AD-001 | 管理员获取所有菜品 | GET /admin/dishes | 200 + 含停用 |
| AD-002 | 普通用户调用 | GET /admin/dishes | 403 |
| AD-003 | 无 openid | GET /admin/dishes | 401 |
| AD-004 | 管理员按 ID 获取 | GET /admin/dishes/:id | 200 + dish |
| AD-005 | 菜品不存在 | GET /admin/dishes/notexistid | 404 |
| AD-006 | 管理员新增合法菜品 | POST /admin/dishes | 201 + dish |
| AD-007 | 新增菜品名称为空 | POST /admin/dishes { name: '' } | 400 |
| AD-008 | 新增菜品名称超30字 | POST /admin/dishes { name: 'a'*31 } | 400 |
| AD-009 | 新增菜品合法边界（30字） | POST /admin/dishes { name: 'a'*30 } | 201 |
| AD-010 | 新增菜品名称仅空格 | POST /admin/dishes { name: '   ' } | 400 |
| AD-011 | 新增菜品未知分类 | POST /admin/dishes { category: 'invalid' } | 400 或使用默认值 |
| AD-012 | 管理员修改菜品名称 | PATCH /admin/dishes/:id { name: '新名' } | 200 |
| AD-013 | 管理员停用菜品 | PATCH /admin/dishes/:id { isActive: false } | 200 + isActive=false |
| AD-014 | 管理员启用菜品 | PATCH /admin/dishes/:id { isActive: true } | 200 + isActive=true |
| AD-015 | 修改不存在的菜品 | PATCH /admin/dishes/notexist | 404 |
| AD-016 | 修改菜品名称为空 | PATCH /admin/dishes/:id { name: '' } | 400 |
| AD-017 | 修改菜品名称超30字 | PATCH /admin/dishes/:id { name: 'a'*31 } | 400 |
| AD-018 | 部分更新（仅 description） | PATCH /admin/dishes/:id { description: '新描述' } | 200 + 其他字段不变 |

### 3.4 /api/v1/meal-plans

| ID | 场景 | 请求 | 期望状态 |
|----|------|------|----------|
| MP-001 | 首次提交合法点菜 | POST /meal-plans | 201 + plan + version=1 |
| MP-002 | 提交缺少必填字段 | POST /meal-plans {} | 400 |
| MP-003 | 提交空 items | POST /meal-plans { items: [] } | 400 |
| MP-004 | 提交超过20道菜 | POST /meal-plans { items: 21道菜 } | 400 |
| MP-005 | 提交恰好20道菜 | POST /meal-plans { items: 20道菜 } | 201 |
| MP-006 | 提交无 openid | POST /meal-plans | 401 |
| MP-007 | 修改已存在的记录 | PUT /meal-plans/:id | 200 + version+1 |
| MP-008 | 修改时版本冲突（旧 version） | PUT with wrong version | 409 |
| MP-009 | 修改他人记录 | 以另一 openid | 403 |
| MP-010 | 修改不存在的记录 | PUT /meal-plans/notexist | 404 |
| MP-011 | 修改时传空 items | PUT /meal-plans/:id { items: [] } | 400 |
| MP-012 | 首次提交后通知任务创建 | POST + mock notify | 至少创建一条 in_app 任务 |
| MP-013 | 查询当前用户记录 | GET /meal-plans?from=&to= | 200 + 只含自己 |
| MP-014 | 查询日期范围 | GET /meal-plans?from=2026-08-01&to=2026-08-31 | 200 + 范围过滤 |
| MP-015 | 双击防重（同一 Idempotency-Key 重放） | POST 两遍相同 body | 两次都返回 201（幂等）或第二次 200（返回同一结果） |
| MP-016 | 日期格式校验 | POST /meal-plans { date: '2026-08-17' } | 201 |
| MP-017 | 日期格式非法 | POST /meal-plans { date: '17/08/2026' } | 400 |

### 3.5 /api/v1/admin/notifications

| ID | 场景 | 请求 | 期望状态 |
|----|------|------|----------|
| N-001 | 管理员获取通知列表 | GET /admin/notifications | 200 + array |
| N-002 | 普通用户获取 | GET /admin/notifications | 403 |
| N-003 | 重试失败通知（有额度） | POST /admin/notifications/:id/retry | 202 |
| N-004 | 重试失败通知（无额度） | POST /admin/notifications/:id/retry | 409 + NO_QUOTA |
| N-005 | 记录订阅授权（合法） | POST /admin/subscriptions | 201 |
| N-006 | 记录订阅授权（缺参数） | POST /admin/subscriptions {} | 400 |

---

## 4. 边界条件与异常测试

### 4.1 输入边界

| ID | 场景 | 测试值 |
|----|------|--------|
| B-001 | 菜品名称最小 | 1 字符（应成功） |
| B-002 | 菜品名称最大 | 30 字符（应成功） |
| B-003 | 菜品名称超长 | 31 字符（应 400） |
| B-004 | description 最大 | 100 字符（应成功） |
| B-005 | description 超长 | 101 字符（应 400 或截断，根据实现） |
| B-006 | note 最大 | 100 字符（应成功） |
| B-007 | note 超长 | 101 字符（应 400） |
| B-008 | 一次点菜最小 | 1 道菜（应成功） |
| B-009 | 一次点菜最大 | 20 道菜（应成功） |
| B-010 | 一次点菜超限 | 21 道菜（应 400） |
| B-011 | date 最早 | 今天（应成功） |
| B-012 | date 最晚 | 今天+30（应成功） |
| B-013 | date 超范围 | 今天+31（应 400，前端也拦截） |
| B-014 | date 过去 | 昨天（应 400） |
| B-015 | mealType 有效枚举 | `breakfast` / `lunch` / `dinner` |
| B-016 | mealType 无效值 | `brunch`（应 400） |

### 4.2 权限边界

| ID | 场景 | 期望 |
|----|------|------|
| P-001 | 普通用户调用管理 API | 全部 403 |
| P-002 | 伪造 openid header | 401（网关注入，不可伪造） |
| P-003 | 伪造 role=user | 权限仍由白名单决定，user 身份无法提升 |
| P-004 | 未登录请求 | 401 |
| P-005 | 恶意构造请求体含 admin:true | 字段被忽略，权限不变 |

### 4.3 数据一致性边界

| ID | 场景 | 期望 |
|----|------|------|
| C-001 | 并发修改同一记录（不同版本） | 只有一个成功，另一个 409 |
| C-002 | 菜品被停用后 | 旧 meal_plan 快照仍显示该菜品 |
| C-003 | 菜品被改名后 | 旧 meal_plan 快照仍显示原名称（快照不变） |
| C-004 | 通知任务重复触发（同一 mealPlanId+version+channel） | 唯一索引阻止，应只创建一条 |

### 4.4 API 格式边界

| ID | 场景 | 期望 |
|----|------|------|
| F-001 | 未知字段在请求体 | 静默忽略（不报错） |
| F-002 | Content-Type 非 JSON | 应支持或返回 415 |
| F-003 | 超大请求体 | 超过 1mb → 413 或截断 |
| F-004 | 特殊字符注入 | `<script>` 等 → 仅作为纯文本存储/展示 |
| F-005 | SQL/NoSQL 注入尝试 | 不应执行，仅作为文本 |

---

## 5. 状态码映射

| 场景 | HTTP 状态码 | error.code |
|------|------------|------------|
| 无 openid | 401 | UNAUTHORIZED |
| 普通用户调用管理 API | 403 | FORBIDDEN |
| 资源不存在 | 404 | NOT_FOUND |
| 菜品名称为空 | 400 | VALIDATION_ERROR |
| 版本冲突 | 409 | VERSION_CONFLICT |
| 幂等冲突 | 409 | IDEMPOTENCY_CONFLICT |
| 无订阅额度 | 409 | NO_QUOTA |
| 服务器内部错误 | 500 | INTERNAL_ERROR |
| 请求格式错误 | 400 | VALIDATION_ERROR |

---

## 6. 质量门槛

- 所有 P0 用例必须通过自动化测试
- P1 用例 100% 自动化
- P2 用例记录手动测试结果
- 单元测试覆盖率：domain/ 和 middleware/ ≥ 90% 语句覆盖
- API 测试覆盖率：所有路由 ≥ 80% 分支覆盖
- 无密钥、openid 明文、请求 body 明文写入测试日志

---

## 7. 测试执行

```bash
# 小程序单元测试
cd WeChatDeloy/miniprogram && npm test

# 后端 API 测试
cd server && npm test

# 完整验证（包含 lint + 类型检查）
cd WeChatDeloy/miniprogram && npm run verify
```