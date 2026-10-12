// server/src/middleware/notFound.js
// ─────────────────────────────────────────────────────────
// Catch-all for routes that don't match any defined handler.
// Returns a JSON 404 so API consumers always get structured
// responses (instead of an HTML "Cannot GET …" page).
// ─────────────────────────────────────────────────────────

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function notFound(req, res, _next) {
  res.status(404).json({
    error: "Not Found",
    message: `No route matches ${req.method} ${req.originalUrl}`,
  });
}
