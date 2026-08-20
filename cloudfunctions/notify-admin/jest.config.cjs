// notify-admin 云函数 jest 配置
// 仅在 cloudfunctions/notify-admin/ 下运行；与 server/ 的 jest 配置解耦
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/index.test.js'],
  // wx-server-sdk 在 CI/本地均不存在；用 { virtual: true } 强制 mock
  setupFiles: ['<rootDir>/jest.setup.cjs'],
};
