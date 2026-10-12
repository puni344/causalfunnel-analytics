// server/src/validators/eventSchema.js
// ─────────────────────────────────────────────────────────
// Zod schema that validates incoming event payloads BEFORE
// they reach the Mongoose model.
//
// Why validate twice?
//   • Zod catches bad input early and returns clear,
//     field-level error messages to the client.
//   • Mongoose enforces the database shape as a safety net,
//     but its errors are harder to turn into friendly JSON.
//
// URL normalisation policy:
//   pageUrl is reduced to  origin + pathname  (no query
//   string, no hash fragment). This means two requests for
//   "/pricing?ref=google" and "/pricing?ref=twitter" are
//   stored under the same canonical URL "/pricing", which
//   makes aggregation simpler.
// ─────────────────────────────────────────────────────────

import { z } from "zod";

// ── Reusable sub-schemas ─────────────────────────────────

const clickTargetSchema = z
  .object({
    tag: z.string().min(1, "tag is required").max(50),
    id: z.string().max(200).default(""),
    class: z.string().max(500).default(""),
  })
  .strip();

const clickObjectSchema = z
  .object({
    x: z.number().finite().nonnegative("x must be ≥ 0"),
    y: z.number().finite().nonnegative("y must be ≥ 0"),
    pageX: z.number().finite().nonnegative("pageX must be ≥ 0"),
    pageY: z.number().finite().nonnegative("pageY must be ≥ 0"),
    target: clickTargetSchema,
  })
  .strip();

const dimensionsSchema = (label, maxVal) =>
  z
    .object({
      width: z
        .number()
        .int(`${label}.width must be an integer`)
        .min(1, `${label}.width must be ≥ 1`)
        .max(maxVal, `${label}.width must be ≤ ${maxVal}`),
      height: z
        .number()
        .int(`${label}.height must be an integer`)
        .min(1, `${label}.height must be ≥ 1`)
        .max(maxVal, `${label}.height must be ≤ ${maxVal}`),
    })
    .strip();

// ── Base event shape ─────────────────────────────────────

const baseEventSchema = z
  .object({
    eventId: z.string().uuid("eventId must be a valid UUID"),

    sessionId: z
      .string()
      .min(8, "sessionId must be 8–64 characters")
      .max(64, "sessionId must be 8–64 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "sessionId may only contain letters, digits, underscores, and hyphens"
      ),

    type: z.enum(["page_view", "click"], {
      message: 'type must be "page_view" or "click"',
    }),

    pageUrl: z
      .string()
      .max(2048, "pageUrl must be ≤ 2 048 characters")
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

    timestamp: z
      .string()
      .datetime({ offset: true, message: "timestamp must be a valid ISO 8601 date-time" })
      .refine(
        (val) => {
          const ts = new Date(val).getTime();
          const fiveMinFromNow = Date.now() + 5 * 60 * 1000;
          return ts <= fiveMinFromNow;
        },
        { message: "timestamp must not be more than 5 minutes in the future" }
      ),

    viewport: dimensionsSchema("viewport", 10_000),
    pageDimensions: dimensionsSchema("pageDimensions", 100_000),

    // click is optional at this level; cross-field rules below
    click: clickObjectSchema.optional(),
  })
  .strip(); // remove any extra fields the client sends

// ── Cross-field validation ───────────────────────────────

/**
 * Full event validation schema.
 *
 * After the base shape passes, superRefine enforces:
 *  1. click events MUST include a click object.
 *  2. page_view events MUST NOT include a click object.
 *  3. Viewport-relative coords (x, y) must not exceed
 *     the viewport dimensions.
 */
export const eventRequestSchema = baseEventSchema.superRefine((data, ctx) => {
  // Rule 1 — click events need click data
  if (data.type === "click" && !data.click) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["click"],
      message: "click object is required for click events",
    });
    return; // no point checking coords
  }

  // Rule 2 — page_view events must not carry click data
  if (data.type === "page_view" && data.click) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["click"],
      message: "click object must not be present for page_view events",
    });
    return;
  }

  // Rule 3 — viewport-relative coords within viewport bounds
  if (data.click && data.viewport) {
    if (data.click.x > data.viewport.width) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["click", "x"],
        message: `click.x (${data.click.x}) exceeds viewport.width (${data.viewport.width})`,
      });
    }
    if (data.click.y > data.viewport.height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["click", "y"],
        message: `click.y (${data.click.y}) exceeds viewport.height (${data.viewport.height})`,
      });
    }
  }
});

// ── URL normalisation ────────────────────────────────────

/**
 * Reduce a URL to origin + pathname.
 *
 *   "https://example.com/pricing?ref=google#faq"
 *     → "https://example.com/pricing"
 *
 * This merges query-string variants so analytics aggregation
 * treats "/pricing?ref=google" and "/pricing?ref=twitter" as
 * the same page.
 */
export function normalizePageUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  return parsed.origin + parsed.pathname;
}
