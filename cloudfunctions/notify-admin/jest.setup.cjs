// 全局 mock wx-server-sdk，避免 require 真实 peer 包
// 各用例在 beforeEach 通过 jest.resetModules() + 重新 require index.js 拿到独立状态
jest.mock('wx-server-sdk', () => {
  return {
    __esModule: false,
    DYNAMIC_CURRENT_ENV: '__DYNAMIC__',
    init: jest.fn(),
    callContainer: jest.fn(),
    openapi: {
      subscribeMessage: {
        send: jest.fn(),
      },
    },
  };
}, { virtual: true });
