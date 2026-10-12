// server/src/routes/pages.js
// ─────────────────────────────────────────────────────────
// Read route for Tracked Pages analytics:
//
// GET /api/pages — Aggregated list of pages with pageViews & clicks
// ─────────────────────────────────────────────────────────

import { Router } from "express";
import mongoose from "mongoose";
import Event from "../models/Event.js";

const router = Router();

/**
 * GET /api/pages
 * Returns all tracked pages with aggregate pageViews and clicks.
 */
router.get("/", async (_req, res, next) => {
  try {
    // 1. Database readiness check
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Database is not available. Please retry later.",
      });
    }

    // 2. Aggregate pages
    // Groups events by pageUrl and counts pageViews and clicks
    const pipeline = [
      {
        $group: {
          _id: "$pageUrl",
          pageViews: {
            $sum: { $cond: [{ $eq: ["$type", "page_view"] }, 1, 0] },
          },
          clicks: {
            $sum: { $cond: [{ $eq: ["$type", "click"] }, 1, 0] },
          },
        },
      },
      {
        $sort: { pageViews: -1, clicks: -1, _id: 1 },
      },
      {
        $project: {
          _id: 0,
          pageUrl: "$_id",
          pageViews: 1,
          clicks: 1,
        },
      },
    ];

    const data = await Event.aggregate(pipeline);

    return res.status(200).json({
      data,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
