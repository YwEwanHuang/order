/**
 * Jest setup — mock @cloudbase/node-sdk before any test runs.
 * This allows the server modules to be required without real credentials.
 */

// Build a chainable query mock that supports:
//   collection(name).where(...).orderBy(...).orderBy(...).limit(N).get()
//   collection(name).doc(id).get()
//   collection(name).add(...)
const makeQueryMock = () => {
  const queryMock = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ data: [] }),
    skip: jest.fn().mockReturnThis(),
    field: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue({ stats: { updated: 1 } }),
    remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } }),
  };
  return queryMock;
};

const makeDocMock = () => ({
  get: jest.fn().mockResolvedValue({ data: [] }),
  update: jest.fn().mockResolvedValue({ stats: { updated: 1 } }),
  remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } }),
});

const mockDb = {
  collection: jest.fn((name) => {
    const q = makeQueryMock();
    q.doc = jest.fn((id) => makeDocMock());
    q.add = jest.fn().mockResolvedValue({ id: 'mock-id-' + Math.random() });
    return q;
  }),
  createIndex: jest.fn().mockResolvedValue({}),
  Geo: {
    Point: jest.fn(),
  },
  command: {
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    and: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    inc: jest.fn().mockReturnThis(),
  },
};

const mockApp = {
  database: jest.fn(() => mockDb),
  auth: jest.fn(() => ({
    getEndUserInfo: jest.fn(),
  })),
};

jest.mock('@cloudbase/node-sdk', () => ({
  init: jest.fn(() => mockApp),
}));

// Also make the mock available globally so tests can inspect calls
global.__cloudbaseMockDb = mockDb;
global.__cloudbaseMockApp = mockApp;

// Silence console logs during tests
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
}