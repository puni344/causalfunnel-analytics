// server/tests/unit/querySchemas.test.js
// ─────────────────────────────────────────────────────────
// Unit tests for Stage 3 query and parameter validation schemas.
// Runs standalone without database connection.
// ─────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  paginationQuerySchema,
  sessionIdParamSchema,
  clicksQuerySchema,
} from "../../src/validators/querySchemas.js";

describe("paginationQuerySchema", () => {
  it("applies default values when query params are omitted", () => {
    const res = paginationQuerySchema.safeParse({});
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, { page: 1, limit: 20 });
  });

  it("applies default values when values are empty strings", () => {
    const res = paginationQuerySchema.safeParse({ page: "", limit: "" });
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, { page: 1, limit: 20 });
  });

  it("coerces string representations of valid integers", () => {
    const res = paginationQuerySchema.safeParse({ page: "3", limit: "50" });
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, { page: 3, limit: 50 });
  });

  it("accepts valid boundary values (limit: 1 and limit: 100)", () => {
    const resMin = paginationQuerySchema.safeParse({ page: 1, limit: 1 });
    assert.strictEqual(resMin.success, true);
    assert.deepStrictEqual(resMin.data, { page: 1, limit: 1 });

    const resMax = paginationQuerySchema.safeParse({ page: 5, limit: 100 });
    assert.strictEqual(resMax.success, true);
    assert.deepStrictEqual(resMax.data, { page: 5, limit: 100 });
  });

  it("rejects page < 1 (0 and negative numbers)", () => {
    assert.strictEqual(paginationQuerySchema.safeParse({ page: 0 }).success, false);
    assert.strictEqual(paginationQuerySchema.safeParse({ page: -1 }).success, false);
  });

  it("rejects non-integer page values", () => {
    assert.strictEqual(paginationQuerySchema.safeParse({ page: 1.5 }).success, false);
    assert.strictEqual(paginationQuerySchema.safeParse({ page: "abc" }).success, false);
  });

  it("rejects limit < 1 and limit > 100", () => {
    assert.strictEqual(paginationQuerySchema.safeParse({ limit: 0 }).success, false);
    assert.strictEqual(paginationQuerySchema.safeParse({ limit: -10 }).success, false);
    assert.strictEqual(paginationQuerySchema.safeParse({ limit: 101 }).success, false);
    assert.strictEqual(paginationQuerySchema.safeParse({ limit: "too-many" }).success, false);
  });

  it("rejects non-integer limit values", () => {
    assert.strictEqual(paginationQuerySchema.safeParse({ limit: 20.5 }).success, false);
  });
});

describe("sessionIdParamSchema", () => {
  it("accepts valid session IDs", () => {
    assert.strictEqual(sessionIdParamSchema.safeParse("sess_12345678").success, true);
    assert.strictEqual(sessionIdParamSchema.safeParse("user-sess-ABC_1234").success, true);
  });

  it("rejects session IDs shorter than 8 characters", () => {
    assert.strictEqual(sessionIdParamSchema.safeParse("short").success, false);
  });

  it("rejects session IDs longer than 64 characters", () => {
    const longId = "a".repeat(65);
    assert.strictEqual(sessionIdParamSchema.safeParse(longId).success, false);
  });

  it("rejects invalid characters (spaces, symbols)", () => {
    assert.strictEqual(sessionIdParamSchema.safeParse("sess 12345678").success, false);
    assert.strictEqual(sessionIdParamSchema.safeParse("sess@12345678!").success, false);
  });
});

describe("clicksQuerySchema", () => {
  it("accepts valid http and https URLs", () => {
    const httpRes = clicksQuerySchema.safeParse({ pageUrl: "http://localhost:3000/demo" });
    assert.strictEqual(httpRes.success, true);

    const httpsRes = clicksQuerySchema.safeParse({ pageUrl: "https://example.com/pricing?ref=google" });
    assert.strictEqual(httpsRes.success, true);
  });

  it("rejects missing or empty pageUrl with custom error message", () => {
    const missingRes = clicksQuerySchema.safeParse({});
    assert.strictEqual(missingRes.success, false);
    assert.strictEqual(missingRes.error.issues[0].message, "pageUrl query parameter is required");

    const emptyRes = clicksQuerySchema.safeParse({ pageUrl: "" });
    assert.strictEqual(emptyRes.success, false);
    assert.strictEqual(emptyRes.error.issues[0].message, "pageUrl cannot be empty");
  });

  it("rejects non-HTTP protocols (e.g., ftp://, javascript:)", () => {
    assert.strictEqual(clicksQuerySchema.safeParse({ pageUrl: "ftp://example.com/file" }).success, false);
    assert.strictEqual(clicksQuerySchema.safeParse({ pageUrl: "javascript:alert(1)" }).success, false);
  });

  it("rejects malformed URLs", () => {
    assert.strictEqual(clicksQuerySchema.safeParse({ pageUrl: "not-a-valid-url" }).success, false);
  });

  it("validates sessionId required error message", () => {
    const missingSessionRes = sessionIdParamSchema.safeParse(undefined);
    assert.strictEqual(missingSessionRes.success, false);
    assert.strictEqual(missingSessionRes.error.issues[0].message, "sessionId is required");
  });

  it("validates pagination invalid number message", () => {
    const invalidPageRes = paginationQuerySchema.safeParse({ page: "not-a-num" });
    assert.strictEqual(invalidPageRes.success, false);
    assert.strictEqual(invalidPageRes.error.issues[0].message, "page must be a number");
  });
});
