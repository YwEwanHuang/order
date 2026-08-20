# Architecture — 蔓蔓点菜

## Top-level layout

```
ManmanOrder/
├── WeChatDeloy/                ← WeChat developer-tools project root
│   ├── project.config.json     ← committed; safe settings
│   ├── project.private.config.json ← gitignored; appid, "condition"
│   ├── miniprogram/            ← TS source compiled in-place to .js
│   │   ├── app.ts              ← entry; wx.cloud.init + globalData
│   │   ├── app.json            ← pages registry, tabBar, window
│   │   ├── app.wxss
│   │   ├── pages/              ← menu, selection, meal-plans, profile, admin/*
│   │   ├── components/         ← reusable UI
│   │   ├── services/api.ts     ← the ONLY callContainer wrapper
│   │   ├── domain/             ← plain TS types, guards, pure helpers
│   │   ├── typings/            ← ambient .d.ts (e.g. wx-app types)
│   │   └── images/             ← tab icons, placeholders
│   └── cloudfunctions/
│       ├── notify-admin/       ← canonical notify job processor (wx-server-sdk)
│       └── quickstartFunctions/ ← template; ignore / delete per dev plan
├── server/                     ← Express API (Cloud Run)
│   └── src/
│       ├── index.js            ← boot, ensureSchema, mount /api/v1 + /internal/notify
│       ├── db/cloudbase.js     ← file kept; impl now mysql2 + idempotent schema
│       ├── middleware/
│       └── routes/             ← dishes / mealPlans / admin / notifications / quota / internal
├── cloudfunctions/             ← gitignored copies used during upload (see .gitignore)
├── .mcp.json                   ← wechat-devtools + cloudbase MCPs
├── .claude/skills/wechat-miniprogram-dev/  ← THIS skill
├── CLAUDE.md                   ← stable project facts only
├── DECISIONS.md                ← ADRs (M0/M1)
├── DEVELOPMENT_PLAN.md         ← product spec
├── TEST_PLAN.md, TASKS.md, HANDOFF.md, DEPLOYMENT_CHECKLIST.md
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

…in parallel…
cloudfunction notify-admin  (cron 1/min)
   │ reads NOTIFY_API_URL / NOTIFY_API_TOKEN / SUBSCRIBE_TEMPLATE_ID
   │ uses wx-server-sdk (CloudBase doc DB) for current jobs table
   ▼
Express /internal/notify/*   (token-authenticated)
```

Both legs authenticate via `X-WX-OPENID` header that Cloud Run populates from the callContainer session. The mini-app never sees AppSecret or DB credentials.

## Where config comes from

| Concern | Source | Hardcoded? |
|---|---|---|
| Cloud env id | `app.globalData.cloudEnvId` (runtime) → fallback `'prod-d8gkzjj6ub74bba3b'` | No |
| Cloud service name | `app.globalData.cloudServiceName` → fallback `'express-stvz'` | No |
| API base URL | `app.globalData.cloudBaseUrl` → fallback | No |
| MySQL creds | Cloud Run env vars only (`MYSQL_*`) | No |
| Admin allow-list | `ADMIN_OPENIDS` env var (CSV of openids) | No |
| Notify API token | `NOTIFY_API_TOKEN` env var on both sides | No |
| Subscribe template | `SUBSCRIBE_TEMPLATE_ID` env var | No |

Rule of thumb: if a value can be set at runtime via env or `globalData`, do not put it in source. The fallbacks in `api.ts` exist only so that local `cli preview` works against the dev cluster — they are not a license to bake secrets.

## Module boundaries (miniprogram)

- `pages/**` — UI + page lifecycle only. Imports from `services/`, `domain/`, `components/`. No network primitives.
- `components/**` — props in / events out. No `wx.cloud.*` calls.
- `services/api.ts` — single callContainer wrapper, typed, throws `ApiException`.
- `domain/**` — pure types, guards, formatters, no `wx.*` imports.
- `utils/**` (if added) — small helpers; no state.
- `typings/**` — ambient declarations (extend `wx` / `IAppOption`).
