/**
 * 统一错误处理中间件
 */
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message, {
    path: req.path,
    method: req.method,
    requestId: req.requestId,
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