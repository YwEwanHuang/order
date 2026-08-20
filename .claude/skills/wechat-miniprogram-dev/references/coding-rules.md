# Coding rules — 蔓蔓点菜

## TypeScript

- `strict: false` in `tsconfig.json` (already set). Still: avoid `any` and `as any`. Use precise types.
- Page `data` shape: define a `interface XxxPageData` next to the page; cast `setData` partials to it.
- API DTOs live in `miniprogram/domain/types.ts`. New API endpoints → add the DTO there first, then add the wrapper in `services/api.ts`, then call from the page.
- Discriminated unions for response variants (`ApiResponse<T> | ApiError`) — already in use.
- Path alias `@/*` is available — prefer over deep relative paths when crossing top-level dirs.
- Pure helpers in `domain/` must not import `wx.*`.

## WXML / WXSS

- Indent: 2 spaces (matches `project.config.json`).
- Class naming: BEM-ish kebab-case — `.dish-card`, `.dish-card__title`, `.dish-card--active`.
- Use `rpx` for sizes that scale with screen width. Avoid fixed `px` for layout.
- Flex first. Grid only when flex genuinely cannot express the layout.
- No inline styles unless the value is dynamically computed and there's no other option.
- Page-level container must handle safe areas: `padding-bottom: env(safe-area-inset-bottom);` where sticky buttons sit.

## Page state machine

Every page that fetches data must render all of:

```
initial   → no request fired yet
loading   → request in flight; show skeleton or wx.showLoading
empty     → success with []; show an Empty state component
error     → ApiException or network; show retry CTA
success   → data ready; render
```

Use `this.data.status` enum in `data`. Don't branch on `this.data.list.length === 0` to mean "loading" — those are different states.

## Async / errors

```ts
try {
  wx.showLoading({ title: '加载中', mask: true });
  const dishes = await fetchDishes();
  this.setData({ dishes, status: dishes.length ? 'success' : 'empty' });
} catch (err) {
  this.setData({ status: 'error', errorMessage: err instanceof ApiException ? err.message : '网络异常' });
  wx.showToast({ title: '加载失败', icon: 'none' });
} finally {
  wx.hideLoading();
}
```

- Wrap every `services/api.*` call. Do not let rejections bubble unhandled.
- `ApiException` carries `code`; map known codes (e.g. `VERSION_CONFLICT`) to user-meaningful messages.
- On `VERSION_CONFLICT` (HTTP 409), re-fetch the meal plan and merge before prompting the user.

## Components

Extract to `components/` when:
- 2+ pages reuse the same UI, or
- the block has its own state + events, or
- it's a recognized pattern: `empty-state`, `loading`, `error-retry`, `dish-card`, `meal-type-tab`, `date-picker`.

Do not extract one-line UI "for cleanliness".

## Logging

- `console.log/warn/error` allowed in dev.
- Strip from production with a build flag? Not currently configured — rely on discipline: never `console.log(token)`, `console.log(res)`, etc.
- Server-side: log `{ requestId, route, ms, statusCode }` — never log body that may contain `note` if it can carry PII.

## Don'ts

- No direct `wx.request` / `wx.cloud.callContainer` outside `services/api.ts`.
- No new UI component libraries without an explicit user decision.
- No "improvements" to unrelated files while touching a feature.
- No deletion of cloudfunctions/notify-admin files during a refactor.
- No commit of `project.private.config.json`, `.env*`, `miniprogram_npm/`, or generated `.js` next to `.ts` (see `.gitignore`).
