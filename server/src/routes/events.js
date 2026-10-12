// server/src/routes/events.js
// ─────────────────────────────────────────────────────────
// POST /api/events — accept and store analytics events.
//
// Flow:
//   1. Validate the JSON body with Zod.
//   2. Normalize the page URL.
//   3. Check that MongoDB is available.
//   4. Convert the ISO timestamp to a JS Date.
//   5. Stamp receivedAt with the current server time.
//   6. Save the event document.
//   7. Handle duplicate eventId gracefully.
// ─────────────────────────────────────────────────────────

import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import Event from "../models/Event.js";
import {
  eventRequestSchema,
  normalizePageUrl,
} from "../validators/eventSchema.js";

const router = Router();

// MongoDB duplicate-key error code
const DUPLICATE_KEY_CODE = 11000;

router.post("/", async (req, res) => {
  // ── 1. Validate ──────────────────────────────────────
  const result = eventRequestSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Validation Error",
      details: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const validated = result.data;

  // ── 2. Normalize URL ────────────────────────────────
  const pageUrl = normalizePageUrl(validated.pageUrl);

  // ── 3. Check DB availability ─────────────────────────
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Database is not available. Please retry later.",
    });
  }

  // ── 4 + 5. Build the document ───────────────────────
  const doc = {
    eventId: validated.eventId,
    sessionId: validated.sessionId,
    type: validated.type,
    pageUrl,
    timestamp: new Date(validated.timestamp),
    receivedAt: new Date(),
    viewport: validated.viewport,
    pageDimensions: validated.pageDimensions,
  };

  // Only attach click data for click events
  if (validated.type === "click" && validated.click) {
    doc.click = validated.click;
  }

  // ── 6. Persist ──────────────────────────────────────
  try {
    await Event.create(doc);

    return res.status(201).json({
      data: {
        eventId: validated.eventId,
        duplicate: false,
      },
    });
  } catch (err) {
    // ── 7. Duplicate handling ─────────────────────────
    // When the unique index on eventId catches a retry,
    // we return 200 instead of 500 — this is expected,
    // not an error.
    if (err.code === DUPLICATE_KEY_CODE) {
      return res.status(200).json({
        data: {
          eventId: validated.eventId,
          duplicate: true,
        },
      });
    }

    // Genuine server error — let the centralized handler
    // take care of logging and safe response.
    throw err;
  }
});

export default router;
