// server/src/routes/sessions.js
// ─────────────────────────────────────────────────────────
// Read routes for Session analytics:
//
// 1. GET /api/sessions — Paginated session list aggregated from events
// 2. GET /api/sessions/:sessionId/events — Chronological event journey
// ─────────────────────────────────────────────────────────

import { Router } from "express";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import {
  paginationQuerySchema,
  sessionIdParamSchema,
} from "../validators/querySchemas.js";

const router = Router();

/**
 * GET /api/sessions
 * Returns paginated sessions aggregated from stored events.
 *
 * Query params:
 *   - page: integer >= 1 (default: 1)
 *   - limit: integer 1–100 (default: 20)
 */
router.get("/", async (req, res, next) => {
  try {
    // 1. Validate pagination parameters
    const parseResult = paginationQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: parseResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const { page, limit } = parseResult.data;

    // 2. Database readiness check
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Database is not available. Please retry later.",
      });
    }

    // 3. Aggregate sessions
    // Sort before grouping ensures $first picks the earliest event (entryPage)
    // and $last picks the latest event (lastEventAt) deterministically.
    const pipeline = [
      {
        $sort: { sessionId: 1, timestamp: 1, _id: 1 },
      },
      {
        $group: {
          _id: "$sessionId",
          firstEventAt: { $first: "$timestamp" },
          lastEventAt: { $last: "$timestamp" },
          entryPage: { $first: "$pageUrl" },
          totalEvents: { $sum: 1 },
          pageViews: {
            $sum: { $cond: [{ $eq: ["$type", "page_view"] }, 1, 0] },
          },
          clicks: {
            $sum: { $cond: [{ $eq: ["$type", "click"] }, 1, 0] },
          },
        },
      },
      {
        $sort: { lastEventAt: -1, _id: 1 },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                sessionId: "$_id",
                firstEventAt: 1,
                lastEventAt: 1,
                totalEvents: 1,
                pageViews: 1,
                clicks: 1,
                entryPage: 1,
              },
            },
          ],
        },
      },
    ];

    const result = await Event.aggregate(pipeline);
    const total = result[0]?.metadata?.[0]?.total ?? 0;
    const data = result[0]?.data ?? [];

    return res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:sessionId/events
 * Returns the chronological event timeline for a single session.
 */
router.get("/:sessionId/events", async (req, res, next) => {
  try {
    // 1. Validate sessionId route parameter
    const parseResult = sessionIdParamSchema.safeParse(req.params.sessionId);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: parseResult.error.issues.map((issue) => ({
          path: "sessionId",
          message: issue.message,
        })),
      });
    }

    const sessionId = parseResult.data;

    // 2. Database readiness check
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Database is not available. Please retry later.",
      });
    }

    // 3. Fetch chronological events for session
    // Uses { sessionId: 1, timestamp: 1 } compound index with _id tie-breaker
    const events = await Event.find({ sessionId })
      .sort({ timestamp: 1, _id: 1 })
      .select({
        _id: 0,
        eventId: 1,
        type: 1,
        pageUrl: 1,
        timestamp: 1,
        viewport: 1,
        pageDimensions: 1,
        click: 1,
      })
      .lean();

    // 4. Return 404 if no events exist for this valid session ID
    if (events.length === 0) {
      return res.status(404).json({
        error: "Not Found",
        message: `No events found for session: ${sessionId}`,
      });
    }

    // 5. Format response without unnecessary internal fields
    const formatted = events.map((ev) => {
      const item = {
        eventId: ev.eventId,
        type: ev.type,
        pageUrl: ev.pageUrl,
        timestamp: ev.timestamp,
        viewport: ev.viewport,
        pageDimensions: ev.pageDimensions,
      };
      if (ev.click) {
        item.click = ev.click;
      }
      return item;
    });

    return res.status(200).json({
      data: formatted,
      meta: {
        count: formatted.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
