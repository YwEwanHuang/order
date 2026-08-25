# DECISIONS.md

> 架构决策记录（ADR）。每次决策包含背景、决定和后果。

---

## M2-D009：项目收缩至「蔓蔓点菜 → 看板可见」单闭环

- 日期：2026-08-20
- 状态：CONFIRMED

**背景：** 仓库累计约 10000 行 / 60+ 文件，唯一被产品要求的能力"管理员能看到蔓蔓点了什么"从未落地。其上是通知任务队列、订阅配额、乐观锁等技术债。

**决定：** 砍掉整条通知/订阅流水线、乐观锁、幂等键、限流。点菜看板成为回顾唯一形态；`PUT /api/v1/meal-plans` 即 upsert，last-write-wins。

**后果：**
- 服务端：3 路由（dishes / meal-plans / health），无 admin、无通知、无内部 API。
- 小程序：3 页（home / select / dishes），无 tabBar，无 admin，无订阅授权。
- 删 `routes/{admin,internal,quota,notifications}.js`、`middleware/rateLimit.js`、`cloudfunctions/`。

---

## M3-D011：单闭环重构（删 admin / today-only / 增删改菜品）

- 日期：2026-08-20
- 状态：CONFIRMED

**背景：** 实际需求为"2 人家庭"——蔓蔓选当天菜，我直接看。admin / 三餐 / 30 天范围均与实际使用不符。

**决定：**
- **选菜日期**：仅今天可点菜（date picker 范围 today → today）。由 `home/index.ts` 中 `maxDate: today` 控制。
- **查看历史**：可查看任意过去日期的记录（在 home 页切换日期查看）。由 `domain/date.ts` 中 `isPastDate()` 识别历史。
- **鉴权**：无鉴权，任何人可看可改可管理菜品。
- **上传**：`PUT /api/v1/meal-plans`，last-write-wins。
- **菜品**：初始 10 道种子 + 任何人可增删改启停。

**日期范围调整方式：** 如需修改选菜日期范围，改 `home/index.ts` 中 `maxDate` 值即可（today → today+N）。`domain/date.ts` 中 `DATE_RANGE.MAX_OFFSET_DAYS` 和 `shiftISO()` 保留用于未来扩展。

**后果：**
- 服务端：`src/` ≤ 600 行，3 路由，MySQL only。
- 小程序：3 页（home / select / dishes），无 admin。
- 删除文件：cloudfunctions/、pages/{admin,selection,menu,profile,meal-plans}/、ts-out/、server/coverage/、server/e2e/。
