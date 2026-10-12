// server/src/config/db.js
// ─────────────────────────────────────────────────────────
// Connects to MongoDB via Mongoose. Exports a `connectDB`
// function that the startup sequence calls before the HTTP
// server begins listening.
// ─────────────────────────────────────────────────────────

import mongoose from "mongoose";
import env from "./env.js";

/**
 * Attempt to connect to MongoDB.
 * Resolves when the connection is established, or rejects on failure.
 * The raw connection URI is never logged — only the host is shown.
 */
export async function connectDB() {
  try {
    // Extract just the host portion for safe logging
    const safeHost = extractHost(env.MONGODB_URI);
    console.log(`⏳  Connecting to MongoDB (${safeHost}) …`);

    await mongoose.connect(env.MONGODB_URI);

    console.log(`✅  MongoDB connected (${safeHost})`);
  } catch (error) {
    // Log the error message but NOT the connection string
    console.error("❌  MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

/**
 * Return the host portion of a MongoDB URI for safe logging.
 * Falls back to "<hidden>" if parsing fails.
 */
function extractHost(uri) {
  try {
    // mongodb+srv://user:pass@cluster0.abc.mongodb.net/db
    const match = uri.match(/@([^/]+)/);
    return match ? match[1] : "<hidden>";
  } catch {
    return "<hidden>";
  }
}

export default mongoose;
