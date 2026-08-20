# Architecture — 蔓蔓点菜

## Top-level layout

```
ManmanOrder/
├── WeChatDeloy/                ← WeChat developer-tools project root
│   ├── project.config.json     ← committed; safe settings
│   ├── project.private.config.json ← gitignored; appid, "condition"
│   ├── miniprogram/            ← TS source compiled in-place to .js
│   │   ├── app.ts              ← entry; wx.cloud.init + globalData
│   │   ├── app.json            ← pages registry (no tabBar), window
│   │   ├── app.wxss
│   │   ├── pages/              ← home, select, dishes (no tabBar)
│   │   ├── components/         ← reusable UI
│   │   ├── services/api.ts     ← the ONLY callContainer wrapper
│   │   ├── domain/             ← plain TS types, guards, pure helpers
│   │   ├── typings/            ← ambient .d.ts (e.g. wx-app types)
│   │   └── images/             ← tab icons, placeholders
├── server/                     ← Express API (Cloud Run)
│   └── src/
│       ├── index.js            ← boot, ensureSchema, mount /api/v1
│       ├── db/pool.js          ← mysql2 pool + ensureSchema + seed
│       ├── middleware/         ← openid (no auth check), errorHandler, requestId
│       └── routes/             ← dishes / mealPlans
├── .mcp.json                   ← wechat-devtools + cloudbase MCPs
├── .claude/skills/wechat-miniprogram-dev/  ← THIS skill
├── CLAUDE.md                   ← stable project facts only
├── DECISIONS.md                ← ADRs (M0–M3)
├── README.md                   ← onboarding + API table
└── Dockerfile                  ← Cloud Run build
```

Note: `WeChatDeloy/` is the project root that the WeChat developer tools open. `project.config.json` lives there. Many other tools (incl. `miniprogram-ci`) also point at this directory.

## Runtime topology

```
WeChat miniprogram (TS)
   │
   │ wx.cloud.callContainer  (private link, Cloud Run injects X-WX-OPENID)
   ▼
Express API (Cloud Run container)
   │ reads MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD from env
   ▼
Cloud-managed MySQL 5.7 (manmanorder DB)

Both legs authenticate via `X-WX-OPENID` header that Cloud Run populates from the callContainer session. The mini-app never sees AppSecret or DB credentials.

## Where config comes from

| Concern | Source | Hardcoded? |
|---|---|---|
| Cloud env id | `app.globalData.cloudEnvId` (runtime) | No (deployment identifier, not secret) |
| Cloud service name | `app.globalData.cloudServiceName` (runtime) | No (deployment identifier, not secret) |
| MySQL creds | Cloud Run env vars only (`MYSQL_*`) | No |
| Admin allow-list | `ADMIN_OPENIDS` env var (CSV of openids) | No |

`cloudEnvId` / `cloudServiceName` are deployment identifiers, not secrets. `api.ts` reads them at runtime; the legacy hardcoded fallbacks have been removed. `globalData.cloudBaseUrl` was dead config and is also gone.

## Module boundaries (miniprogram)

- `pages/**` — UI + page lifecycle only. Imports from `services/`, `domain/`, `components/`. No network primitives.
- `components/**` — props in / events out. No `wx.cloud.*` calls.
- `services/api.ts` — single callContainer wrapper, typed, throws `ApiException`.
- `domain/**` — pure types, guards, formatters, no `wx.*` imports.
- `utils/**` (if added) — small helpers; no state.
- `typings/**` — ambient declarations (extend `wx` / `IAppOption`).
