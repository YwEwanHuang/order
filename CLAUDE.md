# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"蔓蔓点菜" (ManmanOrder) is a WeChat miniprogram for meal planning. The current codebase is in early stages — the `WeChatDeloy/` directory contains the standard WeChat cloud development quickstart template, not yet customized for the target app. The comprehensive design is documented in `DEVELOPMENT_PLAN.md`.

## Key Files

- `DEVELOPMENT_PLAN.md` — Full product/technical specification, data models, API contracts, and phased implementation plan (M0–M5). **Read this before making any significant changes.**
- `WeChatDeloy/project.config.json` — Miniprogram project configuration (appid, compile settings).
- `WeChatDeloy/miniprogram/app.js` — Miniprogram entry; `env` ID must be filled in before cloud calls work.
- `WeChatDeloy/miniprogram/app.json` — Page registry and global window config.
- `WeChatDeloy/cloudfunctions/quickstartFunctions/index.js` — Template cloud function; will be replaced with `notify-admin` and other business functions per the development plan.

## Tech Stack

- **Frontend**: Native WeChat miniprogram with JavaScript (per template; TypeScript planned per development plan).
- **Backend**: Cloud functions (wx-server-sdk) + CloudBase document database.
- **Deployment target**: WeChat Cloud Base (微信云托管) with Express.js API planned (not yet created).

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
- The `app.js` global `env` field is empty; fill in the CloudBase environment ID before the app can connect to cloud resources.
- The `cloudfunctions/quickstartFunctions/` directory holds template code; per `DEVELOPMENT_PLAN.md` it will be replaced with `notify-admin` and other domain-specific functions.
- All business logic should eventually go through `wx.cloud.callContainer` (private link) to an Express.js API rather than direct `wx.cloud` database access, per the architecture decision in the development plan.

## Security Notes

- Never commit real AppIDs, secrets, environment IDs, or openids to the repository.
- `.gitignore` should be created covering `node_modules/`, `.env*`, `project.private.config.json`, and local logs.
- The `uploadCloudFunction.sh` script contains deployment commands — verify it doesn't contain hardcoded secrets before running.