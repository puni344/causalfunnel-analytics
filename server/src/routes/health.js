// server/src/routes/health.js
// ─────────────────────────────────────────────────────────
// Health-check endpoint: GET /api/health
// Reports HTTP 200 when the database is connected, or
// HTTP 503 when the database is in an unhealthy state.
// ─────────────────────────────────────────────────────────

import { Router } from "express";
import mongoose from "mongoose";

const router = Router();

// Mongoose readyState codes → human-readable labels
const DB_STATES = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

router.get("/", (_req, res) => {
  const readyState = mongoose.connection.readyState;
  const dbStatus = DB_STATES[readyState] ?? "unknown";
  const isHealthy = readyState === 1;

  const body = {
    status: isHealthy ? "ok" : "degraded",
    db: dbStatus,
  };

  return res.status(isHealthy ? 200 : 503).json(body);
});

export default router;
