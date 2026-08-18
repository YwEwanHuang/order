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
  coverageReporters: ['text', 'lcov'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
};
