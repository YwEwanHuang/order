/**
 * notify-admin 云函数
 *
 * 职责：轮询 pending 状态的微信订阅消息通知，调用微信 API 发送，
 *       然后通过 Express 内部接口回写状态。
 *
 * 调用方式：由微信云开发定时触发（cron）或管理员手动触发。
 * 环境变量（云函数配置）：
 *   NOTIFY_API_URL   — Express 内部接口根地址，如 https://express-xxx.sh.run.tcloudbase.com
 *   NOTIFY_API_TOKEN — 与 Express 内部接口共享的访问令牌
 *
 * 注意：本函数只处理 channel = 'wechat_subscribe' 且 status = 'pending' 的任务。
 *       同一 mealPlanId + mealPlanVersion + channel 不重复发送（有唯一索引兜底）。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** 从环境变量读取配置（云函数平台注入） */
function getConfig() {
  const apiUrl = process.env.NOTIFY_API_URL;
  const apiToken = process.env.NOTIFY_API_TOKEN;
  if (!apiUrl || !apiToken) {
    throw new Error('NOTIFY_API_URL and NOTIFY_API_TOKEN must be configured');
  }
  return { apiUrl, apiToken };
}

/**
 * 向 Express 内部接口请求 pending 任务列表
 */
async function fetchPendingJobs() {
  const { apiUrl, apiToken } = getConfig();
  const res = await cloud.cloud.callContainer({
    config: { env: cloud.DYNAMIC_CURRENT_ENV },
    path: '/internal/notify/pending-jobs',
    header: {
      'Content-Type': 'application/json',
      'X-Notify-Token': apiToken,
    },
    method: 'GET',
  });
  // callContainer 返回 { data } 结构
  const body = res.data;
  if (!body || !Array.isArray(body.jobs)) {
    console.warn('[notify-admin] unexpected response from pending-jobs', res.data);
    return [];
  }
  return body.jobs;
}

/**
 * 向 Express 内部接口回写任务状态
 */
async function reportResult(jobId, status, errorCode) {
  const { apiUrl, apiToken } = getConfig();
  await cloud.cloud.callContainer({
    config: { env: cloud.DYNAMIC_CURRENT_ENV },
    path: '/internal/notify/jobs/' + jobId + '/status',
    header: {
      'Content-Type': 'application/json',
      'X-Notify-Token': apiToken,
    },
    method: 'PATCH',
    data: { status, errorCode },
  });
}

/**
 * 发送一条订阅消息
 */
async function sendSubscribeMessage(job) {
  const { recipientOpenid, templateId } = job;
  if (!templateId) {
    throw new Error('missing templateId for wechat_subscribe job');
  }
  const phrase = job.phrase || '您收到一条新的点菜通知';
  const todo = job.todo || '点击查看详情';

  const result = await cloud.openapi.subscribeMessage.send({
    touser: recipientOpenid,
    templateId,
    page: 'pages/meal-plans/index',
    data: {
      phrase1: { value: phrase },
      date2: { value: job.date || '' },
      thing3: { value: todo },
    },
    miniprogramState: '正式版',
  });
  return result;
}

exports.main = async (event, context) => {
  // 允许手动触发（event.trigger === 'manual'）和定时触发
  const results = [];
  let processedCount = 0;
  let successCount = 0;
  let failCount = 0;

  try {
    const jobs = await fetchPendingJobs();
    console.log(`[notify-admin] fetched ${jobs.length} pending jobs`);

    for (const job of jobs) {
      processedCount++;
      let status = 'sent';
      let errorCode = null;

      try {
        await sendSubscribeMessage(job);
      } catch (e) {
        // 微信返回的错误码映射到语义化状态
        const wxErrCode = e?.errcode || e?.code;
        if (wxErrCode === 43101) {
          // 用户拒绝订阅
          status = 'rejected';
          errorCode = String(wxErrCode);
        } else if (wxErrCode === 41030 || wxErrCode === 40014) {
          // template_id 无效或已删除
          status = 'failed';
          errorCode = String(wxErrCode);
        } else {
          // 其他错误，标记为失败但可重试
          status = 'failed';
          errorCode = String(wxErrCode ?? 'UNKNOWN');
        }
        console.warn(`[notify-admin] job ${job.id} send failed:`, e?.errmsg || e?.message);
      }

      try {
        await reportResult(job.id, status, errorCode);
      } catch (e) {
        // 回写失败不影响发送结果，打印日志
        console.error(`[notify-admin] reportResult failed for job ${job.id}:`, e);
      }

      if (status === 'sent') successCount++;
      else failCount++;

      results.push({ jobId: job.id, status, errorCode });
    }
  } catch (e) {
    console.error('[notify-admin] fatal error:', e);
    return {
      success: false,
      error: e.message,
      processedCount,
      successCount,
      failCount,
      results,
    };
  }

  return {
    success: true,
    processedCount,
    successCount,
    failCount,
    results,
  };
};