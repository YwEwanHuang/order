# 蔓蔓点菜 (ManmanOrder)

原生微信小程序 + Express 后端，部署在微信云托管（Cloud Run）。
产品核心：蔓蔓点菜 → 管理员打开小程序"点菜看板"看到。没了。

> 架构决策见 `DECISIONS.md`。本次收缩改造的执行基线见 `REFORM_PLAN.md`。

---

## 架构

```
WeChat miniprogram (TypeScript)
        │ wx.cloud.callContainer  (private link, 网关注入 X-WX-OPENID)
        ▼
Express API (Cloud Run 容器, node:18-alpine)
        │ 读取 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD
        ▼
云托管内置 MySQL 5.7 (manmanorder 库)
```

`X-WX-OPENID` 头由网关从 `callContainer` 会话注入，客户端不持有密钥。
公网入口**必须关闭**，这是 P11 唯一防线。

---

## 仓库结构

```
.
├── WeChatDeloy/                 # 微信开发者工具打开此目录
│   ├── miniprogram/             # TS 源码（编译产物 gitignored）
│   ├── project.config.json
│   └── screenshots/
├── server/                      # Express API
│   ├── src/
│   ├── e2e/                     # 端到端脚本
│   └── package.json
├── Dockerfile                   # Cloud Run 构建
├── .dockerignore
├── DECISIONS.md                 # ADR
├── REFORM_PLAN.md               # 整改方案（执行基线）
└── README.md                    # 本文件
```

---

## API（v1）

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/me` | 当前用户身份 | openid |
| GET | `/api/v1/dishes?category=` | 菜品列表（仅启用） | openid |
| POST | `/api/v1/meal-plans` | 提交/覆盖点菜（upsert by openid+date+mealType） | openid |
| GET | `/api/v1/meal-plans?from=&to=` | 我的点菜记录 | openid |
| GET | `/api/v1/admin/dishes` | 菜品全量（含停用） | admin |
| POST | `/api/v1/admin/dishes` | 新增菜品 | admin |
| PATCH | `/api/v1/admin/dishes/:id` | 编辑/启停 | admin |
| GET | `/api/v1/admin/meal-plans?from=&to=` | **点菜看板** | admin |
| GET | `/health` | 健康检查 | - |

`POST /api/v1/meal-plans` body: `{ date, mealType, items[1..20], note? }`。

---

## 本地开发

```bash
# 后端（需要本地 MySQL 或 docker-compose）
cd server
npm ci
MYSQL_ADDRESS=127.0.0.1:3306 MYSQL_USERNAME=root MYSQL_PASSWORD=*** \
  ADMIN_OPENIDS=oXXXX-xxx npm test          # 跑 jest
npm start                                    # 监听 :80

# 小程序
cd WeChatDeloy/miniprogram
npm ci
npx tsc --noEmit                             # 类型检查
npx vitest run                               # domain 单测
# 微信开发者工具导入 WeChatDeloy/，真机预览
```

---

## 部署

```bash
docker build -t manmanorder-api .            # 本地构建验证
# 推送到触发 Cloud Run 自动构建的 Git 仓库
```

Cloud Run 环境变量：

| 变量 | 来源 | 备注 |
|---|---|---|
| `MYSQL_ADDRESS` | 平台自动注入 | `host:port` |
| `MYSQL_USERNAME` | 平台自动注入 | |
| `MYSQL_PASSWORD` | 平台自动注入 | |
| `ADMIN_OPENIDS` | 手工设置 | 管理员 openid，逗号分隔 |
| `PORT` | 默认 80 | 容器监听端口 |

样例见 `server/.env.example`，所有真实凭据用 `<REDACTED>` 占位。

---

## 安全约束

- 真实 AppID / Secret / openid / DB 密码不入仓库
- `.gitignore` 覆盖 `.env*` / `project.private.config.json` / `*.log`
- 所有 HTTP 走 `wx.cloud.callContainer`，不直接 `wx.request`
- 后端 `X-WX-OPENID` 头由网关注入，绝不信任客户端透传字段