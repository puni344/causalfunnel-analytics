// server/src/routes/clicks.js
// ─────────────────────────────────────────────────────────
// Read route for Clicks analytics on a specific page:
//
// GET /api/clicks?pageUrl=... — Clicks for heatmap rendering
// ─────────────────────────────────────────────────────────

import { Router } from "express";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import { clicksQuerySchema } from "../validators/querySchemas.js";
import { normalizePageUrl } from "../validators/eventSchema.js";

const router = Router();
const MAX_CLICKS = 5000;

/**
 * GET /api/clicks
 * Returns click coordinates, target metadata, and dimensions for a given pageUrl.
 *
 * Query params:
 *   - pageUrl: required HTTP/HTTPS URL
 */
router.get("/", async (req, res, next) => {
  try {
    // 1. Validate query parameters
    const parseResult = clicksQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: parseResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // 2. Canonicalize URL using the exact same policy as ingestion
    const normalizedPageUrl = normalizePageUrl(parseResult.data.pageUrl);

    // 3. Database readiness check
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Database is not available. Please retry later.",
      });
    }

    // 4. Query click events for normalized pageUrl
    // Uses { type: 1, pageUrl: 1 } compound index
    // Query limit is MAX_CLICKS + 1 (5001) to distinguish exactly 5,000 from > 5,000
    // without loading unbounded records into memory.
    const docs = await Event.find({
      type: "click",
      pageUrl: normalizedPageUrl,
    })
      .sort({ timestamp: -1, _id: -1 })
      .limit(MAX_CLICKS + 1)
      .select({
        _id: 0,
        eventId: 1,
        sessionId: 1,
        timestamp: 1,
        click: 1,
        viewport: 1,
        pageDimensions: 1,
      })
      .lean();

    const isTruncated = docs.length > MAX_CLICKS;
    const data = isTruncated ? docs.slice(0, MAX_CLICKS) : docs;

    return res.status(200).json({
      data,
      meta: {
        count: data.length,
        truncated: isTruncated,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
