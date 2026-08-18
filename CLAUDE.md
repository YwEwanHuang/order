# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"蔓蔓点菜" (ManmanOrder) is a native TypeScript WeChat miniprogram with an Express API deployed to WeChat Cloud Run. The runtime storage decision in `DECISIONS.md` supersedes older document-database assumptions in `DEVELOPMENT_PLAN.md`.

## Key Files

- `DEVELOPMENT_PLAN.md` — Full product/technical specification, data models, API contracts, and phased implementation plan (M0–M5). **Read this before making any significant changes.**
- `WeChatDeloy/project.config.json` — Miniprogram project configuration (appid, compile settings).
- `WeChatDeloy/miniprogram/app.ts` — Miniprogram entry and cloud initialization.
- `WeChatDeloy/miniprogram/app.json` — Page registry and global window config.
- `WeChatDeloy/cloudfunctions/quickstartFunctions/index.js` — Template cloud function; will be replaced with `notify-admin` and other business functions per the development plan.

## Tech Stack

- **Frontend**: Native WeChat miniprogram with TypeScript.
- **Backend**: Express.js + cloud-managed MySQL 5.7 (`mysql2`).
- **Deployment target**: WeChat Cloud Run, built automatically from GitHub using the root `Dockerfile`.

## Common Commands

```bash
# WeChat developer tools - open project
# Use the GUI to open WeChatDeloy/ as a miniprogram project

# Deploy cloud functions (from WeChatDeloy/ directory)
# Edit uploadCloudFunction.sh with correct envId and projectPath first
bash uploadCloudFunction.sh

# CloudBase CLI (if installed)
tcb fn deploy <functionName>   # deploy a cloud function
tcb cloudrun deploy ...        # deploy containerized service
```

## Architecture Notes

- Cloud functions run in a privileged context and receive `OPENID` via `cloud.getWXContext()` — never trust client-supplied openid values.
- The API uses `wx.cloud.callContainer`; deployment identifiers are supplied by the existing runtime configuration/fallbacks.
- The `cloudfunctions/quickstartFunctions/` directory holds template code; per `DEVELOPMENT_PLAN.md` it will be replaced with `notify-admin` and other domain-specific functions.
- All business logic goes through `wx.cloud.callContainer` (private link) to the Express API.
- The server reads `MYSQL_ADDRESS`, `MYSQL_USERNAME`, and `MYSQL_PASSWORD` only from Cloud Run. Never add database credentials to repository files.

## Security Notes

- Never commit real AppIDs, secrets, environment IDs, or openids to the repository.
- `.gitignore` should be created covering `node_modules/`, `.env*`, `project.private.config.json`, and local logs.
- The `uploadCloudFunction.sh` script contains deployment commands — verify it doesn't contain hardcoded secrets before running.
