/**
 * Jest setup shared by server tests.
 * Database-specific mocks live beside the tests that exercise them.
 */

if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
}
