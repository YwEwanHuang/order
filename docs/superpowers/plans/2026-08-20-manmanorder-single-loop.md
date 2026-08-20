# 蔓蔓点菜 · 单闭环重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目重构为单闭环产品——用户为今天/未来 6 天的晚餐从固定菜品库选菜；任何 openid 打开小程序都能查看或修改。

**Architecture:** 单页小程序（首页日期切换 + 当晚晚餐展示/修改）+ 菜品管理页 + 选菜子页。后端 Express + MySQL 5.7（2 张表），7 个 HTTP 端点，无任何角色/订阅/队列机制。部署沿用 Cloud Run 私有链路。

**Tech Stack:**
- Backend: Node 18, Express 4, mysql2, jest
- Frontend: WeChat miniprogram TypeScript, vitest, wechat-devtools MCP
- Deploy: Cloud Run（GitHub push 触发构建）

**Spec:** `docs/superpowers/specs/2026-08-20-manmanorder-single-loop-design.md`

---

## 文件结构（重构后）

```
server/src/
├── index.js                          # express bootstrap, /health, 路由挂载
├── db/pool.js                        # mysql2 pool + ensureSchema + seed
├── middleware/openid.js              # 抓 X-WX-OPENID → req.openid（不判断）
├── routes/
│   ├── index.js                      # 挂载 /api/v1/dishes + /api/v1/meal-plans
│   ├── dishes.js                     # GET/POST/PATCH/DELETE
│   └── mealPlans.js                  # GET / PUT upsert
├── routes/dishes.test.js
├── routes/mealPlans.test.js
├── middleware/openid.test.js
└── db/pool.test.js

WeChatDeloy/miniprogram/
├── app.ts|json                       # 无 tabBar，3 个 page 注册
├── pages/
│   ├── home/index.{ts,wxss,wxml,json}    # 日期切换 + 晚餐展示/修改
│   ├── select/index.{ts,wxss,wxml,json}  # 勾菜 + 备注 + 保存
│   └── dishes/index.{ts,wxss,wxml,json}  # 菜品 CRUD
├── services/api.ts                       # 6 个 endpoint 封装
└── domain/
    ├── date.ts|test.ts
    ├── mealPlan.ts|test.ts
    └── dish.ts|test.ts

（移除）
- server/src/routes/{admin,internal,quota,notifications}.js + .test.js
- server/src/middleware/rateLimit.js
- server/src/db/cloudbase.js
- server/openapi.yaml
- WeChatDeloy/miniprogram/{pages/meal-plans,pages/profile,pages/admin,pages/selection,pages/menu}
- cloudfunctions/
- DEVELOPMENT_PLAN.md, TASKS.md, TEST_PLAN.md, DEPLOYMENT_CHECKLIST.md,
  WORKFLOW-DEV.md, HANDOFF.md, REFORM_PLAN.md（被本 plan 取代）
```

---

## 阶段 0：仓库卫生

### Task 0.1：删除服务端冗余文件

**Files:**
- Delete: `server/src/routes/admin.js`
- Delete: `server/src/routes/admin.test.js`
- Delete: `server/src/routes/internal.js`
- Delete: `server/src/routes/internal.test.js`
- Delete: `server/src/routes/quota.js`
- Delete: `server/src/routes/quota.test.js`
- Delete: `server/src/routes/notifications.js`
- Delete: `server/src/routes/notifications.test.js`
- Delete: `server/src/middleware/rateLimit.js`
- Delete: `server/src/middleware/rateLimit.test.js`
- Delete: `server/src/db/cloudbase.js`
- Delete: `server/openapi.yaml`

- [ ] **Step 1: 删除上述所有文件**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git rm server/src/routes/admin.js server/src/routes/admin.test.js
git rm server/src/routes/internal.js server/src/routes/internal.test.js
git rm server/src/routes/quota.js server/src/routes/quota.test.js
git rm server/src/routes/notifications.js server/src/routes/notifications.test.js
git rm server/src/middleware/rateLimit.js server/src/middleware/rateLimit.test.js
git rm server/src/db/cloudbase.js
git rm server/openapi.yaml
```

- [ ] **Step 2: 提交**

```bash
git -c core.autocrlf=false commit -m "chore(server): remove rate-limit/admin/notification routes"
```

---

### Task 0.2：删除云函数 & 模板残留

**Files:**
- Delete: `cloudfunctions/`（整个目录）
- Delete: `WeChatDeloy/cloudfunctions/`（如果存在）
- Delete: `server/coverage/`（已在 .gitignore 但若入库则删除）
- Delete: `WeChatDeloy/ts-out/`

- [ ] **Step 1: 删除**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git rm -r cloudfunctions/ 2>/dev/null || true
git rm -r WeChatDeloy/cloudfunctions/ 2>/dev/null || true
git rm -rf server/coverage/ 2>/dev/null || true
git rm -rf WeChatDeloy/ts-out/ 2>/dev/null || true
```

- [ ] **Step 2: 提交**

```bash
git -c core.autocrlf=false commit -m "chore: remove cloud functions and build artifacts"
```

---

### Task 0.3：删除小程序冗余页面

**Files:**
- Delete: `WeChatDeloy/miniprogram/pages/meal-plans/`（整目录）
- Delete: `WeChatDeloy/miniprogram/pages/profile/`（整目录）
- Delete: `WeChatDeloy/miniprogram/pages/admin/`（整目录）
- Delete: `WeChatDeloy/miniprogram/pages/selection/`（整目录）
- Delete: `WeChatDeloy/miniprogram/pages/menu/`（整目录）

- [ ] **Step 1: 删除**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git rm -r WeChatDeloy/miniprogram/pages/meal-plans
git rm -r WeChatDeloy/miniprogram/pages/profile
git rm -r WeChatDeloy/miniprogram/pages/admin
git rm -r WeChatDeloy/miniprogram/pages/selection
git rm -r WeChatDeloy/miniprogram/pages/menu
```

- [ ] **Step 2: 提交**

```bash
git -c core.autocrlf=false commit -m "chore(miniprogram): remove redundant pages (will be recreated)"
```

---

### Task 0.4：更新 .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 在 .gitignore 末尾追加**

```
coverage/
ts-out/
*.tsbuildinfo
```

- [ ] **Step 2: 提交**

```bash
git -c core.autocrlf=false commit -m "chore: ignore build artifacts"
```

---

### Task 0.5：删除冗余文档

**Files:**
- Delete: `DEVELOPMENT_PLAN.md`
- Delete: `TASKS.md`
- Delete: `TEST_PLAN.md`
- Delete: `DEPLOYMENT_CHECKLIST.md`
- Delete: `WORKFLOW-DEV.md`
- Delete: `HANDOFF.md`
- Delete: `REFORM_PLAN.md`

- [ ] **Step 1: 删除**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git rm DEVELOPMENT_PLAN.md TASKS.md TEST_PLAN.md DEPLOYMENT_CHECKLIST.md WORKFLOW-DEV.md HANDOFF.md REFORM_PLAN.md 2>/dev/null || true
```

- [ ] **Step 2: 提交**

```bash
git -c core.autocrlf=false commit -m "docs: remove obsolete planning docs"
```

---

## 阶段 1：后端 · DB 层（TDD）

### Task 1.1：写 `db/pool.js` 测试（先红）

**Files:**
- Create: `server/src/db/pool.test.js`

- [ ] **Step 1: 写测试**

```javascript
// server/src/db/pool.test.js
const { ensureSchema, pool } = require('./pool');

describe('ensureSchema', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('启动幂等：库、表、种子均不重复', async () => {
    await ensureSchema();
    await ensureSchema(); // 第二次不应抛错
    const [tables] = await pool.query("SHOW TABLES LIKE 'dishes'");
    expect(tables.length).toBe(1);
    const [seeds] = await pool.query('SELECT COUNT(*) AS c FROM dishes');
    // 种子在 [10, 20] 区间（避免硬编码后续调整时挂测试）
    expect(seeds[0].c).toBeGreaterThanOrEqual(10);
    expect(seeds[0].c).toBeLessThanOrEqual(20);
  });

  test('dishes 表必含字段', async () => {
    const [cols] = await pool.query('SHOW COLUMNS FROM dishes');
    const names = cols.map((c) => c.Field);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'name', 'category', 'is_active', 'sort_order', 'created_at'])
    );
  });

  test('meal_plans 表必含字段（无 meal_type 列）', async () => {
    const [cols] = await pool.query('SHOW COLUMNS FROM meal_plans');
    const names = cols.map((c) => c.Field);
    expect(names).toEqual(
      expect.arrayContaining(['date', 'dish_ids', 'note', 'updated_at', 'updated_by'])
    );
    expect(names).not.toContain('meal_type');
    expect(names).not.toContain('version');
    expect(names).not.toContain('idempotency_key');
  });
});
```

