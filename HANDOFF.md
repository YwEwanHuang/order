# HANDOFF.md

> 追加式交接记录。每次交接后追加一条记录。

---

## 2026-08-17 10:16 - T-011 TypeScript 小程序骨架

- 状态：DONE
- 目标：建立 TypeScript 小程序基础架构、domain 层、services 层和 7 个页面
- 改动文件：
  - `WeChatDeloy/miniprogram/package.json` + `tsconfig.json`
  - `WeChatDeloy/miniprogram/domain/` — types.ts、date.ts、selection.ts
  - `WeChatDeloy/miniprogram/services/api.ts` — callContainer 封装
  - `WeChatDeloy/miniprogram/app.ts` — 替换 app.js
  - `WeChatDeloy/miniprogram/app.json` — 注册 7 个页面 + tabBar
  - `WeChatDeloy/miniprogram/pages/` — menu、selection/confirm、meal-plans、profile、admin/dishes、admin/dish-edit、admin/notifications
  - `WeChatDeloy/project.config.json` — 项目名改为 manmanorder，关闭 urlCheck
- 验证命令与结果：项目结构已验证，commit `5d8c9bb` 成功
- 未解决风险：
  - 后端 API 尚未实现，前端页面骨架依赖的 `/api/v1/*` 接口全部空缺
  - WXML 中 `getSelectedCount()` 和 `isSelected()` 需改为 WXS 响应式（已创建 selection-helpers.wxs，WXML 引用待完善）
  - cloudTipModal 组件仍是旧模板 JS，未迁移
  - tabBar 图标文件路径可能需调整
- 下一步：
  1. 在微信开发者工具中验证小程序编译无报错
  2. 等待后端 API 实现后对接（方案 B）
  3. 完善 WXS helper 在 WXML 中的引用
  4. T-003 订阅消息真机验证
- Git：main / 5d8c9bb / clean

---

## 2026-08-17 09:46 - Claude Code 初始化

- 状态：DONE（部分）
- 目标：分析代码库，创建 CLAUDE.md，建立项目基础文档
- 改动文件：
  - 新增 `CLAUDE.md`
  - 新增 `DECISIONS.md`
  - 新增 `TASKS.md`
  - 初始化 Git 仓库（root commit）
- 验证命令与结果：`git log --oneline` → `d37d06d Initial commit: empty project baseline`
- 未解决风险：
  - Phase 0（订阅消息可行性）需用户手动在微信公众平台和真机上操作
  - 云托管账号密码已知但未写入仓库（正确做法）
- 下一步：
  - 用户完成 Phase 0 验证
  - 确认后开始 M1 工程骨架（T-010～T-014）
- Git：main / d37d06d / clean