# AI 微信小程序开发环境

## Project baseline

- 微信开发者工具项目根目录：`WeChatDeloy/`
- 小程序源码：`WeChatDeloy/miniprogram/`
- 默认前端技术栈：原生 WXML、WXSS、TypeScript、`wx.*` API；未决定采用 TDesign。
- 共享规则：`AGENTS.md`；详细项目 Skill：`.claude/skills/wechat-miniprogram-dev/`。Codex 通过 `.agents/skills/wechat-miniprogram-dev/` 桥接到同一份规范，避免规则分叉。

## Installed Skills

The following globally installed Skills are available to both Codex and Claude Code and should not be reinstalled per project:

- `wechat-devtools` — WeChat DevTools MCP SOP, compile, console, page inspection and screenshots.
- `miniprogram-automation` — `miniprogram-automator` E2E scripts and screenshot regression checks.
- `miniprogram-ci` — pack-npm, preview and upload guidance. It never authorizes upload by itself.
- `cloudbase` — CloudBase guidance only. It does not log in or create resources.

No reliable Tencent-maintained, Skills-CLI-compatible TDesign Mini Program knowledge Skill was found. TDesign is deliberately not installed as an npm dependency; add it only after an explicit UI-library decision.

## MCP configuration

Project-level `.mcp.json` already configures:

| Server | Command | Purpose |
| --- | --- | --- |
| `wechat-devtools` | `uvx wechat-devtools-mcp` | Open, compile, inspect console/page data, navigate, automate and screenshot the DevTools project. |
| `cloudbase` | `npx -y @cloudbase/cloudbase-mcp@latest` | Future CloudBase resource operations. |

After changing `.mcp.json`, restart the MCP client (Codex or Claude Code) so it reloads the project configuration. The CloudBase MCP must remain unauthenticated until CloudBase is explicitly enabled; do not create resources from setup work.

### Required manual DevTools settings

1. Open WeChat Developer Tools and sign in.
2. Open `WeChatDeloy/` as the project.
3. Open **设置 → 安全设置 → 服务端口** and enable it.
4. This project uses port `25039`; keep the DevTools HTTP service listening on that port.
5. If DevTools has a CLI access token configured, provide it to the MCP through its client configuration; never commit it.

The service port is a GUI setting. An agent cannot enable it silently. A connection failure such as `ECONNREFUSED` means this prerequisite must be checked before retrying.

## Development and verification workflow

1. Read `AGENTS.md` and the canonical project Skill.
2. Inspect the affected page, component, service and types; verify unfamiliar `wx.*` APIs in current official documentation.
3. Implement the smallest scoped change. Pages call `services/api.ts`; reusable UI goes in `components/`.
4. Run from `WeChatDeloy/miniprogram/`:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```

5. For UI changes, use the wechat-devtools MCP to compile, read console output, navigate to the page, inspect data, exercise the flow and capture a screenshot.
6. For interaction regression tests, add/run `miniprogram-automator` scripts. The DevTools service port must be open.

## Local commands

```bash
# Mini program static checks
cd WeChatDeloy/miniprogram
npm run typecheck
npm run lint
npm run format:check
npm test

# DevTools CLI capability check (does not upload)
/Applications/wechatwebdevtools.app/Contents/MacOS/cli --help

# CI package capability check (no credentials, preview or upload)
cd ../
npx miniprogram-ci --help
```

`miniprogram-ci` is installed as a dev dependency of `WeChatDeloy/`. A preview or upload requires a separate private key and explicit user authorization. Never store the key in Git; `.gitignore` covers the common key-file forms.

### Current quality baseline

The setup added the checks but deliberately did not mass-rewrite existing source files. At setup time, ESLint reports 22 existing `any` warnings and `npm run format:check` reports formatting differences in 28 existing files. Both are visible baselines, not silently suppressed. For a feature change, format only its touched files; schedule any repository-wide cleanup as a separate, reviewed task.

## Preview and upload boundaries

- Preview can be configured later with `miniprogram-ci`, but it needs a real AppID and upload private key.
- Upload, production release and WeChat review are forbidden without explicit user authorization.
- Keep generated QR images, temporary credentials and CI key files out of Git.

## CloudBase enablement

CloudBase is optional. When it is deliberately enabled, first configure authentication and choose the exact environment; then use the project CloudBase MCP. This can create billable resources, so do not log in, initialize an environment, create a database/storage bucket, or deploy CloudRun during setup.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `wechat-devtools-mcp` cannot connect | DevTools is open, logged in, service port enabled, and port `25039` is listening. |
| MCP config changes are ignored | Restart the MCP client; project `.mcp.json` is loaded at client startup. |
| TypeScript lacks `wx` APIs | Confirm `miniprogram-api-typings` is installed and `tsconfig.json` includes it. |
| Automator cannot launch | Check DevTools service port and project root; do not attempt preview/upload as a workaround. |
| `miniprogram-ci` needs a key | Stop and obtain a dedicated upload key outside the repository; do not paste it into a chat or source file. |
