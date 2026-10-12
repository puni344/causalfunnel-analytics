// server/src/app.js
// ─────────────────────────────────────────────────────────
// Creates and configures the Express application.
// This file does NOT start the server or connect to the
// database — that responsibility belongs to index.js.
// Keeping them separate makes the app easier to test.
// ─────────────────────────────────────────────────────────

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import env from "./config/env.js";
import healthRouter from "./routes/health.js";
import eventsRouter from "./routes/events.js";
import sessionsRouter from "./routes/sessions.js";
import pagesRouter from "./routes/pages.js";
import clicksRouter from "./routes/clicks.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const trackerPath = path.resolve(__dirname, "../../tracker/tracker.js");
const demoDirPath = path.resolve(__dirname, "../../demo");

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

// ── Static assets ─────────────────────────────────────────
// Serves standalone plain-JS tracking script
app.get("/tracker.js", (_req, res) => {
  res.sendFile(trackerPath, { dotfiles: "allow" });
});

// Serves the two-page demo website
app.use("/demo", express.static(demoDirPath));

// ── API Routes ────────────────────────────────────────────
app.use("/api/health", healthRouter);
app.use("/api/events", eventsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/pages", pagesRouter);
app.use("/api/clicks", clicksRouter);

// ── Error handling ────────────────────────────────────────
// Must come after all routes.
app.use(notFound);
app.use(errorHandler);

export default app;
