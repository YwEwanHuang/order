/**
 * @jest/unit middleware/auth
 * Unit tests for auth middleware — requireAuth, requireAdmin
 */
const { requireAuth, requireAdmin } = require('../middleware/auth');

describe('auth middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('requireAuth', () => {
    it('A-001: returns 401 when no openid header', () => {
      mockReq = { headers: {}, requestId: 'req-1' };
      requireAuth(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
          requestId: 'req-1',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('A-002: returns 401 for empty openid', () => {
      mockReq = { headers: { 'x-wx-openid': '' }, requestId: 'req-2' };
      requireAuth(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('A-003: calls next and attaches user object for valid header', () => {
      mockReq = { headers: { 'x-wx-openid': 'test-openid-123' }, requestId: 'req-3' };
      requireAuth(mockReq, mockRes, mockNext);
      expect(mockReq.user).toEqual({ openid: 'test-openid-123', role: 'user' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('A-004: X-WX-OPENID is case-insensitive', () => {
      mockReq = { headers: { 'x-wx-openid': 'user-abc' }, requestId: 'req-4' };
      requireAuth(mockReq, mockRes, mockNext);
      expect(mockReq.user.openid).toBe('user-abc');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    beforeEach(() => {
      process.env.ADMIN_OPENIDS = 'admin1,admin2,admin3';
    });

    afterEach(() => {
      delete process.env.ADMIN_OPENIDS;
    });

    it('A-005: returns 403 when not an admin', () => {
      // Simulate a user who passed requireAuth (role=user)
      mockReq = { user: { openid: 'regular-user', role: 'user' }, requestId: 'req-5' };
      requireAdmin(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'FORBIDDEN' }),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('A-006: calls next when user is admin', () => {
      // Simulate admin who passed requireAuth
      mockReq = { user: { openid: 'admin2', role: 'admin' }, requestId: 'req-6' };
      requireAdmin(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('A-007: returns 403 when ADMIN_OPENIDS is not set', () => {
      delete process.env.ADMIN_OPENIDS;
      mockReq = { user: { openid: 'some-openid', role: 'user' }, requestId: 'req-7' };
      requireAdmin(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});