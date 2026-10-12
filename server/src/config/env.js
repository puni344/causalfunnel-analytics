// server/src/config/env.js
// ─────────────────────────────────────────────────────────
// Loads environment variables from .env, validates them with
// Zod, and exports a frozen config object used by the rest
// of the application. If any required variable is missing or
// invalid the process exits immediately with a clear error.
// ─────────────────────────────────────────────────────────

import "dotenv/config"; // loads .env into process.env
import { z } from "zod";

const envSchema = z.object({
  PORT: z
    .string()
    .default("4000")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),

  MONGODB_URI: z
    .string({ required_error: "MONGODB_URI is required" })
    .min(1, "MONGODB_URI must not be empty")
    .startsWith("mongodb", "MONGODB_URI must start with 'mongodb'"),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((val) => val.split(",").map((origin) => origin.trim())),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

/** @type {z.infer<typeof envSchema>} */
let env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("\n❌  Environment validation failed:\n");
    for (const issue of error.issues) {
      console.error(`   • ${issue.path.join(".")}: ${issue.message}`);
    }
    console.error(
      "\n   Copy .env.example → .env and fill in the required values.\n"
    );
  } else {
    console.error("❌  Unexpected error while loading config:", error);
  }
  process.exit(1);
}

export default Object.freeze(env);
