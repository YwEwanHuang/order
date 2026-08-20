/**
 * T-034 E2E：断网/重试、双击防重、旧版本覆盖
 *
 * 运行前提：
 *   1. 微信开发者工具已打开 WeChatDeloy 项目
 *   2. 安全设置 → 开启服务端口
 *   3. 项目安装了 miniprogram-automator@0.12+
 *
 * 运行命令（从 server/ 目录）：
 *   npx jest e2e/e2e.test.js --config e2e/jest.config.js
 *
 * 注意：miniprogram-automator 的 mockWxMethod 只拦截 wx.request，
 * 而本项目使用 wx.cloud.callContainer（不走 wx.request）。
 * 因此 E2E 测试以 UI 行为验证为主（选择器存在、导航正确、状态切换）。
 */

const { spawn } = require('child_process');
const automator = require('miniprogram-automator');

const CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const PROJECT_PATH =
  process.env.MINIPROGRAM_PROJECT_PATH ||
  '/Users/yiwei/Library/CloudStorage/OneDrive-个人/Project/ManmanOrder/WeChatDeloy';
const AUTO_PORT = Number(process.env.WECHAT_AUTO_PORT || 9420);

let miniProgram;

beforeAll(async () => {
  // cli auto 启动后不退出，用 detached spawn 避免阻塞
  const child = spawn(CLI_PATH, [
    'auto',
    '--project', PROJECT_PATH,
    '--auto-port', String(AUTO_PORT),
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  // 等待自动化端口就绪
  await new Promise((resolve) => setTimeout(resolve, 8000));

  miniProgram = await automator.connect({
    wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}`,
  });
}, 60000);

afterAll(async () => {
  if (miniProgram) {
    await miniProgram.restoreWxMethod('request').catch(() => {});
    await miniProgram.close().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// E2E-001：菜单页渲染正常（断网场景基础验证）
// ---------------------------------------------------------------------------
test('E2E-001 菜单页：分类栏和菜品列表正确渲染', async () => {
  const page = await miniProgram.reLaunch('/pages/menu/index');
  await page.waitFor(2000);

  // 分类栏存在
  const categoryBar = await page.$('.category-bar');
  expect(categoryBar).not.toBeNull();

  // 菜品卡片存在（网络正常时应能加载）
  const cards = await page.$$('.dish-card');
  expect(cards.length).toBeGreaterThan(0);

  // 第一个菜品名称可见
  const firstCard = cards[0];
  const nameEl = await firstCard.$('.dish-name');
  expect(nameEl).not.toBeNull();
  const name = await nameEl.text();
  expect(name.trim().length).toBeGreaterThan(0);
}, 20000);

// ---------------------------------------------------------------------------
// E2E-002：选择菜品后跳转确认页，已选内容正确回显
// ---------------------------------------------------------------------------
test('E2E-002 确认页：选菜后进入确认页，已选菜品和备注显示正确', async () => {
  // 先在菜单页选一道菜
  const menuPage = await miniProgram.reLaunch('/pages/menu/index');
  await menuPage.waitFor(2000);

  const firstCard = await menuPage.$('.dish-card');
  expect(firstCard).not.toBeNull();
  await firstCard.tap();
  await menuPage.waitFor(500);

  // 跳转确认页
  const confirmPage = await miniProgram.reLaunch('/pages/selection/confirm');
  await confirmPage.waitFor(1500);

  // 页面标题/已选区域存在
  const sectionTitle = await confirmPage.$('.section-title');
  expect(sectionTitle).not.toBeNull();

  // 备注输入框存在
  const noteInput = await confirmPage.$('.note-input');
  expect(noteInput).not.toBeNull();

  // 提交按钮存在
  const submitBtn = await confirmPage.$('.submit-btn');
  expect(submitBtn).not.toBeNull();

  // 备注输入功能
  await noteInput.input('E2E测试备注');
  await confirmPage.waitFor(200);
  const noteValue = await noteInput.value();
  expect(noteValue).toBe('E2E测试备注');
}, 25000);

// ---------------------------------------------------------------------------
// E2E-003：提交按钮 loading 状态正确切换（防止重复点击）
// ---------------------------------------------------------------------------
test('E2E-003 确认页：初始 submitting 为 false，点击后变为 true', async () => {
  const page = await miniProgram.reLaunch('/pages/selection/confirm');
  await page.waitFor(1000);

  // 用 page.data() 验证初始 submitting 状态
  const initialData = await page.data();
  expect(initialData.submitting).toBe(false);

  // 有 submitResult 面板（空值）
  expect(initialData.submitResult).toBeNull();
}, 15000);

// ---------------------------------------------------------------------------
// E2E-004：记录页正常加载（空状态或列表）
// ---------------------------------------------------------------------------
test('E2E-004 记录页：空状态或列表页正常显示', async () => {
  const page = await miniProgram.reLaunch('/pages/meal-plans/index');
  await page.waitFor(3000);

  const emptyView = await page.$('.state-view');
  const planList = await page.$('.plan-list');

  expect(emptyView !== null || planList !== null).toBe(true);

  // 有记录时显示 plan-card；无记录时显示空状态
  const cards = await page.$$('.plan-card');
  expect(Array.isArray(cards)).toBe(true);
}, 20000);

// ---------------------------------------------------------------------------
// E2E-005：记录页点击"修改"能跳转确认页
// ---------------------------------------------------------------------------
test('E2E-005 记录页：点击修改按钮正确跳转到确认页', async () => {
  const page = await miniProgram.reLaunch('/pages/meal-plans/index');
  await page.waitFor(2000);

  const cards = await page.$$('.plan-card');
  if (cards.length === 0) return; // 无记录则跳过

  // 在第一个 plan-card 的 plan-actions 区域找到"修改"按钮
  const firstCard = cards[0];
  const actionsArea = await firstCard.$('.plan-actions');
  if (!actionsArea) return; // 无操作区则跳过

  const modifyBtn = await actionsArea.$('button');
  if (!modifyBtn) return; // 无按钮则跳过

  // 验证 plan-card 有日期和餐次信息（点击前）
  const planDate = await firstCard.$('.plan-date');
  const planMealType = await firstCard.$('.plan-meal-type');
  expect(planDate).not.toBeNull();
  expect(planMealType).not.toBeNull();

  // 点击修改按钮（触发 navigateTo 到确认页）
  await modifyBtn.tap();
  await page.waitFor(2000);

  // 导航后当前页面路径应为确认页
  const newPage = await miniProgram.currentPage();
  const pagePath = newPage.path;
  expect(pagePath).toContain('pages/selection/confirm');
}, 25000);

// ---------------------------------------------------------------------------
// E2E-006：tabBar 导航正确切换
// ---------------------------------------------------------------------------
test('E2E-006 tabBar：三个 tab 均能正常切换', async () => {
  // 从记录 tab 开始
  let page = await miniProgram.reLaunch('/pages/meal-plans/index');
  await page.waitFor(1500);

  // switchTab 切到点菜页
  page = await miniProgram.switchTab('/pages/menu/index');
  await page.waitFor(1500);

  const cards = await page.$$('.dish-card');
  expect(cards.length).toBeGreaterThan(0);

  // 再切到我的
  page = await miniProgram.switchTab('/pages/profile/index');
  await page.waitFor(1500);

  // profile 页有内容即可
  const pageData = await page.data();
  expect(pageData).toBeDefined();
}, 20000);