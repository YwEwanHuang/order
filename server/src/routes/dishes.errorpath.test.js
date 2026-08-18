/**
 * @jest/integration
 * 真路径回归测试：复现线上 GET /api/v1/dishes → 500 的链路。
 *
 * 不再用"mock SDK 永远回 []"假装集成已验证 —— 本测试让 getActiveDishes
 * 抛出一个形状与 @cloudbase/node-sdk@3.18.5 一致的真实错误
 * （err.name='Error', err.code='INVALID_PARAM', message 含
 *  'missing secretId or secretKey'），让路由 → errorHandler 链路真的跑一遍。
 *
 * 断言三件事：
 *  1. 客户端响应是 500 + 通用 envelope，不泄露 err.message / err.code；
 *  2. 服务端 console.error 输出包含 errName / errCode / requestId（可观测性）；
 *  3. 响应不含 openid / 请求体 / Authorization 等敏感字段。
 */
const request = require('supertest');
const express = require('express');

// 关键：只 mock cloudbase 模块的 getActiveDishes，保留真实 errorHandler + auth
jest.mock('../db/cloudbase', () => {
  const realShapeErr = new Error(
    'missing secretId or secretKey of tencent cloud, please set secretId and secretKey in config'
  );
  realShapeErr.name = 'Error';
  realShapeErr.code = 'INVALID_PARAM';
  return {
    getActiveDishes: jest.fn(async () => { throw realShapeErr; }),
    getAllDishes: jest.fn(),
    getDishById: jest.fn(),
    createDish: jest.fn(),
    updateDish: jest.fn(),
    getMealPlansByUser: jest.fn(),
    getMealPlanById: jest.fn(),
    upsertMealPlan: jest.fn(),
    generateMealPlanId: jest.fn(),
    createNotificationJob: jest.fn(),
    getNotificationJobs: jest.fn(),
    updateNotificationStatus: jest.fn(),
    getSubscription: jest.fn(),
    upsertSubscription: jest.fn(),
    consumeQuota: jest.fn(),
  };
});

const { requestId } = require('../middleware/requestId');
const { errorHandler } = require('../middleware/errorHandler');
const dishesRouter = require('../routes/dishes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use('/api/v1/dishes', dishesRouter);
  app.use(errorHandler);
  return app;
}

let errorSpy;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('GET /api/v1/dishes — 真路径 500 回归', () => {
  it('当底层 SDK 抛 INVALID_PARAM 时返回 500 + 通用 envelope', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/dishes')
      .set('X-WX-OPENID', 'user-123');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
      requestId: expect.any(String),
    });
    // 不泄露内部细节
    expect(res.body.error.message).not.toMatch(/secretId|secretKey|INVALID_PARAM/);
    expect(JSON.stringify(res.body)).not.toMatch(/user-123/);
  });

  it('服务端日志记录 errName + errCode + requestId，不写 openid', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/dishes?category=hot')
      .set('X-WX-OPENID', 'user-123');
    expect(res.status).toBe(500);

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls[0][1];
    expect(logged).toMatchObject({
      method: 'GET',
      path: '/api/v1/dishes',
      errName: 'Error',
      errCode: 'INVALID_PARAM',
      errMessage: expect.stringMatching(/missing secretId or secretKey/),
    });
    expect(logged.requestId).toBe(res.body.requestId);
    // 不写敏感字段
    expect(JSON.stringify(logged)).not.toMatch(/user-123/);
    expect(JSON.stringify(logged)).not.toMatch(/X-WX-OPENID|Authorization|Cookie/);
  });

  it('X-Request-Id 透传：自定义 requestId 在响应头与日志中出现', async () => {
    const app = buildApp();
    const customId = 'req-fixed-9999';
    const res = await request(app)
      .get('/api/v1/dishes')
      .set('X-WX-OPENID', 'user-123')
      .set('X-Request-Id', customId);

    expect(res.status).toBe(500);
    expect(res.headers['x-request-id']).toBe(customId);
    expect(res.body.requestId).toBe(customId);
    const logged = errorSpy.mock.calls[0][1];
    expect(logged.requestId).toBe(customId);
  });
});