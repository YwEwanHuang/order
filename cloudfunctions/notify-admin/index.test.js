/**
 * notify-admin 云函数单元测试
 * 覆盖：
 *   1. 纯函数 _internals（truncate / formatLocalDateTime / mapWxErrorCode /
 *      mealTypeDefaultTime / buildSubscribeData）
 *   2. exports.main 端到端流程（mocked wx-server-sdk + cloud.callContainer）
 *
 * 设计要点：
 *   - 不使用 jest.resetModules()：index.js 顶层只读一次 wx-server-sdk，
 *     后续 main() 通过 process.env 懒读环境变量，jest.clearAllMocks()
 *     已足够隔离每个用例。
 *   - wx-server-sdk 在 jest.setup.cjs 里以 virtual mock 形式全局注册。
 */

const index = require('./index.js');
const wxServerSdk = require('wx-server-sdk');
const { _internals, main } = index;

beforeEach(() => {
  // resetAllMocks 而非 clearAllMocks：后者不清掉 mockResolvedValueOnce 队列，
  // 会导致上一个用例未消费完的响应泄漏到下一个用例
  jest.resetAllMocks();
  // 清理本用例可能改动的环境变量
  delete process.env.SUBSCRIBE_ENABLED;
  delete process.env.SUBSCRIBE_TEMPLATE_ID;
  delete process.env.NOTIFY_API_URL;
  delete process.env.NOTIFY_API_TOKEN;
});

describe('truncate', () => {
  it('returns string unchanged when within maxLen', () => {
    expect(_internals.truncate('hello', 10)).toBe('hello');
  });

  it('truncates to maxLen when longer', () => {
    expect(_internals.truncate('hello world', 5)).toBe('hello');
  });

  it('handles null/undefined safely', () => {
    expect(_internals.truncate(null, 5)).toBe('');
    expect(_internals.truncate(undefined, 5)).toBe('');
  });
});

describe('formatLocalDateTime', () => {
  it('formats timestamp as yyyy-MM-dd HH:mm', () => {
    const ts = new Date(2026, 7, 18, 17, 30, 0).getTime();
    expect(_internals.formatLocalDateTime(ts)).toBe('2026-08-18 17:30');
  });

  it('returns empty string for falsy input', () => {
    expect(_internals.formatLocalDateTime(null)).toBe('');
    expect(_internals.formatLocalDateTime(0)).toBe('');
  });
});

describe('mapWxErrorCode', () => {
  it.each([
    ['43101', 'no_quota'],
    ['43104', 'rejected'],
    ['40014', 'failed'],
    ['43105', 'failed'],
    ['41030', 'failed'],
    ['45009', 'failed'],
    ['99999', 'failed'],
  ])('maps wxErrCode %s to status %s', (code, expected) => {
    expect(_internals.mapWxErrorCode(code)).toBe(expected);
  });
});

describe('mealTypeDefaultTime', () => {
  it.each([
    ['breakfast', '08:00'],
    ['lunch', '12:00'],
    ['dinner', '18:00'],
    ['snack', ''],
    [undefined, ''],
  ])('maps mealType %s to time %s', (mealType, expected) => {
    expect(_internals.mealTypeDefaultTime(mealType)).toBe(expected);
  });
});

describe('ensureHttpOk', () => {
  it('returns res unchanged on 2xx', () => {
    const res = { statusCode: 200, data: { ok: true } };
    expect(_internals.ensureHttpOk(res, 'op')).toBe(res);
  });

  it.each([199, 300, 401, 404, 500, 502])('throws on statusCode %s', (code) => {
    expect(() => _internals.ensureHttpOk({ statusCode: code }, 'fetchPendingJobs'))
      .toThrow(`fetchPendingJobs HTTP ${code}`);
  });

  it('throws when res is null/undefined or statusCode missing', () => {
    expect(() => _internals.ensureHttpOk(null, 'op')).toThrow('op HTTP undefined');
    expect(() => _internals.ensureHttpOk({}, 'op')).toThrow('op HTTP undefined');
  });
});

describe('buildSubscribeData', () => {
  it('produces correct field shape for typical job', () => {
    const job = {
      dishNames: ['鸡蛋西红柿', '土豆炖豆角'],
      date: '2026-08-18',
      mealType: 'dinner',
      createdAt: new Date(2026, 7, 18, 17, 30, 0).getTime(),
      note: '少盐',
    };
    expect(_internals.buildSubscribeData(job)).toEqual({
      thing11: { value: '鸡蛋西红柿、土豆炖豆角' },
      time26:  { value: '2026-08-18 18:00' },
      time36:  { value: '2026-08-18 17:30' },
      thing4:  { value: '少盐' },
    });
  });

  it('uses "点菜通知" fallback when no dishNames', () => {
    const job = { date: '2026-08-18', mealType: 'lunch', createdAt: 1, note: '' };
    const data = _internals.buildSubscribeData(job);
    expect(data.thing11.value).toBe('点菜通知');
    expect(data.thing4.value).toBe('无');
  });

  it('truncates long dishNames to 20 chars', () => {
    const long = '红烧排骨、可乐鸡翅、麻婆豆腐、蒸蛋羹、蒜蓉西兰花';
    const job = { dishNames: [long], date: '2026-08-18', mealType: 'dinner', createdAt: 1, note: '' };
    const data = _internals.buildSubscribeData(job);
    expect(data.thing11.value).toHaveLength(20);
  });

  it('emits empty reserveTime when date is missing', () => {
    const job = { dishNames: ['A'], mealType: 'lunch', createdAt: 1, note: '' };
    const data = _internals.buildSubscribeData(job);
    expect(data.time26.value).toBe('');
  });
});

