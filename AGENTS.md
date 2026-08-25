# 微信小程序项目规则

## Scope and stack

- 微信开发者工具项目根目录是 `WeChatDeloy/`，小程序源码在 `WeChatDeloy/miniprogram/`。
- 默认技术栈为原生微信小程序、WXML、WXSS、TypeScript 和原生 `wx.*` API。
- 未经用户明确决定，不引入 Taro、uni-app、React、Vue、TDesign 或其他 UI 框架。
- 开始修改前，先读 `.claude/skills/wechat-miniprogram-dev/SKILL.md`；其中的 `.claude` Skill 是 Claude 与 Codex 共用的规范源。

## Implementation rules

- 保持现有目录和模块边界；不要为了统一目录强制重构。
- 页面只处理生命周期、UI 状态和交互；网络访问经 `miniprogram/services/api.ts`，页面和组件不要直接调用 `wx.request` 或 `wx.cloud.callContainer`。
- TypeScript 避免 `any`；API、页面数据和组件 properties 使用明确类型。公共领域类型沿用现有 `miniprogram/domain/`，不要平行创建类型体系。
- 使用任何 `wx.*` API 前，查阅当前微信官方文档或本机类型定义，禁止猜测 API 或字段。
- 公共 UI 优先放入 `components/`，但不为一次性小片段过度抽象。

## Verification

- 代码修改后至少运行 `npm run typecheck` 和 `npm run lint`（在 `WeChatDeloy/miniprogram/`）。
- UI 改动还必须用微信开发者工具编译、查看 console、打开相关页面并截图；交互改动还要运行相应自动化操作。
- MCP 不可用时如实报告缺口，不要以静态阅读替代编译或界面验证。

## Safety

- 不提交 AppSecret、腾讯云密钥、数据库密码、上传私钥、token 或本地登录文件。
- CloudBase 仅在用户明确启用时配置；不得自行登录、创建环境/数据库/存储、产生费用或改动生产资源。
- 不执行正式 upload、提交审核、git push 或生产部署，除非用户明确授权。
- 保留用户已有未提交修改；不要使用 reset、checkout 或删除未跟踪目录。
