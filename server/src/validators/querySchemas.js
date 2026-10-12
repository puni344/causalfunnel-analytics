// server/src/validators/querySchemas.js
// ─────────────────────────────────────────────────────────
// Zod schemas for validating incoming query and route parameters
// across Stage 3 read APIs:
//
// 1. paginationQuerySchema — GET /api/sessions?page=1&limit=20
// 2. sessionIdParamSchema  — GET /api/sessions/:sessionId/events
// 3. clicksQuerySchema     — GET /api/clicks?pageUrl=...
// ─────────────────────────────────────────────────────────

import { z } from "zod";

/**
 * Validates pagination query parameters.
 *
 * Rules:
 * - page: integer >= 1 (defaults to 1)
 * - limit: integer between 1 and 100 (defaults to 20)
 * Rejects non-integers, floats, negative values, and limit > 100.
 */
export const paginationQuerySchema = z.object({
  page: z
    .preprocess(
      (val) => (val === undefined || val === "" ? 1 : val),
      z.coerce
        .number({ invalid_type_error: "page must be a number" })
        .int("page must be an integer")
        .min(1, "page must be >= 1")
    ),
  limit: z
    .preprocess(
      (val) => (val === undefined || val === "" ? 20 : val),
      z.coerce
        .number({ invalid_type_error: "limit must be a number" })
        .int("limit must be an integer")
        .min(1, "limit must be >= 1")
        .max(100, "limit must be <= 100")
    ),
});

/**
 * Validates sessionId route parameter.
 *
 * Reuses the exact same constraints established in Stage 2:
 * - Length: 8–64 characters
 * - Characters: alphanumeric, underscores, hyphens only
 */
export const sessionIdParamSchema = z
  .string({ required_error: "sessionId is required" })
  .min(8, "sessionId must be 8–64 characters")
  .max(64, "sessionId must be 8–64 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "sessionId may only contain letters, digits, underscores, and hyphens"
  );

/**
 * Validates GET /api/clicks query parameter.
 *
 * Rules:
 * - pageUrl is required
 * - Must be a valid HTTP or HTTPS URL (max 2048 chars)
 */
export const clicksQuerySchema = z.object({
  pageUrl: z
    .string({ required_error: "pageUrl query parameter is required" })
    .min(1, "pageUrl cannot be empty")
    .max(2048, "pageUrl must be <= 2048 characters")
    .refine(
      (val) => {
        try {
          const u = new URL(val);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "pageUrl must be a valid HTTP or HTTPS URL" }
    ),
});