describe('exports.main', () => {
  it('early-returns when SUBSCRIBE_ENABLED != "true"', async () => {
    process.env.NOTIFY_API_URL = 'https://example.com';
    process.env.NOTIFY_API_TOKEN = 'tok';
    process.env.SUBSCRIBE_TEMPLATE_ID = 'tmpl';
    // 故意不设 SUBSCRIBE_ENABLED
    const result = await main();
    expect(result).toEqual({ skipped: true, reason: 'SUBSCRIBE_DISABLED' });
    expect(wxServerSdk.callContainer).not.toHaveBeenCalled();
  });

  it('processes pending jobs: fetch → send → report', async () => {
    process.env.SUBSCRIBE_ENABLED = 'true';
    process.env.NOTIFY_API_URL = 'https://example.com';
    process.env.NOTIFY_API_TOKEN = 'tok';
    process.env.SUBSCRIBE_TEMPLATE_ID = 'tmpl';

    const jobs = [
      { id: 'job-1', recipientOpenid: 'oA', templateId: 'tmpl', date: '2026-08-18', mealType: 'dinner', createdAt: 1, note: 'x', dishNames: ['A'] },
      { id: 'job-2', recipientOpenid: 'oB', templateId: 'tmpl', date: '2026-08-19', mealType: 'lunch', createdAt: 1, note: '', dishNames: ['B'] },
    ];
    // 第一次 callContainer 是 fetchPendingJobs（GET），接下来两次是 PATCH 回调
    wxServerSdk.callContainer
      .mockResolvedValueOnce({ statusCode: 200, data: { jobs } })
      .mockResolvedValueOnce({ statusCode: 200, data: { ok: true } })
      .mockResolvedValueOnce({ statusCode: 200, data: { ok: true } });
    wxServerSdk.openapi.subscribeMessage.send.mockResolvedValue({ errcode: 0 });

    const result = await main();

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failCount).toBe(0);
    expect(wxServerSdk.openapi.subscribeMessage.send).toHaveBeenCalledTimes(2);
    expect(wxServerSdk.callContainer).toHaveBeenCalledTimes(3);
  });

  it('marks job no_quota and reports failure on wxErrCode 43101', async () => {
    process.env.SUBSCRIBE_ENABLED = 'true';
    process.env.NOTIFY_API_URL = 'https://example.com';
    process.env.NOTIFY_API_TOKEN = 'tok';
    process.env.SUBSCRIBE_TEMPLATE_ID = 'tmpl';

    wxServerSdk.callContainer
      .mockResolvedValueOnce({
        statusCode: 200,
        data: { jobs: [
          { id: 'job-3', recipientOpenid: 'oC', templateId: 'tmpl', date: '2026-08-18', mealType: 'dinner', createdAt: 1, note: '', dishNames: ['X'] },
        ] },
      })
      .mockResolvedValueOnce({ statusCode: 200, data: { ok: true } });
    wxServerSdk.openapi.subscribeMessage.send.mockRejectedValue({ errcode: 43101, errmsg: 'no quota' });

    const result = await main();

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.results[0]).toEqual({ jobId: 'job-3', status: 'no_quota', errorCode: '43101' });
  });

  it('returns failure when fetchPendingJobs throws', async () => {
    process.env.SUBSCRIBE_ENABLED = 'true';
    process.env.NOTIFY_API_URL = 'https://example.com';
    process.env.NOTIFY_API_TOKEN = 'tok';
    process.env.SUBSCRIBE_TEMPLATE_ID = 'tmpl';
    wxServerSdk.callContainer.mockRejectedValueOnce(new Error('network down'));

    const result = await main();
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
    expect(result.processedCount).toBe(0);
  });

  it('returns failure when fetchPendingJobs returns non-2xx (e.g. 401 token mismatch)', async () => {
    process.env.SUBSCRIBE_ENABLED = 'true';
    process.env.NOTIFY_API_URL = 'https://example.com';
    process.env.NOTIFY_API_TOKEN = 'tok';
    process.env.SUBSCRIBE_TEMPLATE_ID = 'tmpl';
    // 关键：cloud.callContainer 在 HTTP 401 时 resolve 而非 reject —— 模拟这一行为
    wxServerSdk.callContainer.mockResolvedValueOnce({ statusCode: 401, data: { error: 'Unauthorized' } });

    const result = await main();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fetchPendingJobs HTTP 401/);
    expect(result.processedCount).toBe(0);
    expect(wxServerSdk.openapi.subscribeMessage.send).not.toHaveBeenCalled();
  });

  it('counts message as sent when subscribeMessage succeeds but reportResult returns 500', async () => {
    process.env.SUBSCRIBE_ENABLED = 'true';
    process.env.NOTIFY_API_URL = 'https://example.com';
    process.env.NOTIFY_API_TOKEN = 'tok';
    process.env.SUBSCRIBE_TEMPLATE_ID = 'tmpl';

    wxServerSdk.callContainer
      .mockResolvedValueOnce({ statusCode: 200, data: {
        jobs: [{ id: 'job-4', recipientOpenid: 'oD', templateId: 'tmpl', date: '2026-08-18', mealType: 'dinner', createdAt: 1, note: '', dishNames: ['Y'] }],
      } })
      // reportResult 返回 500 —— 消息已成功发送但 DB 状态写不进
      .mockResolvedValueOnce({ statusCode: 500, data: { error: 'db down' } });
    wxServerSdk.openapi.subscribeMessage.send.mockResolvedValue({ errcode: 0 });

    const result = await main();
    // 关键：success 计数基于 subscribeMessage.send 是否成功，而非 reportResult
    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);
  });
});
