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
