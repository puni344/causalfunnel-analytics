// server/src/index.js
// ─────────────────────────────────────────────────────────
// Application entry point.
// 1. Connects to MongoDB (exits if it fails).
// 2. Starts the Express HTTP server.
//
// Importing `env.js` is the very first thing that happens
// (through app.js → env.js) so missing config is caught
// before anything else runs.
// ─────────────────────────────────────────────────────────

import { connectDB } from "./config/db.js";
import env from "./config/env.js";
import app from "./app.js";

async function main() {
  // Step 1 — database must be ready before we accept requests
  await connectDB();

  // Step 2 — start the HTTP server
  app.listen(env.PORT, () => {
    console.log(
      `\n🚀  Server listening on http://localhost:${env.PORT}  (${env.NODE_ENV})\n`
    );
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
