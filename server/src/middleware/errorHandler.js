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
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  console.error("Unhandled error:", err);

  return res.status(statusCode).json({
    error: "Internal Server Error",
    message,
  });
}