- [ ] **Step 2: 运行测试，验证失败**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest src/db/pool.test.js
```

Expected: FAIL with "Cannot find module './pool'"

---

### Task 1.2：实现 `db/pool.js`（后绿）

**Files:**
- Create: `server/src/db/pool.js`

- [ ] **Step 1: 写实现**

```javascript
// server/src/db/pool.js
const mysql = require('mysql2/promise');

const DB_NAME = process.env.MYSQL_DATABASE || 'manmanorder';

const baseConfig = {
  host: (process.env.MYSQL_ADDRESS || '127.0.0.1:3306').split(':')[0],
  port: Number((process.env.MYSQL_ADDRESS || '127.0.0.1:3306').split(':')[1]) || 3306,
  user: process.env.MYSQL_USERNAME || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  multipleStatements: true,
  waitForConnections: true,
};

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...baseConfig, database: DB_NAME });
  }
  return pool;
}

const SEED_DISHES = [
  ['鸡蛋西红柿', 'hot'],
  ['凉拌豆腐皮', 'cold'],
  ['土豆炖豆角', 'hot'],
  ['排骨冬瓜汤', 'soup'],
  ['清炒生菜', 'hot'],
  ['米饭', 'staple'],
  ['大米粥', 'staple'],
  ['红烧肉', 'hot'],
  ['番茄炒蛋', 'hot'],
  ['凉拌黄瓜', 'cold'],
];

async function ensureDatabase() {
  const conn = await mysql.createConnection(baseConfig);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4`);
  } finally {
    await conn.end();
  }
}

async function ensureSchema() {
  await ensureDatabase();
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS dishes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      category VARCHAR(16) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    CREATE TABLE IF NOT EXISTS meal_plans (
      date DATE PRIMARY KEY,
      dish_ids JSON NOT NULL,
      note VARCHAR(200) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(64) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  const [rows] = await p.query('SELECT COUNT(*) AS c FROM dishes');
  if (rows[0].c === 0) {
    const values = SEED_DISHES.map(([name, category]) => [name, category]);
    await p.query('INSERT INTO dishes (name, category) VALUES ?', [values]);
  }
}

module.exports = { pool: { get query() { return (...args) => getPool().query(...args); }, end: () => pool ? pool.end() : Promise.resolve() }, getPool, ensureSchema };
```

> 注意：上面 export 的 `pool` 是兼容 jest 测试里的 `pool.query / pool.end` 用法的最小封装，不是直接 mysql2 pool 引用。这样 `pool.test.js` 中 `pool.end()` 可用。

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest src/db/pool.test.js
```

Expected: 3 passed

- [ ] **Step 3: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add server/src/db/pool.js server/src/db/pool.test.js
git -c core.autocrlf=false commit -m "feat(server): add mysql pool + ensureSchema with seed"
```

---

## 阶段 2：后端 · Middleware（TDD）

### Task 2.1：写 `middleware/openid.js` 测试

**Files:**
- Create: `server/src/middleware/openid.test.js`

- [ ] **Step 1: 写测试**

```javascript
// server/src/middleware/openid.test.js
const openid = require('./openid');

function run(headers) {
  return new Promise((resolve) => {
    const req = { headers };
    const res = {};
    openid(req, res, () => resolve(req));
  });
}

describe('openid middleware', () => {
  test('有 X-WX-OPENID 头 → req.openid 设置', async () => {
    const req = await run({ 'x-wx-openid': 'oABCD-1234' });
    expect(req.openid).toBe('oABCD-1234');
  });

  test('无 X-WX-OPENID 头 → req.openid = null，不抛错', async () => {
    const req = await run({});
    expect(req.openid).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，验证失败**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest src/middleware/openid.test.js
```

Expected: FAIL with "Cannot find module './openid'"

---

### Task 2.2：实现 `middleware/openid.js`

**Files:**
- Create: `server/src/middleware/openid.js`

- [ ] **Step 1: 写实现**

```javascript
// server/src/middleware/openid.js
module.exports = function openidMiddleware(req, _res, next) {
  req.openid = req.headers['x-wx-openid'] || null;
  next();
};
```

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest src/middleware/openid.test.js
```

Expected: 2 passed

- [ ] **Step 3: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add server/src/middleware/openid.js server/src/middleware/openid.test.js
git -c core.autocrlf=false commit -m "feat(server): add openid middleware (no auth check)"
```

---

## 阶段 3：后端 · 菜品路由（TDD）

### Task 3.1：写 `routes/dishes.js` 测试

**Files:**
- Create: `server/src/routes/dishes.test.js`

- [ ] **Step 1: 写测试**

```javascript
// server/src/routes/dishes.test.js
const request = require('supertest');
const express = require('express');
const dishesRouter = require('./dishes');
const { ensureSchema, pool } = require('../db/pool');

const app = express();
app.use(express.json());
app.use('/api/v1/dishes', dishesRouter);

beforeAll(async () => {
  await ensureSchema();
  // 测试前清空（确保独立）
  await pool.query('DELETE FROM meal_plans');
  await pool.query('DELETE FROM dishes');
  // 重新种子
  await pool.query(
    'INSERT INTO dishes (name, category) VALUES (?,?), (?,?)',
    ['测试菜A', 'hot', '测试菜B', 'cold']
  );
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/v1/dishes', () => {
  test('默认仅返回启用菜品', async () => {
    const res = await request(app).get('/api/v1/dishes');
    expect(res.status).toBe(200);
    expect(res.body.every((d) => d.is_active === 1)).toBe(true);
  });

  test('includeInactive=true 返回全部', async () => {
    await pool.query('UPDATE dishes SET is_active = 0 WHERE name = ?', ['测试菜B']);
    const res = await request(app).get('/api/v1/dishes?includeInactive=true');
    expect(res.status).toBe(200);
    expect(res.body.some((d) => d.name === '测试菜B' && d.is_active === 0)).toBe(true);
  });
});

describe('POST /api/v1/dishes', () => {
  test('新增菜品', async () => {
    const res = await request(app)
      .post('/api/v1/dishes')
      .send({ name: '新菜', category: 'soup' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
    const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [res.body.id]);
    expect(rows[0].name).toBe('新菜');
    expect(rows[0].category).toBe('soup');
  });

  test('缺 name → 400', async () => {
    const res = await request(app).post('/api/v1/dishes').send({ category: 'hot' });
    expect(res.status).toBe(400);
  });

  test('缺 category → 400', async () => {
    const res = await request(app).post('/api/v1/dishes').send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  test('category 非法 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/dishes')
      .send({ name: 'x', category: 'invalid' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/dishes/:id', () => {
  test('改名', async () => {
    const [[dish]] = await pool.query('SELECT id FROM dishes WHERE name = ?', ['测试菜A']);
    const res = await request(app)
      .patch(`/api/v1/dishes/${dish.id}`)
      .send({ name: '改名A' });
    expect(res.status).toBe(200);
    const [rows] = await pool.query('SELECT name FROM dishes WHERE id = ?', [dish.id]);
    expect(rows[0].name).toBe('改名A');
  });

  test('停用', async () => {
    const [[dish]] = await pool.query('SELECT id FROM dishes WHERE name = ?', ['改名A']);
    const res = await request(app)
      .patch(`/api/v1/dishes/${dish.id}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);
    const [rows] = await pool.query('SELECT is_active FROM dishes WHERE id = ?', [dish.id]);
    expect(rows[0].is_active).toBe(0);
  });

  test('id 不存在 → 404', async () => {
    const res = await request(app).patch('/api/v1/dishes/999999').send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/dishes/:id', () => {
  test('删除存在菜品', async () => {
    const [[dish]] = await pool.query('SELECT id FROM dishes WHERE name = ?', ['新菜']);
    const res = await request(app).delete(`/api/v1/dishes/${dish.id}`);
    expect(res.status).toBe(200);
    const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [dish.id]);
    expect(rows.length).toBe(0);
  });

  test('id 不存在 → 404', async () => {
    const res = await request(app).delete('/api/v1/dishes/999999');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 运行测试，验证失败**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest src/routes/dishes.test.js
```

Expected: FAIL with "Cannot find module './dishes'"

> 若 supertest 未装：`npm install --save-dev supertest`

---

### Task 3.2：实现 `routes/dishes.js`

**Files:**
- Create: `server/src/routes/dishes.js`

- [ ] **Step 1: 写实现**

```javascript
// server/src/routes/dishes.js
const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

const VALID_CATEGORIES = ['hot', 'cold', 'soup', 'staple'];

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const sql = includeInactive
      ? 'SELECT id, name, category, is_active, sort_order, created_at FROM dishes ORDER BY is_active DESC, sort_order ASC, id ASC'
      : 'SELECT id, name, category, is_active, sort_order, created_at FROM dishes WHERE is_active = 1 ORDER BY sort_order ASC, id ASC';
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, category } = req.body || {};
    if (typeof name !== 'string' || name.length === 0 || name.length > 64) {
      return res.status(400).json({ error: 'invalid_name' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'invalid_category' });
    }
    const [result] = await pool.query(
      'INSERT INTO dishes (name, category) VALUES (?, ?)',
      [name, category]
    );
    const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const fields = [];
    const values = [];
    if ('name' in (req.body || {})) {
      if (typeof req.body.name !== 'string' || req.body.name.length === 0 || req.body.name.length > 64) {
        return res.status(400).json({ error: 'invalid_name' });
      }
      fields.push('name = ?');
      values.push(req.body.name);
    }
    if ('category' in (req.body || {})) {
      if (!VALID_CATEGORIES.includes(req.body.category)) {
        return res.status(400).json({ error: 'invalid_category' });
      }
      fields.push('category = ?');
      values.push(req.body.category);
    }
    if ('is_active' in (req.body || {})) {
      fields.push('is_active = ?');
      values.push(req.body.is_active ? 1 : 0);
    }
    if ('sort_order' in (req.body || {})) {
      const so = Number(req.body.sort_order);
      if (!Number.isInteger(so)) return res.status(400).json({ error: 'invalid_sort_order' });
      fields.push('sort_order = ?');
      values.push(so);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'no_fields' });
    values.push(id);
    const [result] = await pool.query(`UPDATE dishes SET ${fields.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
    const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    const [result] = await pool.query('DELETE FROM dishes WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest src/routes/dishes.test.js
```

Expected: 所有 passed

- [ ] **Step 3: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add server/src/routes/dishes.js server/src/routes/dishes.test.js
git -c core.autocrlf=false commit -m "feat(server): add dishes CRUD routes"
```

---

## 阶段 4：后端 · 晚餐路由（TDD）

### Task 4.1：写 `routes/mealPlans.js` 测试

**Files:**
- Create: `server/src/routes/mealPlans.js.test.js` → 重命名为 `routes/mealPlans.test.js`

- [ ] **Step 1: 写测试**

```javascript
// server/src/routes/mealPlans.test.js
const request = require('supertest');
const express = require('express');
const mealPlansRouter = require('./mealPlans');
const { ensureSchema, pool } = require('../db/pool');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.openid = req.headers['x-wx-openid'] || null;
  next();
});
app.use('/api/v1/meal-plans', mealPlansRouter);

