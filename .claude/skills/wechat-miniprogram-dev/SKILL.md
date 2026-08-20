---
name: wechat-miniprogram-dev
description: Use whenever editing the 蔓蔓点菜 (ManmanOrder) WeChat miniprogram — pages, components, services, cloudfunctions/notify-admin, or the Cloud Run Express backend. Covers WXML/WXSS/TypeScript conventions, callContainer API layer, page state machine (initial/loading/empty/error), and the mandatory real-build verification flow via the wechat-devtools MCP.
---

# 蔓蔓点菜 · 项目专用 Skill

This project is a **native WeChat miniprogram** (TypeScript) plus a **Cloud Run Express backend** plus the `notify-admin` **cloud function**. Always use this Skill when touching any of those surfaces.

## Required reading before any code change

1. `references/architecture.md` — directory layout, runtime topology, env var sources.
2. `references/coding-rules.md` — TS/WXSS/WXML conventions, API layer usage, page state rules.
3. `references/verification.md` — the mandatory real-build + screenshot loop.

Do **not** skip these. If you only read one, read `verification.md`.

## Stack snapshot

- Frontend: native WeChat miniprogram, **TypeScript** (target ES2020, `strict: false`, `module: CommonJS`), `@/*` path alias.
- API layer: `wx.cloud.callContainer` wrapped in `miniprogram/services/api.ts` — never call `wx.request` directly from a Page.
- Backend: Express 4 + `mysql2` on Cloud Run (env-injected MySQL 5.7).
- Cloud function: `cloudfunctions/notify-admin` (`wx-server-sdk ~2.4.0`) — currently uses CloudBase doc DB for jobs; MySQL migration pending (see DECISIONS M1-D008).
- Auth: openid via `X-WX-OPENID` header (Cloud Run injects it from `callContainer`). Admin allow-list is `ADMIN_OPENIDS` env var on the backend.
- UI library: **none**. Build UI with native `view`/`text`/`button` + plain WXSS unless the user explicitly requests TDesign/Vant.

## Tooling you must use

| Task | Tool |
|---|---|
| Open project, compile, read console, navigate, screenshot, automate UI | **wechat-devtools MCP** |
| Standalone E2E / regression scripts | **miniprogram-automation** Skill (`miniprogram-automator`) |
| `pack-npm` / preview / upload (do **not** auto-upload) | **miniprogram-ci** Skill |
| CloudBase cloud function / cloud run / database questions | **cloudbase** Skill + cloudbase MCP |
| This project's own conventions | **wechat-miniprogram-dev** Skill (this file) |

## Mandatory verification after any change

Never declare a change "done" from source inspection alone. The full loop lives in `references/verification.md`. Short version:

```
edit code
 → tsc --noEmit (typecheck)
 → wechat-devtools MCP: open / compile
 → read compile errors + console
 → navigate to affected page
 → exercise the feature
 → screenshot
 → confirm expected state
```

If wechat-devtools MCP is unavailable (DevTools not running, port not enabled, etc.), say so explicitly — do **not** silently skip the verification step.

## Hard rules

1. **No secrets in client code.** AppSecret, API keys, DB passwords, admin openids — none of these go in `miniprogram/`, `CLAUDE.md`, or any Skill.
2. **All HTTP goes through `services/api.ts`.** Pages and components must not call `wx.cloud.callContainer` or `wx.request` directly.
3. **No `any` / `as any` without comment.** `strict: false` does not authorize sloppiness.
4. **Page state machine**: every Page that fetches data must render `initial | loading | success | empty | error`. Silent failure is a bug.
5. **async/await + try/catch** for every call to `services/api`. UI feedback (toast / modal) on `ApiException`.
6. **Logging**: never log tokens, openid, passwords, or full user PII. Redact before printing.
7. **Don't refactor unrelated code.** Match existing style (`strict: false`, 2-space, no semicolons in miniprogram `.ts`? — match what's there).

## When you are stuck

- Compile error → read the error at the exact file:line. Do not guess.
- Page renders blank → check `data` shape, `setData` keys, WXML bindings.
- API fails → check `wx.cloud.callContainer` returns `{ data, statusCode }` — `api.ts` already handles this; if you see raw `{ statusCode: 500 }` leaking, the page bypassed `api.ts`.
- Optimistic lock conflict (HTTP 409) → re-fetch and merge; do not blindly retry PUT.
