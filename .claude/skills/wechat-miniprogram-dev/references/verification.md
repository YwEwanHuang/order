# Verification — 蔓蔓点菜

The single most important rule of this project: **a change is not done until it has been compiled and exercised in the real WeChat developer tools.**

## The loop

```
1. Edit code
2. tsc --noEmit                                  ← static check
3. wechat-devtools MCP: open project             ← (if not open)
4. wechat-devtools MCP: compile                  ← force compile
5. read compile errors                           ← fix until zero
6. read console for warnings / runtime errors    ← fix anything new
7. navigate to the affected page                 ← wechat-devtools navigate
8. exercise the feature                          ← tap / input / submit
9. inspect page data + screenshot                ← wechat-devtools screenshot
10. confirm expected state                       ← only then: done
```

If the user explicitly says "skip verification" or "just edit the source", do so but flag the gap in the final report.

## Step 2 — typecheck

```bash
cd WeChatDeloy/miniprogram
npx tsc --noEmit
```

The project's package.json already has `npm run typecheck` aliased to this. `strict: false` means tsc is lenient — use it anyway; many bugs surface here.

## Steps 3–6 — wechat-devtools MCP

Use the wechat-devtools MCP tools (not raw CLI). Common ones:

- `open_project` (with `WECHAT_PROJECT_PATH` from `.mcp.json` env — already set)
- `compile`
- `get_compile_results` / `get_console_messages`
- `navigate` (page path)
- `get_page_data` / `get_current_page`
- `screenshot`

If the DevTools service port is not enabled, the MCP will return an error like `服务端口未开启` or `connect ECONNREFUSED`. Surface that immediately — see "Manual prerequisites" below.

## Step 9 — screenshot

Always screenshot after a UI-affecting change:

- layout / margin / padding / flex → screenshot full page
- new component → screenshot the page that hosts it
- tap / input flow → screenshot after the action settles

Save screenshots to `tmp/screenshots/<feature>-<timestamp>.png` (this dir is gitignored). Do not commit them unless asked.

## Step 10 — confirm expected state

Verbal checklist before declaring done:

- [ ] No new compile errors
- [ ] No new console errors / warnings
- [ ] Page data shape matches what the WXML expects (use `get_page_data`)
- [ ] User-visible state matches the requested behavior
- [ ] Optimistic-lock / error paths not regressed (force a 409 if you touched meal-plan update)
- [ ] Empty / loading / error states still render (eye-test the empty case)

## When MCP is unavailable

If the DevTools isn't open or the service port isn't enabled:

1. Tell the user explicitly: state which step is blocked and why.
2. Do not silently fall back to "I read the source and it looks right".
3. Continue with whatever *can* be verified statically (typecheck, lint if available).
4. List the manual prerequisite as the first item in the final report's "Needs manual" section.

## Manual prerequisites (one-time, before MCP can work)

These are user actions — Claude cannot perform them:

1. **Open the WeChat developer tools and sign in** with a WeChat scan.
2. **Enable the service port**:
   WeChat DevTools → Settings (设置) → Security (安全设置) → Service Port / CLI / HTTP calling (服务端口) → toggle on.
3. **Trust the project** when prompted on first open (Claude Code is a "third-party" caller).

After these three are done once per machine, MCP calls work until you sign out of DevTools.

## Regression-safe edits

When changing `services/api.ts`, every page that imports it is implicitly affected. After editing:

- typecheck
- compile
- navigate to **each** top-level tab (menu, meal-plans, profile) and screenshot
- re-test any page that uses the changed method

When changing `domain/types.ts`, treat it as a compile-error bomb: most call-sites will break. Fix typecheck first, then compile, then UI.

## Bug fix protocol

```
reproduce  → get the failing state / log
locate     → read code at the file:line; do not guess
min-edit   → smallest change that fixes the root cause
verify     → full loop above
regress    → re-screenshot the adjacent happy paths
```

If a bug "fix" needs more than ~30 lines of new code, stop and split: small fix + separate follow-up for the structural improvement.
