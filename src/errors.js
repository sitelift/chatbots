class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errorResponse(err) {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message } };
  }
  return { error: { code: 'INTERNAL', message: 'Internal server error.' } };
}

module.exports = { AppError, errorResponse };
