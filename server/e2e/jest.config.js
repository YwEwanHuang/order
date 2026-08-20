/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/e2e/**/*.test.js'],
  testTimeout: 40000,
  verbose: true,
  // E2E 测试不需要 collectCoverage
  coveragePathIgnorePatterns: ['/node_modules/', '/e2e/'],
};