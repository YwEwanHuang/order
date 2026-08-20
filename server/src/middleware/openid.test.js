const openid = require('./openid');

function run(headers) {
  return new Promise((resolve) => {
    const req = { headers };
    const res = {};
    openid(req, res, () => resolve(req));
  });
}

describe('openid middleware', () => {
  test('有 X-WX-OPENID 头 → req.openid 设置', async () => {
    const req = await run({ 'x-wx-openid': 'oABCD-1234' });
    expect(req.openid).toBe('oABCD-1234');
  });

  test('无 X-WX-OPENID 头 → req.openid = null，不抛错', async () => {
    const req = await run({});
    expect(req.openid).toBeNull();
  });
});