let dishIds = [];

beforeAll(async () => {
  await ensureSchema();
  await pool.query('DELETE FROM meal_plans');
  await pool.query('DELETE FROM dishes');
  const [r1] = await pool.query('INSERT INTO dishes (name, category) VALUES (?,?)', ['A', 'hot']);
  const [r2] = await pool.query('INSERT INTO dishes (name, category) VALUES (?,?)', ['B', 'cold']);
  dishIds = [r1.insertId, r2.insertId];
});

afterAll(async () => {
  await pool.end();
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function shiftISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('GET /api/v1/meal-plans', () => {
  test('未保存日期 → 200 + null', async () => {
    const res = await request(app).get(`/api/v1/meal-plans?date=${todayISO()}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('缺 date → 400', async () => {
    const res = await request(app).get('/api/v1/meal-plans');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/meal-plans', () => {
  test('正常保存', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .set('x-wx-openid', 'oABCD-test')
      .send({ date: todayISO(), dish_ids: dishIds, note: '少辣' });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(todayISO());
    expect(res.body.note).toBe('少辣');
    expect(res.body.updated_by).toBe('oABCD-test');
  });

  test('日期越界（昨天）→ 400 date_out_of_range', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(-1), dish_ids: dishIds });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('date_out_of_range');
  });

  test('日期越界（+7）→ 400 date_out_of_range', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(7), dish_ids: dishIds });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('date_out_of_range');
  });

  test('今天+6 边界通过', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(6), dish_ids: dishIds });
    expect(res.status).toBe(200);
  });

  test('空 dish_ids → 400 invalid_dish_count', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(1), dish_ids: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_dish_count');
  });

  test('超过 20 道 → 400', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(1), dish_ids: Array(21).fill(dishIds[0]) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_dish_count');
  });

  test('备注超 200 字 → 400 note_too_long', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(2), dish_ids: dishIds, note: 'x'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('note_too_long');
  });

  test('引用不存在 dish_id → 400 invalid_dish_id', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(3), dish_ids: [999999] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_dish_id');
  });

  test('同一日期多次保存 = 覆盖（last-write-wins）', async () => {
    await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(4), dish_ids: [dishIds[0]] });
    await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(4), dish_ids: [dishIds[1]] });
    await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(4), dish_ids: dishIds, note: 'final' });
    const [rows] = await pool.query('SELECT * FROM meal_plans WHERE date = ?', [shiftISO(4)]);
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].dish_ids)).toEqual(dishIds);
    expect(rows[0].note).toBe('final');
  });

  test('无 X-WX-OPENID 头 → updated_by = null（不报错）', async () => {
    const res = await request(app)
      .put('/api/v1/meal-plans')
      .send({ date: shiftISO(5), dish_ids: dishIds });
    expect(res.status).toBe(200);
    expect(res.body.updated_by).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，验证失败**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest src/routes/mealPlans.test.js
```

Expected: FAIL with "Cannot find module './mealPlans'"

---

### Task 4.2：实现 `routes/mealPlans.js`

**Files:**
- Create: `server/src/routes/mealPlans.js`

- [ ] **Step 1: 写实现**

```javascript
// server/src/routes/mealPlans.js
const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

const MAX_NOTE = 200;
const MAX_DISHES = 20;
const MAX_FUTURE_DAYS = 6;

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInRange(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = todayISO();
  const max = shiftISO(MAX_FUTURE_DAYS);
  return dateStr >= today && dateStr <= max;
}

async function allDishIdsExist(ids) {
  if (ids.length === 0) return false;
  const [rows] = await pool.query(
    `SELECT id FROM dishes WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return rows.length === ids.length;
}

router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'invalid_date' });
    }
    const [rows] = await pool.query(
      `SELECT date, dish_ids, note, updated_at, updated_by
       FROM meal_plans WHERE date = ?`,
      [date]
    );
    if (rows.length === 0) return res.json(null);
    const row = rows[0];
    row.dish_ids = typeof row.dish_ids === 'string' ? JSON.parse(row.dish_ids) : row.dish_ids;
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const { date, dish_ids, note } = req.body || {};

    if (!dateInRange(date)) {
      return res.status(400).json({ error: 'date_out_of_range' });
    }
    if (!Array.isArray(dish_ids) || dish_ids.length === 0 || dish_ids.length > MAX_DISHES) {
      return res.status(400).json({ error: 'invalid_dish_count' });
    }
    if (!dish_ids.every((x) => Number.isInteger(x) && x > 0)) {
      return res.status(400).json({ error: 'invalid_dish_id' });
    }
    if (!(await allDishIdsExist(dish_ids))) {
      return res.status(400).json({ error: 'invalid_dish_id' });
    }
    if (typeof note === 'string' && note.length > MAX_NOTE) {
      return res.status(400).json({ error: 'note_too_long' });
    }
    const openid = req.openid || null;

    await pool.query(
      `INSERT INTO meal_plans (date, dish_ids, note, updated_by)
       VALUES (?, CAST(? AS JSON), ?, ?)
       ON DUPLICATE KEY UPDATE
         dish_ids = VALUES(dish_ids),
         note = VALUES(note),
         updated_by = VALUES(updated_by)`,
      [date, JSON.stringify(dish_ids), note || null, openid]
    );

    const [rows] = await pool.query(
      'SELECT date, dish_ids, note, updated_at, updated_by FROM meal_plans WHERE date = ?',
      [date]
    );
    const row = rows[0];
    row.dish_ids = typeof row.dish_ids === 'string' ? JSON.parse(row.dish_ids) : row.dish_ids;
    res.json(row);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest src/routes/mealPlans.test.js
```

Expected: 所有 passed

- [ ] **Step 3: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add server/src/routes/mealPlans.js server/src/routes/mealPlans.test.js
git -c core.autocrlf=false commit -m "feat(server): add meal-plans GET + PUT upsert routes"
```

---

## 阶段 5：后端 · 路由挂载 & Bootstrap

### Task 5.1：写 `routes/index.js`

**Files:**
- Create: `server/src/routes/index.js`

- [ ] **Step 1: 写实现**

```javascript
// server/src/routes/index.js
const express = require('express');
const dishes = require('./dishes');
const mealPlans = require('./mealPlans');

const router = express.Router();
router.use('/dishes', dishes);
router.use('/meal-plans', mealPlans);

module.exports = router;
```

- [ ] **Step 2: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add server/src/routes/index.js
git -c core.autocrlf=false commit -m "feat(server): mount dishes + meal-plans routes"
```

---

### Task 5.2：写 `src/index.js`

**Files:**
- Modify: `server/src/index.js`（覆盖原文件；移除 express-rate-limit 引用）

- [ ] **Step 1: 读现有文件**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
cat server/src/index.js
```

- [ ] **Step 2: 覆盖为最小 bootstrap**

```javascript
// server/src/index.js
const express = require('express');
const apiRouter = require('./routes');
const openid = require('./middleware/openid');
const { ensureSchema } = require('./db/pool');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(openid);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/v1', apiRouter);

// 全局错误兜底
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT) || 80;
ensureSchema()
  .then(() => {
    app.listen(port, () => console.log(`[server] listening on ${port}`));
  })
  .catch((err) => {
    console.error('[fatal] ensureSchema failed', err);
    process.exit(1);
  });
```

- [ ] **Step 3: 本地启动验证 `/health`**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
# 用本地或 docker-compose MySQL，确保 MYSQL_ADDRESS 等已设
MYSQL_ADDRESS=127.0.0.1:3306 MYSQL_USERNAME=root MYSQL_PASSWORD=*** \
  node src/index.js &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:80/health
# Expected: {"ok":true}
kill $SERVER_PID
```

- [ ] **Step 4: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add server/src/index.js
git -c core.autocrlf=false commit -m "feat(server): minimal express bootstrap with /health and api mount"
```

---

### Task 5.3：清理 `package.json`

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: 移除 express-rate-limit 依赖**

读 `server/package.json` 后删除 `dependencies` / `devDependencies` 中所有 `express-rate-limit` 行，然后：

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npm uninstall express-rate-limit
```

- [ ] **Step 2: 验证全部 jest 通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/server"
npx jest
```

Expected: 所有测试 passed；`auth.test.js` 等已被删除模块的 .test.js 文件不应存在；若有残留则在阶段 0 已删

- [ ] **Step 3: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add server/package.json server/package-lock.json
git -c core.autocrlf=false commit -m "chore(server): drop express-rate-limit dep"
```

---

## 阶段 6：前端 · Domain（TDD）

### Task 6.1：domain/date.ts + 测试

**Files:**
- Create: `WeChatDeloy/miniprogram/domain/date.ts`
- Create: `WeChatDeloy/miniprogram/domain/date.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// WeChatDeloy/miniprogram/domain/date.test.ts
import { describe, it, expect } from 'vitest';
import { todayISO, shiftISO, isInRange, formatDisplay } from './date';

describe('todayISO', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('shiftISO', () => {
  it('+1 = tomorrow', () => {
    const today = todayISO();
    const tomorrow = shiftISO(today, 1);
    expect(new Date(tomorrow).getTime() - new Date(today).getTime()).toBe(86400000);
  });
  it('-1 = yesterday', () => {
    const today = todayISO();
    const yest = shiftISO(today, -1);
    expect(new Date(today).getTime() - new Date(yest).getTime()).toBe(86400000);
  });
});

describe('isInRange', () => {
  it('today = true', () => {
    expect(isInRange(todayISO())).toBe(true);
  });
  it('+6 = true (boundary inclusive)', () => {
    expect(isInRange(shiftISO(todayISO(), 6))).toBe(true);
  });
  it('+7 = false', () => {
    expect(isInRange(shiftISO(todayISO(), 7))).toBe(false);
  });
  it('-1 = false', () => {
    expect(isInRange(shiftISO(todayISO(), -1))).toBe(false);
  });
});

describe('formatDisplay', () => {
  it('8月20日 周三', () => {
    const out = formatDisplay('2026-08-20');
    expect(out).toMatch(/^8月20日/);
  });
});
```

- [ ] **Step 2: 运行测试，验证失败**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx vitest run domain/date.test.ts
```

Expected: FAIL "Cannot find module './date'"

- [ ] **Step 3: 实现**

```typescript
// WeChatDeloy/miniprogram/domain/date.ts
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function shiftISO(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isInRange(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = todayISO();
  const max = shiftISO(today, 6);
  return date >= today && date <= max;
}

export function formatDisplay(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${WEEKDAY[d.getDay()]}`;
}
```

- [ ] **Step 4: 运行测试，验证通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx vitest run domain/date.test.ts
```

Expected: passed

- [ ] **Step 5: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/miniprogram/domain/date.ts WeChatDeloy/miniprogram/domain/date.test.ts
git -c core.autocrlf=false commit -m "feat(miniprogram): date helpers"
```

---

### Task 6.2：domain/mealPlan.ts + 测试

**Files:**
- Create: `WeChatDeloy/miniprogram/domain/mealPlan.ts`
- Create: `WeChatDeloy/miniprogram/domain/mealPlan.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// WeChatDeloy/miniprogram/domain/mealPlan.test.ts
import { describe, it, expect } from 'vitest';
import { validateNote, validateDishCount, buildPayload, maskOpenid } from './mealPlan';

describe('validateNote', () => {
  it('空 → ok', () => expect(validateNote('')).toBeNull());
  it('100 字 → ok', () => expect(validateNote('x'.repeat(100))).toBeNull());
  it('200 字 → ok (boundary)', () => expect(validateNote('x'.repeat(200))).toBeNull());
  it('201 字 → 报错', () => expect(validateNote('x'.repeat(201))).toBe('note_too_long'));
});

describe('validateDishCount', () => {
  it('0 → 报错', () => expect(validateDishCount([])).toBe('invalid_dish_count'));
  it('1 → ok', () => expect(validateDishCount([1])).toBeNull());
  it('20 → ok', () => expect(validateDishCount(Array(20).fill(1))).toBeNull());
  it('21 → 报错', () => expect(validateDishCount(Array(21).fill(1))).toBe('invalid_dish_count'));
});

describe('buildPayload', () => {
  it('去重', () => {
    expect(buildPayload('2026-08-20', [1, 1, 2], '')).toEqual({
      date: '2026-08-20',
      dish_ids: [1, 2],
      note: '',
    });
  });
  it('note undefined → 字符串空', () => {
    expect(buildPayload('2026-08-20', [1], undefined as any).note).toBe('');
  });
});

describe('maskOpenid', () => {
  it('短 openid 原样返回', () => {
    expect(maskOpenid('oABCD')).toBe('oABCD');
  });
  it('长 openid 取首尾各 4', () => {
    expect(maskOpenid('oABCDEFGHijklmnop')).toBe('oABCD…mnop');
  });
  it('null → 空', () => {
    expect(maskOpenid(null)).toBe('');
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// WeChatDeloy/miniprogram/domain/mealPlan.ts
export const MAX_NOTE = 200;
export const MAX_DISHES = 20;

export function validateNote(note: string | null | undefined): string | null {
  if (!note) return null;
  if (note.length > MAX_NOTE) return 'note_too_long';
  return null;
}

export function validateDishCount(ids: number[]): string | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DISHES) {
    return 'invalid_dish_count';
  }
  return null;
}

export function buildPayload(date: string, dishIds: number[], note?: string) {
  const unique = Array.from(new Set(dishIds));
  return { date, dish_ids: unique, note: note || '' };
}

export function maskOpenid(openid: string | null | undefined): string {
  if (!openid) return '';
  if (openid.length <= 8) return openid;
  return openid.slice(0, 4) + '…' + openid.slice(-4);
}
```

- [ ] **Step 3: 运行测试，验证通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx vitest run domain/mealPlan.test.ts
```

- [ ] **Step 4: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/miniprogram/domain/mealPlan.ts WeChatDeloy/miniprogram/domain/mealPlan.test.ts
git -c core.autocrlf=false commit -m "feat(miniprogram): mealPlan validation helpers"
```

---

### Task 6.3：domain/dish.ts + 测试

**Files:**
- Create: `WeChatDeloy/miniprogram/domain/dish.ts`
- Create: `WeChatDeloy/miniprogram/domain/dish.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// WeChatDeloy/miniprogram/domain/dish.test.ts
import { describe, it, expect } from 'vitest';
import { activeOnly, sortDishes, groupByCategory } from './dish';

const dishes = [
  { id: 1, name: 'A', category: 'hot', is_active: 1, sort_order: 2, created_at: '' },
  { id: 2, name: 'B', category: 'cold', is_active: 0, sort_order: 1, created_at: '' },
  { id: 3, name: 'C', category: 'hot', is_active: 1, sort_order: 1, created_at: '' },
];

describe('activeOnly', () => {
  it('仅保留启用', () => {
    expect(activeOnly(dishes).map((d) => d.id)).toEqual([1, 3]);
  });
});

describe('sortDishes', () => {
  it('sort_order ASC, id ASC', () => {
    expect(sortDishes(dishes).map((d) => d.id)).toEqual([3, 1, 2]);
  });
});

describe('groupByCategory', () => {
  it('按 category 分组', () => {
    const groups = groupByCategory(activeOnly(dishes));
    expect(groups.map((g) => g.category)).toEqual(['hot', 'hot']);
  });
});
```

- [ ] **Step 2: 实现**

```typescript
// WeChatDeloy/miniprogram/domain/dish.ts
export interface Dish {
  id: number;
  name: string;
  category: string;
  is_active: number;
  sort_order: number;
  created_at?: string;
}

export function activeOnly(dishes: Dish[]): Dish[] {
  return dishes.filter((d) => d.is_active === 1);
}

export function sortDishes(dishes: Dish[]): Dish[] {
  return [...dishes].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export function groupByCategory(dishes: Dish[]): Dish[] {
  return sortDishes(dishes);
}
```

- [ ] **Step 3: 运行测试，验证通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx vitest run domain/dish.test.ts
```

- [ ] **Step 4: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/miniprogram/domain/dish.ts WeChatDeloy/miniprogram/domain/dish.test.ts
git -c core.autocrlf=false commit -m "feat(miniprogram): dish domain helpers"
```

---

## 阶段 7：前端 · API 服务层

### Task 7.1：重写 services/api.ts

**Files:**
- Modify: `WeChatDeloy/miniprogram/services/api.ts`（覆盖）

- [ ] **Step 1: 读现有 api.ts**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
cat WeChatDeloy/miniprogram/services/api.ts
```

- [ ] **Step 2: 覆盖为最小实现**

```typescript
// WeChatDeloy/miniprogram/services/api.ts
const app = getApp<{ globalData: { cloudEnvId: string; cloudServiceName: string } }>();

export interface Dish {
  id: number;
  name: string;
  category: string;
  is_active: number;
  sort_order: number;
  created_at?: string;
}

export interface MealPlan {
  date: string;
  dish_ids: number[];
  note: string | null;
  updated_at: string;
  updated_by: string | null;
}

export class ApiException extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message?: string) {
    super(message || code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function call<T>(path: string, init: WechatMiniprogram.RequestOption = {}): Promise<T> {
  const res = await wx.cloud.callContainer({
    config: { env: app.globalData.cloudEnvId },
    path,
    service: app.globalData.cloudServiceName,
    method: init.method || 'GET',
    header: { 'content-type': 'application/json', ...(init.header || {}) },
    data: init.data as any,
  } as any);
  if (res.statusCode >= 200 && res.statusCode < 300) {
    return res.data as T;
  }
  const code = (res.data && res.data.error) || `http_${res.statusCode}`;
  throw new ApiException(code, res.statusCode);
}

export const api = {
  listDishes: (includeInactive = false): Promise<Dish[]> =>
    call<Dish[]>(`/api/v1/dishes${includeInactive ? '?includeInactive=true' : ''}`),

  createDish: (body: { name: string; category: string }): Promise<Dish> =>
    call<Dish>('/api/v1/dishes', { method: 'POST', data: body }),

  updateDish: (
    id: number,
    body: Partial<{ name: string; category: string; is_active: boolean; sort_order: number }>
  ): Promise<Dish> => call<Dish>(`/api/v1/dishes/${id}`, { method: 'PATCH', data: body }),

  deleteDish: (id: number): Promise<{ ok: true }> =>
    call<{ ok: true }>(`/api/v1/dishes/${id}`, { method: 'DELETE' }),

  getMealPlan: (date: string): Promise<MealPlan | null> =>
    call<MealPlan | null>(`/api/v1/meal-plans?date=${date}`),

  putMealPlan: (body: { date: string; dish_ids: number[]; note?: string }): Promise<MealPlan> =>
    call<MealPlan>('/api/v1/meal-plans', { method: 'PUT', data: body }),
};
```

- [ ] **Step 3: 验证类型检查通过**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx tsc --noEmit
```

Expected: 无 error（domain/types.ts 等老类型若引用未删字段会报错，删除那些字段引用即可，下一步处理）

- [ ] **Step 4: 清理 domain/types.ts**

`WeChatDeloy/miniprogram/domain/types.ts` 中如有 `MealPlanVersion / IdempotencyKey / Notification* / Subscription* / AdminDish* / DishFilter` 等类型，整段删除，只保留 spec §2.3 中的最小接口（实际已被 api.ts 内联）。删除后：

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx tsc --noEmit
```

Expected: 0 error

- [ ] **Step 5: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/miniprogram/services/api.ts WeChatDeloy/miniprogram/domain/types.ts WeChatDeloy/miniprogram/domain/*.test.ts 2>/dev/null || true
git -c core.autocrlf=false commit -m "feat(miniprogram): rewrite api layer for single-loop (6 endpoints)"
```

---

## 阶段 8：前端 · 页面

### Task 8.1：pages/home/index

**Files:**
- Create: `WeChatDeloy/miniprogram/pages/home/index.json`
- Create: `WeChatDeloy/miniprogram/pages/home/index.wxml`
- Create: `WeChatDeloy/miniprogram/pages/home/index.wxss`
- Create: `WeChatDeloy/miniprogram/pages/home/index.ts`

- [ ] **Step 1: 创建 json**

```json
{
  "navigationBarTitleText": "蔓蔓点菜",
  "usingComponents": {}
}
```

路径：`WeChatDeloy/miniprogram/pages/home/index.json`

- [ ] **Step 2: 创建 wxml**

```xml
<view class="home">
  <view class="date-row">
    <picker mode="date" value="{{date}}" start="{{today}}" end="{{maxDate}}" bindchange="onDateChange">
      <view class="date-pill">{{dateLabel}}</view>
    </picker>
  </view>

  <block wx:if="{{loading}}">
    <view class="state">加载中…</view>
  </block>

  <block wx:elif="{{error}}">
    <view class="state error">{{error}}</view>
    <button bindtap="loadAll">重试</button>
  </block>

  <block wx:elif="{{plan === null}}">
    <view class="state">
      <view class="big">今晚还没选</view>
      <view class="hint">默认显示今天，可切换到未来 6 天</view>
    </view>
    <button class="primary" bindtap="goSelect">选晚餐</button>
  </block>

  <block wx:else>
    <view class="plan">
      <view class="dishes">
        <view class="dish" wx:for="{{dishNames}}" wx:key="*this">{{item}}</view>
      </view>
      <view class="note" wx:if="{{plan.note}}">备注：{{plan.note}}</view>
      <view class="meta">由 {{editorLabel}} 编辑于 {{updatedAtLabel}}</view>
    </view>
    <button class="primary" bindtap="goSelect">改一下</button>
  </block>

  <view class="corner" bindtap="goDishes">
    <text>菜品库</text>
  </view>
</view>
```

路径：`WeChatDeloy/miniprogram/pages/home/index.wxml`

- [ ] **Step 3: 创建 wxss**

```css
.home { padding: 32rpx; display: flex; flex-direction: column; min-height: 100vh; box-sizing: border-box; }
.date-row { display: flex; justify-content: center; margin-bottom: 48rpx; }
.date-pill { padding: 12rpx 32rpx; background: #86C8A0; color: #fff; border-radius: 32rpx; font-size: 32rpx; }
.state { text-align: center; padding: 96rpx 0; flex: 1; }
.state .big { font-size: 48rpx; color: #333; margin-bottom: 16rpx; }
.state .hint { font-size: 28rpx; color: #999; }
.state.error { color: #c00; }
.plan { background: #fff; border-radius: 16rpx; padding: 32rpx; margin-bottom: 32rpx; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04); }
.dishes { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 24rpx; }
.dish { background: #FFF3E0; color: #E65100; padding: 12rpx 24rpx; border-radius: 24rpx; font-size: 30rpx; }
.note { font-size: 28rpx; color: #555; margin-bottom: 16rpx; }
.meta { font-size: 24rpx; color: #999; }
.primary { background: #86C8A0; color: #fff; border-radius: 16rpx; font-size: 32rpx; }
.corner { position: fixed; top: 16rpx; right: 32rpx; padding: 12rpx 24rpx; background: #f5f5f5; border-radius: 32rpx; font-size: 24rpx; color: #666; }
```

路径：`WeChatDeloy/miniprogram/pages/home/index.wxss`

- [ ] **Step 4: 创建 ts**

```typescript
// WeChatDeloy/miniprogram/pages/home/index.ts
import { api, ApiException, Dish, MealPlan } from '../../services/api';
import { todayISO, shiftISO, formatDisplay } from '../../domain/date';
import { maskOpenid } from '../../domain/mealPlan';

interface PageData {
  date: string;
  today: string;
  maxDate: string;
  dateLabel: string;
  loading: boolean;
  error: string;
  plan: MealPlan | null;
  dishNames: string[];
  editorLabel: string;
  updatedAtLabel: string;
  dishMap: Record<number, Dish>;
}

Page<PageData, any>({
  data: {
    date: '',
    today: '',
    maxDate: '',
    dateLabel: '',
    loading: false,
    error: '',
    plan: null,
    dishNames: [],
    editorLabel: '',
    updatedAtLabel: '',
    dishMap: {},
  },

  onLoad() {
    const today = todayISO();
    this.setData({
      date: today,
      today,
      maxDate: shiftISO(today, 6),
      dateLabel: formatDisplay(today),
    });
    this.loadAll();
  },

  onShow() {
    if (this.data.date) this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true, error: '' });
    try {
      const [dishes, plan] = await Promise.all([
        api.listDishes(true),
        api.getMealPlan(this.data.date),
      ]);
      const dishMap: Record<number, Dish> = {};
      for (const d of dishes) dishMap[d.id] = d;
      const dishNames = plan
        ? plan.dish_ids.map((id) => dishMap[id]?.name || '已删除菜品')
        : [];
      const updatedAtLabel = plan
        ? new Date(plan.updated_at).toLocaleString('zh-CN', { hour12: false })
        : '';
      this.setData({
        dishMap,
        plan,
        dishNames,
        editorLabel: maskOpenid(plan?.updated_by),
        updatedAtLabel,
        loading: false,
      });
    } catch (e) {
      const msg = e instanceof ApiException ? `加载失败：${e.code}` : '加载失败';
      this.setData({ loading: false, error: msg });
    }
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    const date = e.detail.value;
    this.setData({ date, dateLabel: formatDisplay(date) });
    this.loadAll();
  },

  goSelect() {
    wx.navigateTo({ url: `/pages/select/index?date=${this.data.date}` });
  },

  goDishes() {
    wx.navigateTo({ url: '/pages/dishes/index' });
  },
});
```

路径：`WeChatDeloy/miniprogram/pages/home/index.ts`

- [ ] **Step 5: 类型检查**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx tsc --noEmit
```

Expected: 0 error

- [ ] **Step 6: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/miniprogram/pages/home/
git -c core.autocrlf=false commit -m "feat(miniprogram): home page (date switch + dinner view)"
```

---

### Task 8.2：pages/select/index

**Files:**
- Create: `WeChatDeloy/miniprogram/pages/select/index.{json,wxml,wxss,ts}`

- [ ] **Step 1: json**

```json
{ "navigationBarTitleText": "选晚餐", "usingComponents": {} }
```

- [ ] **Step 2: wxml**

```xml
<view class="select">
  <view class="title">{{titleLabel}}</view>

  <block wx:if="{{loading}}">
    <view class="state">加载中…</view>
  </block>

  <block wx:else>
    <view class="group" wx:for="{{categories}}" wx:for-item="category" wx:key="key">
      <view class="group-title">{{category.label}}</view>
      <view class="grid">
        <view
          wx:for="{{category.dishes}}"
          wx:key="id"
          class="pill {{selectedMap[item.id] ? 'selected' : ''}}"
          bindtap="toggleDish"
          data-id="{{item.id}}"
        >{{item.name}}</view>
      </view>
    </view>

    <view class="note-row">
      <textarea
        placeholder="备注（选填，≤200 字）"
        maxlength="200"
        value="{{note}}"
        bindinput="onNoteInput"
      />
      <view class="counter">{{note.length}}/200</view>
    </view>

    <button class="primary" bindtap="save" disabled="{{selectedIds.length === 0 || saving}}">保存</button>
    <view class="error" wx:if="{{error}}">{{error}}</view>
  </block>
</view>
```

- [ ] **Step 3: wxss**

```css
.select { padding: 32rpx; padding-bottom: 200rpx; }
.title { font-size: 36rpx; text-align: center; margin-bottom: 32rpx; }
.state { text-align: center; padding: 96rpx 0; color: #999; }
.group { margin-bottom: 32rpx; }
.group-title { font-size: 28rpx; color: #666; margin-bottom: 16rpx; }
.grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.pill { padding: 16rpx 28rpx; border-radius: 32rpx; background: #f5f5f5; font-size: 30rpx; color: #333; }
.pill.selected { background: #86C8A0; color: #fff; }
.note-row { margin-top: 32rpx; position: relative; }
.note-row textarea { width: 100%; min-height: 120rpx; padding: 16rpx; background: #f5f5f5; border-radius: 12rpx; font-size: 28rpx; box-sizing: border-box; }
.counter { position: absolute; right: 16rpx; bottom: 16rpx; font-size: 22rpx; color: #999; }
.primary { background: #86C8A0; color: #fff; border-radius: 16rpx; margin-top: 32rpx; font-size: 32rpx; }
.primary[disabled] { background: #ccc; color: #fff; }
.error { color: #c00; font-size: 24rpx; margin-top: 16rpx; text-align: center; }
```

- [ ] **Step 4: ts**

```typescript
// WeChatDeloy/miniprogram/pages/select/index.ts
import { api, ApiException, Dish } from '../../services/api';
import { formatDisplay } from '../../domain/date';
import { buildPayload, validateNote, validateDishCount, MAX_NOTE } from '../../domain/mealPlan';

const CATEGORY_LABEL: Record<string, string> = {
  hot: '热菜', cold: '凉菜', soup: '汤', staple: '主食',
};

interface PageData {
  date: string;
  titleLabel: string;
  loading: boolean;
  saving: boolean;
  error: string;
  note: string;
  categories: Array<{ key: string; label: string; dishes: Dish[] }>;
  selectedIds: number[];
  selectedMap: Record<number, boolean>;
}

Page<PageData, any>({
  data: {
    date: '',
    titleLabel: '',
    loading: true,
    saving: false,
    error: '',
    note: '',
    categories: [],
    selectedIds: [],
    selectedMap: {},
  },

  onLoad(query: Record<string, string>) {
    const date = query.date;
    this.setData({ date, titleLabel: `${formatDisplay(date)} · 晚餐` });
    this.loadAll();
  },

  async loadAll() {
    try {
      const [dishes, plan] = await Promise.all([
        api.listDishes(true),
        api.getMealPlan(this.data.date),
      ]);
      const active = dishes.filter((d) => d.is_active === 1).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const grouped = new Map<string, Dish[]>();
      for (const d of active) {
        if (!grouped.has(d.category)) grouped.set(d.category, []);
        grouped.get(d.category)!.push(d);
      }
      const categories = Array.from(grouped.entries()).map(([key, ds]) => ({
        key,
        label: CATEGORY_LABEL[key] || key,
        dishes: ds,
      }));
      const ids = plan?.dish_ids || [];
      const selectedMap: Record<number, boolean> = {};
      for (const id of ids) selectedMap[id] = true;
      this.setData({
        loading: false,
        categories,
        selectedIds: ids,
        selectedMap,
        note: plan?.note || '',
      });
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '加载失败' });
    }
  },

  toggleDish(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    const selectedMap = { ...this.data.selectedMap };
    let selectedIds = [...this.data.selectedIds];
    if (selectedMap[id]) {
      delete selectedMap[id];
      selectedIds = selectedIds.filter((x) => x !== id);
    } else {
      if (selectedIds.length >= 20) {
        wx.showToast({ title: '最多 20 道', icon: 'none' });
        return;
      }
      selectedMap[id] = true;
      selectedIds.push(id);
    }
    this.setData({ selectedMap, selectedIds });
  },

  onNoteInput(e: WechatMiniprogram.TextareaInput) {
    this.setData({ note: e.detail.value });
  },

  async save() {
    const { date, selectedIds, note } = this.data;
    const payload = buildPayload(date, selectedIds, note);
    const countErr = validateDishCount(payload.dish_ids);
    if (countErr) return this.setData({ error: countErr });
    const noteErr = validateNote(payload.note);
    if (noteErr) return this.setData({ error: noteErr });

    this.setData({ saving: true, error: '' });
    try {
      await api.putMealPlan({ date, dish_ids: payload.dish_ids, note: payload.note });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      const msg = e instanceof ApiException ? e.code : '保存失败';
      this.setData({ saving: false, error: msg });
    }
  },
});
```

- [ ] **Step 5: 类型检查**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/miniprogram/pages/select/
git -c core.autocrlf=false commit -m "feat(miniprogram): select dinner sub-page"
```

---

### Task 8.3：pages/dishes/index

**Files:**
- Create: `WeChatDeloy/miniprogram/pages/dishes/index.{json,wxml,wxss,ts}`

- [ ] **Step 1: json**

```json
{ "navigationBarTitleText": "菜品库", "usingComponents": {} }
```

- [ ] **Step 2: wxml**

```xml
<view class="dishes">
  <block wx:if="{{loading}}"><view class="state">加载中…</view></block>
  <block wx:elif="{{error}}">
    <view class="state error">{{error}}</view>
    <button bindtap="load">重试</button>
  </block>
  <block wx:else>
    <view class="empty" wx:if="{{items.length === 0}}">
      <view>还没有菜品</view>
      <button class="primary" bindtap="openCreate">+ 添加第一道</button>
    </view>
    <view wx:else>
      <view class="row" wx:for="{{items}}" wx:key="id">
        <view class="row-main">
          <view class="name {{item.is_active ? '' : 'inactive'}}">{{item.name}}</view>
          <view class="cat-tag">{{categoryLabel[item.category]}}</view>
        </view>
        <switch checked="{{item.is_active}}" bindchange="toggleActive" data-id="{{item.id}}"/>
        <view class="row-actions">
          <view class="link" bindtap="openEdit" data-id="{{item.id}}">编辑</view>
          <view class="link danger" bindtap="confirmDelete" data-id="{{item.id}}">删除</view>
        </view>
      </view>
      <button class="primary add" bindtap="openCreate">+ 添加菜品</button>
    </view>
  </block>

  <!-- 编辑弹层 -->
  <view class="modal" wx:if="{{editing !== null}}">
    <view class="sheet">
      <view class="sheet-title">{{editing.id ? '编辑菜品' : '添加菜品'}}</view>
      <input
        placeholder="菜名（1-16 字）"
        maxlength="16"
        value="{{editing.name}}"
        bindinput="onNameInput"
      />
      <view class="cat-pick">
        <view
          wx:for="{{categoryOptions}}"
          wx:key="key"
          class="cat-opt {{editing.category === item.key ? 'selected' : ''}}"
          bindtap="pickCategory"
          data-key="{{item.key}}"
        >{{item.label}}</view>
      </view>
      <view class="sheet-actions">
        <view class="link" bindtap="closeEdit">取消</view>
        <view class="link primary-link" bindtap="submitEdit">保存</view>
      </view>
      <view class="error" wx:if="{{editError}}">{{editError}}</view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: wxss**

```css
.dishes { padding: 32rpx; padding-bottom: 200rpx; }
.state { text-align: center; padding: 96rpx 0; color: #999; }
.state.error { color: #c00; }
.empty { text-align: center; padding: 96rpx 0; }
.row { display: flex; align-items: center; gap: 16rpx; padding: 24rpx 0; border-bottom: 1rpx solid #eee; }
.row-main { flex: 1; display: flex; align-items: center; gap: 16rpx; }
.name { font-size: 32rpx; color: #333; }
.name.inactive { color: #999; text-decoration: line-through; }
.cat-tag { font-size: 22rpx; color: #86C8A0; background: #E8F5EE; padding: 4rpx 12rpx; border-radius: 8rpx; }
.row-actions { display: flex; gap: 16rpx; }
.link { font-size: 26rpx; color: #86C8A0; padding: 8rpx 16rpx; }
.link.danger { color: #c00; }
.primary { background: #86C8A0; color: #fff; border-radius: 16rpx; margin-top: 32rpx; font-size: 32rpx; }
.add { margin-top: 48rpx; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: flex-end; }
.sheet { background: #fff; width: 100%; padding: 32rpx; border-top-left-radius: 24rpx; border-top-right-radius: 24rpx; box-sizing: border-box; }
.sheet-title { font-size: 32rpx; margin-bottom: 24rpx; text-align: center; }
.sheet input { width: 100%; padding: 16rpx; background: #f5f5f5; border-radius: 12rpx; font-size: 28rpx; box-sizing: border-box; margin-bottom: 24rpx; }
.cat-pick { display: flex; gap: 16rpx; flex-wrap: wrap; margin-bottom: 32rpx; }
.cat-opt { padding: 12rpx 24rpx; border-radius: 24rpx; background: #f5f5f5; font-size: 26rpx; }
.cat-opt.selected { background: #86C8A0; color: #fff; }
.sheet-actions { display: flex; justify-content: space-between; }
.primary-link { color: #86C8A0; font-weight: bold; }
.error { color: #c00; font-size: 24rpx; margin-top: 16rpx; text-align: center; }
```

- [ ] **Step 4: ts**

```typescript
// WeChatDeloy/miniprogram/pages/dishes/index.ts
import { api, ApiException, Dish } from '../../services/api';

const CATEGORY_LABEL: Record<string, string> = {
  hot: '热菜', cold: '凉菜', soup: '汤', staple: '主食',
};
const CATEGORY_OPTIONS = [
  { key: 'hot', label: '热菜' },
  { key: 'cold', label: '凉菜' },
  { key: 'soup', label: '汤' },
  { key: 'staple', label: '主食' },
];

interface EditState {
  id: number | null;
  name: string;
  category: string;
}

interface PageData {
  loading: boolean;
  error: string;
  items: Dish[];
  categoryLabel: Record<string, string>;
  categoryOptions: typeof CATEGORY_OPTIONS;
  editing: EditState | null;
  editError: string;
}

Page<PageData, any>({
  data: {
    loading: true,
    error: '',
    items: [],
    categoryLabel: CATEGORY_LABEL,
    categoryOptions: CATEGORY_OPTIONS,
    editing: null,
    editError: '',
  },

  onLoad() { this.load(); },
  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const items = await api.listDishes(true);
      this.setData({ items, loading: false });
    } catch (e) {
      this.setData({
        loading: false,
        error: e instanceof ApiException ? e.code : '加载失败',
      });
    }
  },

  async toggleActive(e: WechatMiniprogram.SwitchChange) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    const next = e.detail.value;
    try {
      const updated = await api.updateDish(id, { is_active: next });
      const items = this.data.items.map((d) => (d.id === id ? updated : d));
      this.setData({ items });
    } catch (err) {
      wx.showToast({ title: err instanceof ApiException ? err.code : '更新失败', icon: 'none' });
      this.load();
    }
  },

  openCreate() {
    this.setData({ editing: { id: null, name: '', category: 'hot' }, editError: '' });
  },

  openEdit(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    const target = this.data.items.find((d) => d.id === id);
    if (!target) return;
    this.setData({ editing: { id, name: target.name, category: target.category }, editError: '' });
  },

  closeEdit() { this.setData({ editing: null, editError: '' }); },

  onNameInput(e: WechatMiniprogram.Input) {
    if (!this.data.editing) return;
    this.setData({ editing: { ...this.data.editing, name: e.detail.value } });
  },

  pickCategory(e: WechatMiniprogram.BaseEvent) {
    if (!this.data.editing) return;
    const key = (e.currentTarget.dataset as { key: string }).key;
    this.setData({ editing: { ...this.data.editing, category: key } });
  },

  async submitEdit() {
    const ed = this.data.editing;
    if (!ed) return;
    if (!ed.name || ed.name.length > 16) return this.setData({ editError: '菜名 1-16 字' });
    if (!CATEGORY_OPTIONS.find((c) => c.key === ed.category)) return this.setData({ editError: '分类无效' });
    try {
      if (ed.id) {
        const updated = await api.updateDish(ed.id, { name: ed.name, category: ed.category });
        const items = this.data.items.map((d) => (d.id === ed.id ? updated : d));
        this.setData({ items, editing: null });
      } else {
        const created = await api.createDish({ name: ed.name, category: ed.category });
        this.setData({ items: [...this.data.items, created], editing: null });
      }
    } catch (err) {
      this.setData({ editError: err instanceof ApiException ? err.code : '保存失败' });
    }
  },

  confirmDelete(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    wx.showModal({
      title: '删除菜品',
      content: '历史记录里该菜会显示为「已删除菜品」。确认？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deleteDish(id);
          this.setData({ items: this.data.items.filter((d) => d.id !== id) });
        } catch (err) {
          wx.showToast({ title: err instanceof ApiException ? err.code : '删除失败', icon: 'none' });
        }
      },
    });
  },
});
```

- [ ] **Step 5: 类型检查**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/miniprogram/pages/dishes/
git -c core.autocrlf=false commit -m "feat(miniprogram): dishes CRUD page"
```

---

### Task 8.4：app.json + app.ts

**Files:**
- Modify: `WeChatDeloy/miniprogram/app.json`
- Verify: `WeChatDeloy/miniprogram/app.ts`

- [ ] **Step 1: 覆盖 app.json**

```json
{
  "pages": [
    "pages/home/index",
    "pages/select/index",
    "pages/dishes/index"
  ],
  "window": {
    "backgroundColor": "#F6F6F6",
    "backgroundTextStyle": "light",
    "navigationBarBackgroundColor": "#FFFFFF",
    "navigationBarTitleText": "蔓蔓点菜",
    "navigationBarTextStyle": "black"
  },
  "sitemapLocation": "sitemap.json",
  "style": "v2",
  "lazyCodeLoading": "requiredComponents"
}
```

> 移除 tabBar（方案 A 无 tabBar；首页作为唯一入口）。

- [ ] **Step 2: 验证 app.ts**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
cat WeChatDeloy/miniprogram/app.ts
```

确保 `globalData.cloudEnvId` / `globalData.cloudServiceName` 仍存在；若已被前序修改覆盖为占位，需恢复为 `prod-d8gkzjj6ub74bba3b` / `express-stvz`（或当前部署实际值；不在仓库中的部分通过 Cloud Run 注入或 `project.private.config.json` 注入）。

- [ ] **Step 3: 类型检查**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder/WeChatDeloy/miniprogram"
npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/miniprogram/app.json WeChatDeloy/miniprogram/app.ts
git -c core.autocrlf=false commit -m "feat(miniprogram): single-page app.json (home + select + dishes)"
```

---

## 阶段 9：前端 · 真实编译 & 截图验证

### Task 9.1：wechat-devtools 编译

- [ ] **Step 1: 打开项目**

使用 wechat-devtools MCP，路径 `WeChatDeloy/`，触发编译。

- [ ] **Step 2: 读取编译错误**

按 `.claude/skills/wechat-miniprogram-dev/references/verification.md` 流程读取编译输出。期望：0 error；warning 仅与样式/弃用 API 相关。

- [ ] **Step 3: 修复（如有）**

若编译报错，按 file:line 修复。常见原因：
- `domain/types.ts` 残留旧类型 → 删除
- `services/api.ts` 残留旧函数调用 → 删除
- 旧 page 引用未删干净 → `git grep` 找出并删除

- [ ] **Step 4: 无错误则跳到 Task 9.2**

---

### Task 9.2：截图核心页面

- [ ] **Step 1: 首页（空态）截图**

通过 MCP navigate 到 `pages/home/index`，无数据时截图保存到 `WeChatDeloy/screenshots/home-empty.png`。

- [ ] **Step 2: 首页（有数据）截图**

先通过 MCP 调用 `api.putMealPlan`（或云函数直连）写入今天一条记录，再 navigate 到 home，截图保存为 `WeChatDeloy/screenshots/home-filled.png`。

- [ ] **Step 3: 选菜页截图**

通过 MCP navigate 到 `pages/select/index?date=YYYY-MM-DD`，截图保存为 `WeChatDeloy/screenshots/select.png`。

- [ ] **Step 4: 菜品库页截图**

通过 MCP navigate 到 `pages/dishes/index`，截图保存为 `WeChatDeloy/screenshots/dishes.png`。

- [ ] **Step 5: 提交截图**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add WeChatDeloy/screenshots/
git -c core.autocrlf=false commit -m "docs(miniprogram): capture verification screenshots"
```

---

## 阶段 10：文档

### Task 10.1：重写 README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 覆盖为简洁版（≤120 行）**

```markdown
# 蔓蔓点菜 (ManmanOrder)

原生微信小程序 + Express 后端，部署在微信云托管（Cloud Run）。
产品核心：**用户**从固定菜品库为今天或未来 6 天的晚餐选菜 + 备注；任何人打开小程序都能看到或修改。

---

## 架构

```
WeChat miniprogram (TypeScript)
        │ wx.cloud.callContainer  (private link)
        ▼
Express API (Cloud Run, node:18-alpine)
        │ MYSQL_ADDRESS/USERNAME/PASSWORD
        ▼
云托管内置 MySQL 5.7 (manmanorder 库, 2 表: dishes / meal_plans)
```

`X-WX-OPENID` 由网关注入，仅用于审计/显示（首页"由 oABCD…wXYZ 编辑于 HH:MM"），无任何权限判断。

---

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/api/v1/dishes?includeInactive=true` | 菜品列表（默认仅启用） |
| POST | `/api/v1/dishes` | 新增菜品 |
| PATCH | `/api/v1/dishes/:id` | 改名 / 改分类 / 启停 / 改排序 |
| DELETE | `/api/v1/dishes/:id` | 删除菜品 |
| GET | `/api/v1/meal-plans?date=YYYY-MM-DD` | 读取某天晚餐 |
| PUT | `/api/v1/meal-plans` | upsert 某天晚餐，body `{ date, dish_ids:[int], note?:string }` |

错误响应：`{ error: string_code, message?: string }`。

日期范围：服务端 `[today, today+6]`，越界返回 `400 date_out_of_range`。

---

## 本地开发

```bash
# 后端
cd server
npm ci
MYSQL_ADDRESS=127.0.0.1:3306 MYSQL_USERNAME=root MYSQL_PASSWORD=*** npm test
npm start

# 小程序
cd WeChatDeloy/miniprogram
npm ci
npx tsc --noEmit && npx vitest run
# 微信开发者工具导入 WeChatDeloy/
```

---

## 部署

推 `origin/main` → Cloud Run 自动构建并部署。环境变量：

| 变量 | 来源 |
|---|---|
| `MYSQL_ADDRESS` | 平台注入 |
| `MYSQL_USERNAME` | 平台注入 |
| `MYSQL_PASSWORD` | 平台注入 |
| `PORT` | 默认 80 |

公网入口**必须关闭**；不要添加 `ADMIN_OPENIDS` / `NOTIFY_*` / `SUBSCRIBE_*`（已废弃）。

---

## 安全约束

- 不入库 AppID / Secret / openid / DB 密码
- `.gitignore` 覆盖 `.env*` / `project.private.config.json` / `*.log`
- 所有 HTTP 走 `wx.cloud.callContainer`，不直 `wx.request`
- `X-WX-OPENID` 仅信任网关注入
```

- [ ] **Step 2: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add README.md
git -c core.autocrlf=false commit -m "docs: rewrite README for single-loop product"
```

---

### Task 10.2：DECISIONS.md 追加 M3

**Files:**
- Modify: `DECISIONS.md`（末尾追加）

- [ ] **Step 1: 追加 ADR**

在文件末尾追加：

```markdown
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
```

- [ ] **Step 2: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add DECISIONS.md
git -c core.autocrlf=false commit -m "docs: add M3-D011 ADR for single-loop refactor"
```

---

### Task 10.3：CLAUDE.md 更新

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 删除指向已删文档的引用**

搜索：
```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
grep -nE "DEVELOPMENT_PLAN|TASKS\.md|TEST_PLAN|DEPLOYMENT_CHECKLIST|WORKFLOW-DEV|HANDOFF|REFORM_PLAN" CLAUDE.md
```

将所有命中替换为对 `docs/superpowers/specs/2026-08-20-manmanorder-single-loop-design.md` 或 `README.md` 的引用。

- [ ] **Step 2: 更新"Common Commands"段**

保留现有命令，去掉指向 `server/openapi.yaml` 的引用（如有）。

- [ ] **Step 3: 提交**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git add CLAUDE.md
git -c core.autocrlf=false commit -m "docs: update CLAUDE.md to reference new spec"
```

---

## 阶段 11：部署 & 双设备闭环

### Task 11.1：合并所有提交并推送

- [ ] **Step 1: 确认 main 分支干净**

```bash
cd "D:/数据/OneDrive/Project/ManmanOrder"
git status
git log --oneline -15
```

Expected: 全部新提交在 main 顶部；无残留 modified/untracked

- [ ] **Step 2: 推送触发 Cloud Run 自动构建**

```bash
git push origin main
```

---

### Task 11.2：双设备闭环（模拟器即可，按 M2-D010）

- [ ] **Step 1: A 账号选菜**

在 wechat-devtools 模拟器 A（或物理设备 A）：
- 打开小程序
- 选今天 + 勾 2 道菜 + 写备注 "测试"
- 保存

- [ ] **Step 2: B 账号查看**

在 wechat-devtools 模拟器 B（不同 openid 通过 `callContainer` 头注入模拟）：
- 打开小程序
- 看到同样的菜 + 备注
- AppData 截图

- [ ] **Step 3: 验证不变量（DECISIONS M3-D011 §9 验收）**

逐条过：
1. 真机闭环：✓
2. 覆盖语义：连续保存 3 次 → 看板只显示最后一次
3. 日期范围：昨天/+7 → 400
4. 菜品管理：任何人增删改启停 → 立即可见
5. 跨设备一致：A/B 同时间打开看到一致
6. 零敏感信息：`git grep -E "AppSecret|API_KEY|openid-[a-z0-9]{20,}"` 在指定路径零命中
7. 构建/测试通过：`server && npx jest` 与 `miniprogram && npx tsc --noEmit && npx vitest run` 退出 0
8. 代码量：`server/src/` ≤ 600 行；小程序业务 ≤ 2000 行；全仓业务 ≤ 3000 行

---

## 总验收 Definition of Done

1. 单闭环工作：A 选菜 → B 看到（spec §9.1）
2. PUT = 覆盖（spec §9.2）
3. 日期范围 7 天（spec §9.3）
4. 菜品可 CRUD（spec §9.4）
5. 跨设备一致（spec §9.5）
6. 无敏感信息入仓（spec §9.6）
7. `npx jest` + `npx tsc --noEmit` + `npx vitest run` 全绿（spec §9.7）
8. 代码量上限（spec §9.8）
9. 真实编译 + 截图完成（Task 9.2）
10. README / DECISIONS / CLAUDE.md 更新完成（Task 10.x）