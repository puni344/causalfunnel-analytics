// server/src/middleware/errorHandler.js
// ─────────────────────────────────────────────────────────
// Centralized Express error handler.
// Catches both application errors and JSON parse errors
// (from express.json()) and returns a consistent JSON shape.
// ─────────────────────────────────────────────────────────

/**
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, _req, res, _next) {
  // Malformed JSON from express.json()
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Bad Request",
      message: "Malformed JSON in request body",
    });
  }

  // Body too large
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Payload Too Large",
      message: "Request body exceeds the size limit",
    });
  }

  // Everything else
  const statusCode = err.statusCode || err.status || 500;
  const statusTitle =
    statusCode === 403
      ? "Forbidden"
      : statusCode === 404
      ? "Not Found"
      : statusCode === 400
      ? "Bad Request"
      : statusCode >= 500
      ? "Internal Server Error"
      : "Error";

  const message =
    process.env.NODE_ENV === "production" && statusCode >= 500
      ? "Internal server error"
      : err.message || statusTitle;

  if (statusCode >= 500) {
    console.error("Unhandled error:", err);
  }

  return res.status(statusCode).json({
    error: statusTitle,
    message,
  });
}
