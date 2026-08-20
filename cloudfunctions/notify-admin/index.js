/**
 * notify-admin 云函数（canonical）
 *
 * 职责：
 *   1. 调用 Express 内部接口 GET /internal/notify/pending-jobs
 *      拉取 channel='wechat_subscribe' AND status='pending' 的任务
 *   2. 通过 cloud.openapi.subscribeMessage.send 发送订阅消息
 *   3. 通过 PATCH /internal/notify/jobs/:id/status 回写状态
 *
 * 触发：定时触发器（云函数控制台配置 cron：每分钟一次，详见 config.json）
 *
 * 环境变量：
 *   NOTIFY_API_URL        — Express 内部接口根 URL（如 https://express-xxx.sh.run.tcloudbase.com）
 *   NOTIFY_API_TOKEN      — 与 Express 共享的访问令牌
 *   SUBSCRIBE_TEMPLATE_ID — 微信订阅消息模板 ID
 *   SUBSCRIBE_ENABLED     — 'true' 才会执行；其他值直接跳过
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function getConfig() {
  const apiUrl = process.env.NOTIFY_API_URL;
  const apiToken = process.env.NOTIFY_API_TOKEN;
  if (!apiUrl) throw new Error('NOTIFY_API_URL is required');
  if (!apiToken) throw new Error('NOTIFY_API_TOKEN is required');
  return { apiUrl, apiToken };
}

function truncate(s, maxLen) {
  const v = String(s == null ? '' : s);
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function formatLocalDateTime(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mealTypeDefaultTime(mealType) {
  switch (mealType) {
    case 'breakfast': return '08:00';
    case 'lunch':     return '12:00';
    case 'dinner':    return '18:00';
    default:          return '';
  }
}

// cloud.callContainer 在 HTTP 非 2xx 时不抛错；显式检查 statusCode，
// 否则 401/400/500 会被静默吞掉，DB 状态永远写不进去，运维也无日志可见。
function ensureHttpOk(res, op) {
  const code = (res && typeof res.statusCode === 'number') ? res.statusCode : null;
  if (code === null || code < 200 || code >= 300) {
    throw new Error(`[notify-admin] ${op} HTTP ${code === null ? 'undefined' : code}`);
  }
  return res;
}

// 微信订阅消息错误码 → 任务状态
function mapWxErrorCode(wxErrCode) {
  switch (String(wxErrCode)) {
    case '43101': return 'no_quota';  // 用户未订阅 / 长期订阅额度用尽
    case '43104': return 'rejected';  // 用户拒绝订阅
    case '40014': return 'failed';    // template_id 无效
    case '43105': return 'failed';    // 模板被封禁
    case '41030': return 'failed';    // 跳转页面路径错误
    case '45009': return 'failed';    // 调用频次超限
    default:      return 'failed';
  }
}

function buildSubscribeData(job) {
  const names = Array.isArray(job.dishNames) ? job.dishNames : [];
  const orderInfo = names.length > 0 ? truncate(names.join('、'), 20) : '点菜通知';
  const time = mealTypeDefaultTime(job.mealType);
  const reserveTime = job.date ? (time ? `${job.date} ${time}` : job.date) : '';
  const orderTime = formatLocalDateTime(job.createdAt || Date.now());
  const note = truncate(job.note || '', 20) || '无';
  return {
    thing11: { value: orderInfo },
    time26:  { value: reserveTime },
    time36:  { value: orderTime },
    thing4:  { value: note },
  };
}

async function fetchPendingJobs() {
  const { apiUrl, apiToken } = getConfig();
  const res = await cloud.callContainer({
    config: { env: cloud.DYNAMIC_CURRENT_ENV },
    path: new URL('/internal/notify/pending-jobs', apiUrl).pathname,
    header: {
      'Content-Type': 'application/json',
      'X-Notify-Token': apiToken,
    },
    method: 'GET',
  });
  ensureHttpOk(res, 'fetchPendingJobs');
  const body = res && res.data;
  if (!body || !Array.isArray(body.jobs)) {
    console.warn('[notify-admin] unexpected response from pending-jobs', body);
    return [];
  }
  return body.jobs;
}

async function reportResult(jobId, status, errorCode) {
  const { apiUrl, apiToken } = getConfig();
  const res = await cloud.callContainer({
    config: { env: cloud.DYNAMIC_CURRENT_ENV },
    path: new URL(`/internal/notify/jobs/${jobId}/status`, apiUrl).pathname,
    header: {
      'Content-Type': 'application/json',
      'X-Notify-Token': apiToken,
    },
    method: 'PATCH',
    data: { status, errorCode },
  });
  ensureHttpOk(res, `reportResult(${jobId})`);
}

async function sendOneSubscribe(job) {
  if (!job.recipientOpenid) throw new Error('missing recipientOpenid');
  const templateId = job.templateId || process.env.SUBSCRIBE_TEMPLATE_ID;
  if (!templateId) throw new Error('missing templateId');
  await cloud.openapi.subscribeMessage.send({
    touser: job.recipientOpenid,
    templateId,
    page: 'pages/meal-plans/index',
    data: buildSubscribeData(job),
    miniprogramState: 'formal',
  });
}

exports.main = async () => {
  if (process.env.SUBSCRIBE_ENABLED !== 'true') {
    console.log('[notify-admin] SUBSCRIBE_ENABLED != true, skip');
    return { skipped: true, reason: 'SUBSCRIBE_DISABLED' };
  }

  let processedCount = 0;
  let successCount = 0;
  let failCount = 0;
  const results = [];

  let jobs;
  try {
    jobs = await fetchPendingJobs();
  } catch (e) {
    console.error('[notify-admin] fetchPendingJobs failed:', e);
    return { success: false, error: e.message, processedCount: 0, successCount: 0, failCount: 0, results: [] };
  }

  console.log(`[notify-admin] fetched ${jobs.length} pending jobs`);

  for (const job of jobs) {
    processedCount++;
    let status = 'sent';
    let errorCode = null;
    try {
      await sendOneSubscribe(job);
    } catch (e) {
      const code = e && (e.errcode || e.code);
      status = mapWxErrorCode(code);
      errorCode = code != null ? String(code) : 'UNKNOWN';
      console.warn(`[notify-admin] job ${job.id} send failed:`, e && (e.errmsg || e.message));
    }
    try {
      await reportResult(job.id, status, errorCode);
    } catch (e) {
      console.error(`[notify-admin] reportResult failed for job ${job.id}:`, e);
    }
    if (status === 'sent') successCount++; else failCount++;
    results.push({ jobId: job.id, status, errorCode });
  }

  return { success: true, processedCount, successCount, failCount, results };
};

// 暴露给单元测试
exports._internals = {
  buildSubscribeData,
  formatLocalDateTime,
  mapWxErrorCode,
  truncate,
  mealTypeDefaultTime,
  ensureHttpOk,
};