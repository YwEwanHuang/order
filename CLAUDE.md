# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI dev environment

This project is configured for Claude Code development of a WeChat miniprogram. Before editing any code in this repo, read:

`.claude/skills/wechat-miniprogram-dev/SKILL.md`

…then the referenced `references/{architecture,coding-rules,verification}.md` as needed.

Tooling that is wired up:

- **wechat-devtools MCP** (in `.mcp.json`) — drives the WeChat developer tools: open project, compile, read console, navigate, screenshot, automate UI.
- **cloudbase MCP** (in `.mcp.json`) — for CloudBase Cloud Run / DB questions.
- **wechat-devtools Skill** — MCP companion instructions.
- **miniprogram-automation Skill** — `miniprogram-automator` based E2E scripts.
- **miniprogram-ci Skill** — `pack-npm` / preview / upload scripts (never auto-upload to production).
- **cloudbase Skill** — CloudBase development guidelines.

Hard rule for every change: after editing, run the verification loop in
`.claude/skills/wechat-miniprogram-dev/references/verification.md` (typecheck → real compile in DevTools → screenshot). Do not declare done from source inspection alone.

## Project Overview

"蔓蔓点菜" (ManmanOrder) is a native TypeScript WeChat miniprogram with an Express API deployed to WeChat Cloud Run. Product scope = **点菜 → 看板可见**; see `DECISIONS.md` M2-D009 for the explicit cut.

## Key Files

- `README.md` — onboarding, API table, env vars, deployment.
- `docs/superpowers/specs/2026-08-20-manmanorder-single-loop-design.md` — product spec for the single-loop refactor.
- `DECISIONS.md` — ADR log (M0–M3).
- `WeChatDeloy/project.config.json` — Miniprogram project configuration (appid, compile settings).
- `WeChatDeloy/miniprogram/app.ts` — Miniprogram entry and cloud initialization.
- `WeChatDeloy/miniprogram/app.json` — Page registry and global window config.

## Tech Stack

- **Frontend**: Native WeChat miniprogram with TypeScript.
- **Backend**: Express.js + cloud-managed MySQL 5.7 (`mysql2`).
- **Deployment target**: WeChat Cloud Run, built automatically from GitHub using the root `Dockerfile`.

## Common Commands

```bash
# Backend tests
cd server && npx jest

# Miniprogram typecheck + domain unit tests
cd WeChatDeloy/miniprogram && npx tsc --noEmit && npx vitest run

# WeChat developer tools: open WeChatDeloy/ as a miniprogram project

# Deploy: ONLY via git push to origin/main. WeChat Cloud Run auto-pulls and builds.
# Do NOT use `wxcloud run:deploy` — manual upload bypasses the GitHub deploy chain
# and risks drifting from main. If you need a one-off, use the Cloud Run web console.
```

## Architecture Notes

- The API uses `wx.cloud.callContainer`; deployment identifiers (`cloudEnvId`, `cloudServiceName`) are runtime identifiers, not secrets, and live in `app.globalData` + `project.config.json`.
- All business logic goes through `wx.cloud.callContainer` (private link) to the Express API.
- The server reads `MYSQL_ADDRESS`, `MYSQL_USERNAME`, and `MYSQL_PASSWORD` only from Cloud Run. Never add database credentials to repository files.
- `POST /api/v1/meal-plans` is an upsert by `(openid, date, mealType)` — last write wins, no version, no idempotency key.

## Security Notes

- Never commit real AppIDs, secrets, environment IDs, or openids to the repository.
- `.gitignore` must cover `node_modules/`, `.env*`, `project.private.config.json`, and local logs.
- Public ingress on Cloud Run must stay closed; `X-WX-OPENID` is only trustworthy when injected by the gateway.