/**
 * 统一错误处理中间件
 *
 * 服务端日志仅记录诊断必要字段（requestId/path/method/err.name/err.code/err.message/
 * 短 stack），绝不打印 openid / 请求体 / Cookie / Authorization / token /
 * secretId / secretKey 等敏感字段。客户端响应保持通用 INTERNAL_ERROR，
 * 不泄露内部错误细节。
 */
function errorHandler(err, req, res, next) {
  // 仅取 stack 前 3 行；截断避免日志爆炸；移除可能含文件路径/凭据的尾部
  const stackSnippet = typeof err.stack === 'string'
    ? err.stack.split('\n').slice(0, 3).join('\n')
    : undefined;

  // err 字段里可能混进 requestId/headers 等敏感信息，仅取白名单
  const safeErrName = typeof err.name === 'string' ? err.name : 'Error';
  const safeErrCode = typeof err.code === 'string' ? err.code : undefined;

  console.error('[Error]', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    errName: safeErrName,
    errCode: safeErrCode,
    errMessage: err.message,
    stackSnippet,
  });

  // 已知业务错误
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
      requestId: req.requestId,
    });
  }

  // 输入校验错误
  if (err.array && typeof err.array === 'function') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: '输入校验失败', fields: err.array() },
      requestId: req.requestId,
    });
  }

  // 未知错误
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
    requestId: req.requestId,
  });
}

module.exports = { errorHandler };