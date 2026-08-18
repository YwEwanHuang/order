/**
 * Jest configuration for manmanorder-api (CommonJS)
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
  ],
  coverageDirectory: 'coverage',
  // OneDrive 上生成 lcov 文件会在报告完成后长时间阻塞；CI/本地均保留文本覆盖率。
  coverageReporters: ['text'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
};
