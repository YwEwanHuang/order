/**
 * 内部接口（仅供 notify-admin 云函数调用）
 * 路径前缀 /internal/notify
 * 认证：X-Notify-Token header，需与云函数环境变量中的 NOTIFY_API_TOKEN 匹配
 */
const express = require('express');
const router = express.Router();
const {
  getNotificationJobs,
  updateNotificationStatus,
  getPool,
  getTableColumns,
} = require('../db/cloudbase');

const TABLE = '`manmanorder`.`notification_jobs`';

/** 检查内部认证 token */
function requireInternalToken(req, res, next) {
  const expected = process.env.NOTIFY_API_TOKEN;
  if (!expected) {
    console.error('[internal] NOTIFY_API_TOKEN not configured');
    return res.status(500).json({ error: 'Internal auth not configured' });
  }
  const actual = req.header('X-Notify-Token');
  if (!actual || actual !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ---------------------------------------------------------------------------
// GET /internal/notify/pending-jobs
// 返回所有待发送的 wechat_subscribe 任务
// ---------------------------------------------------------------------------
router.get('/pending-jobs', requireInternalToken, async (req, res, next) => {
  try {
    const pool = getPool();
    // 按实际列名构建 SELECT，缺列就跳过该字段（避免迁移期 ER_BAD_FIELD_ERROR）
    const [jobCols, subCols, mpCols] = await Promise.all([
      getTableColumns(pool, 'notification_jobs'),
      getTableColumns(pool, 'notification_subscriptions'),
      getTableColumns(pool, 'meal_plans'),
    ]);
    const sel = [];
    if (jobCols.has('id')) sel.push('j.id');
    if (jobCols.has('meal_plan_id')) sel.push('j.meal_plan_id AS mealPlanId');
    if (jobCols.has('meal_plan_version')) sel.push('j.meal_plan_version AS mealPlanVersion');
    if (jobCols.has('recipient_openid')) sel.push('j.recipient_openid AS recipientOpenid');
    if (jobCols.has('channel')) sel.push('j.channel');
    if (jobCols.has('created_at')) sel.push('j.created_at AS createdAt');
    if (subCols.has('template_id')) sel.push('s.template_id AS templateId');
    if (mpCols.has('date')) sel.push('mp.date');
    if (mpCols.has('items')) sel.push('mp.items');
    if (mpCols.has('meal_type')) sel.push('mp.meal_type AS mealType');
    if (mpCols.has('note')) sel.push('mp.note');
    if (sel.length === 0) {
      return res.json({ jobs: [] });
    }
    const joinSub = subCols.has('recipient_openid')
      ? `LEFT JOIN \`manmanorder\`.\`notification_subscriptions\` s
           ON s.recipient_openid = j.recipient_openid`
      : '';
    const joinMp = mpCols.has('id')
      ? `LEFT JOIN \`manmanorder\`.\`meal_plans\` mp
           ON mp.id = j.meal_plan_id`
      : '';
    const [rows] = await pool.execute(
      `SELECT ${sel.join(', ')}
       FROM ${TABLE} j
       ${joinSub}
       ${joinMp}
       WHERE j.status = 'pending'
         AND j.channel = 'wechat_subscribe'
       ORDER BY j.created_at ASC
       LIMIT 100`
    );

    const jobs = rows.map(row => {
      // 从 items JSON 字段提取菜名（结构化 + 短语都给云函数用）
      let dishNames = [];
      let phrase = '您收到一条新的点菜通知';
      let todo = '点击查看详情';
      try {
        const items = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
        if (Array.isArray(items) && items.length > 0) {
          dishNames = items.map(i => i.name || i.dishName || '').filter(Boolean);
          const names = dishNames.slice(0, 3);
          phrase = names.length > 0 ? `收到点菜：${names.join('、')}` : phrase;
          todo = dishNames.length > 3 ? `等${dishNames.length}道菜` : (names.join('、') || '点菜通知');
        }
      } catch (_) {}
      return {
        id: row.id,
        mealPlanId: row.mealPlanId,
        mealPlanVersion: row.mealPlanVersion,
        recipientOpenid: row.recipientOpenid,
        channel: row.channel,
        templateId: row.templateId || '',
        date: row.date || '',
        mealType: row.mealType || '',
        note: row.note || '',
        createdAt: row.createdAt || null,
        dishNames,
        phrase,
        todo,
      };
    });

    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /internal/notify/jobs/:id/status
// 回写通知任务状态
// ---------------------------------------------------------------------------
router.patch('/jobs/:id/status', requireInternalToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, errorCode } = req.body;

    const validStatuses = ['pending', 'sent', 'no_quota', 'rejected', 'failed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'invalid status' } });
    }

    await updateNotificationStatus(id, status, errorCode);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;