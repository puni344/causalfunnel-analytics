// server/src/app.js
// ─────────────────────────────────────────────────────────
// Creates and configures the Express application.
// This file does NOT start the server or connect to the
// database — that responsibility belongs to index.js.
// Keeping them separate makes the app easier to test.
// ─────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import env from "./config/env.js";
import healthRouter from "./routes/health.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// ── CORS ──────────────────────────────────────────────────
// Only the origins listed in CORS_ORIGINS are allowed.
app.use(
  cors({
    origin: env.CORS_ORIGINS, // array parsed from env
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ── Body parsing ──────────────────────────────────────────
// 100 KB limit keeps the server safe from oversized payloads.
app.use(express.json({ limit: "100kb" }));

// ── Routes ────────────────────────────────────────────────
app.use("/api/health", healthRouter);

// ── Error handling ────────────────────────────────────────
// Must come after all routes.
app.use(notFound);
app.use(errorHandler);

export default app;
