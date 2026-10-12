// server/tests/integration/readApis.test.js
// ─────────────────────────────────────────────────────────
// Integration tests for Stage 3 Read APIs:
//   1. GET /api/sessions
//   2. GET /api/sessions/:sessionId/events
//   3. GET /api/pages
//   4. GET /api/clicks?pageUrl=...
//
// These tests connect to the real MongoDB Atlas database.
// All documents created use an isolated test prefix and are
// cleaned up in before() and after() hooks.
// ─────────────────────────────────────────────────────────

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "../../src/config/db.js";
import app from "../../src/app.js";
import Event from "../../src/models/Event.js";
import { normalizePageUrl } from "../../src/validators/eventSchema.js";

let server;
let BASE_URL;

// Unique prefix to isolate this test run from any other data
const TEST_PREFIX = `s3_${Date.now().toString(36)}_`;
const trackedEventIds = [];

// Helper to make test event documents
function makeDoc(overrides) {
  const eventId = randomUUID();
  trackedEventIds.push(eventId);
  const rawUrl = overrides.pageUrl || "https://example.com/default";
  return {
    eventId,
    sessionId: `${TEST_PREFIX}sess_default`,
    type: "page_view",
    timestamp: new Date("2026-10-12T10:00:00.000Z"),
    receivedAt: new Date(),
    viewport: { width: 1920, height: 1080 },
    pageDimensions: { width: 1920, height: 3000 },
    ...overrides,
    pageUrl: normalizePageUrl(rawUrl),
  };
}

describe("Stage 3 Read APIs — Integration Tests", () => {
  const SESSION_ALPHA = `${TEST_PREFIX}alpha_12345`;
  const SESSION_BETA = `${TEST_PREFIX}beta_67890`;
  const SESSION_GAMMA = `${TEST_PREFIX}gamma_11223`;

  before(async () => {
    await connectDB();
    server = app.listen(0);
    const { port } = server.address();
    BASE_URL = `http://localhost:${port}`;
  });

  after(async () => {
    // Clean up all documents created in this test run
    if (trackedEventIds.length > 0) {
      await Event.deleteMany({ eventId: { $in: trackedEventIds } });
    }
    // Also delete any documents matching test prefix just in case
    await Event.deleteMany({ sessionId: new RegExp(`^${TEST_PREFIX}`) });

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  });

  // ── 1. Empty Database / Untracked Behavior ───────────────
  describe("Empty or untracked data handling", () => {
    it("GET /api/sessions returns 200 with empty array for non-matching or empty dataset", async () => {
      // Even if other unrelated data exists, testing pagination bounds works
      const res = await fetch(`${BASE_URL}/api/sessions?page=99999&limit=20`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.deepStrictEqual(body.data, []);
      assert.strictEqual(body.pagination.page, 99999);
      assert.strictEqual(body.pagination.limit, 20);
      assert.strictEqual(typeof body.pagination.total, "number");
    });

    it("GET /api/sessions/:sessionId/events returns 404 for unknown session ID", async () => {
      const res = await fetch(
        `${BASE_URL}/api/sessions/${TEST_PREFIX}unknown_9999/events`
      );
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error, "Not Found");
      assert.match(body.message, /No events found for session/);
    });

    it("GET /api/clicks returns 200 with empty data for untracked page", async () => {
      const res = await fetch(
        `${BASE_URL}/api/clicks?pageUrl=${encodeURIComponent(
          "https://example.com/untracked-page"
        )}`
      );
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.deepStrictEqual(body.data, []);
      assert.strictEqual(body.meta.count, 0);
      assert.strictEqual(body.meta.truncated, false);
    });
  });

  // ── 2. Seed Test Fixtures ────────────────────────────────
  describe("Seed and test session analytics", () => {
    before(async () => {
      const fixtures = [
        // ── Session Gamma (Earliest last activity: 09:00) ──
        makeDoc({
          sessionId: SESSION_GAMMA,
          type: "page_view",
          pageUrl: "https://example.com/blog",
          timestamp: new Date("2026-10-12T09:00:00.000Z"),
        }),

        // ── Session Alpha (Middle last activity: 10:03) ──
        makeDoc({
          sessionId: SESSION_ALPHA,
          type: "page_view",
          pageUrl: "https://example.com/home?utm_source=twitter", // will normalize to /home
          timestamp: new Date("2026-10-12T10:00:00.000Z"),
        }),
        makeDoc({
          sessionId: SESSION_ALPHA,
          type: "click",
          pageUrl: "https://example.com/home",
          timestamp: new Date("2026-10-12T10:01:00.000Z"),
          click: {
            x: 50,
            y: 60,
            pageX: 50,
            pageY: 60,
            target: { tag: "BUTTON", id: "login-btn", class: "btn" },
          },
        }),
        makeDoc({
          sessionId: SESSION_ALPHA,
          type: "page_view",
          pageUrl: "https://example.com/products",
          timestamp: new Date("2026-10-12T10:02:00.000Z"),
        }),
        makeDoc({
          sessionId: SESSION_ALPHA,
          type: "click",
          pageUrl: "https://example.com/products",
          timestamp: new Date("2026-10-12T10:03:00.000Z"),
          click: {
            x: 100,
            y: 150,
            pageX: 100,
            pageY: 150,
            target: { tag: "A", id: "view-item", class: "link" },
          },
        }),

        // ── Session Beta (Newest last activity: 11:10) ──
        makeDoc({
          sessionId: SESSION_BETA,
          type: "page_view",
          pageUrl: "https://example.com/pricing",
          timestamp: new Date("2026-10-12T11:00:00.000Z"),
        }),
        makeDoc({
          sessionId: SESSION_BETA,
          type: "click",
          pageUrl: "https://example.com/pricing",
          timestamp: new Date("2026-10-12T11:05:00.000Z"),
          click: {
            x: 200,
            y: 300,
            pageX: 200,
            pageY: 300,
            target: { tag: "BUTTON", id: "subscribe-pro", class: "btn-primary" },
          },
        }),
        makeDoc({
          sessionId: SESSION_BETA,
          type: "click",
          pageUrl: "https://example.com/pricing",
          timestamp: new Date("2026-10-12T11:10:00.000Z"),
          click: {
            x: 220,
            y: 320,
            pageX: 220,
            pageY: 320,
            target: { tag: "BUTTON", id: "confirm-checkout", class: "btn-confirm" },
          },
        }),
      ];

      await Event.insertMany(fixtures);
    });

    // ── API 1: GET /api/sessions ───────────────────────────
    it("GET /api/sessions aggregates sessions with correct counts, entryPage, and newest-first order", async () => {
      const res = await fetch(`${BASE_URL}/api/sessions?page=1&limit=10`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(typeof body.pagination.total, "number");
      assert.ok(body.pagination.total >= 3);

      // Find our 3 test sessions from the response
      const alpha = body.data.find((s) => s.sessionId === SESSION_ALPHA);
      const beta = body.data.find((s) => s.sessionId === SESSION_BETA);
      const gamma = body.data.find((s) => s.sessionId === SESSION_GAMMA);

      assert.ok(alpha, "Session Alpha must exist");
      assert.ok(beta, "Session Beta must exist");
      assert.ok(gamma, "Session Gamma must exist");

      // Verify Session Alpha metrics
      assert.strictEqual(alpha.totalEvents, 4);
      assert.strictEqual(alpha.pageViews, 2);
      assert.strictEqual(alpha.clicks, 2);
      assert.strictEqual(
        new Date(alpha.firstEventAt).toISOString(),
        "2026-10-12T10:00:00.000Z"
      );
      assert.strictEqual(
        new Date(alpha.lastEventAt).toISOString(),
        "2026-10-12T10:03:00.000Z"
      );
      assert.strictEqual(alpha.entryPage, "https://example.com/home");

      // Verify Session Beta metrics
      assert.strictEqual(beta.totalEvents, 3);
      assert.strictEqual(beta.pageViews, 1);
      assert.strictEqual(beta.clicks, 2);
      assert.strictEqual(
        new Date(beta.firstEventAt).toISOString(),
        "2026-10-12T11:00:00.000Z"
      );
      assert.strictEqual(
        new Date(beta.lastEventAt).toISOString(),
        "2026-10-12T11:10:00.000Z"
      );
      assert.strictEqual(beta.entryPage, "https://example.com/pricing");

      // Verify newest-first ordering (Beta > Alpha > Gamma)
      const betaIdx = body.data.findIndex((s) => s.sessionId === SESSION_BETA);
      const alphaIdx = body.data.findIndex((s) => s.sessionId === SESSION_ALPHA);
      const gammaIdx = body.data.findIndex((s) => s.sessionId === SESSION_GAMMA);

      assert.ok(betaIdx < alphaIdx, "Beta (11:10) must appear before Alpha (10:03)");
      assert.ok(alphaIdx < gammaIdx, "Alpha (10:03) must appear before Gamma (09:00)");
    });

    it("GET /api/sessions handles pagination correctly", async () => {
      const page1Res = await fetch(`${BASE_URL}/api/sessions?page=1&limit=2`);
      assert.strictEqual(page1Res.status, 200);
      const page1Body = await page1Res.json();
      assert.strictEqual(page1Body.data.length, 2);
      assert.strictEqual(page1Body.pagination.page, 1);
      assert.strictEqual(page1Body.pagination.limit, 2);

      const page2Res = await fetch(`${BASE_URL}/api/sessions?page=2&limit=2`);
      assert.strictEqual(page2Res.status, 200);
      const page2Body = await page2Res.json();
      assert.strictEqual(page2Body.pagination.page, 2);
      assert.strictEqual(page2Body.pagination.limit, 2);

      // Verify no overlap between page 1 and page 2
      const page1Ids = new Set(page1Body.data.map((s) => s.sessionId));
      for (const item of page2Body.data) {
        assert.ok(!page1Ids.has(item.sessionId), `Session ${item.sessionId} should not repeat across pages`);
      }
    });

    it("GET /api/sessions rejects invalid pagination parameters with 400", async () => {
      const badParams = [
        "page=0",
        "page=-1",
        "page=abc",
        "limit=0",
        "limit=101",
        "limit=xyz",
        "limit=10.5",
      ];

      for (const param of badParams) {
        const res = await fetch(`${BASE_URL}/api/sessions?${param}`);
        assert.strictEqual(res.status, 400, `Expected 400 for ${param}`);
        const body = await res.json();
        assert.strictEqual(body.error, "Validation Error");
      }
    });

    // ── API 2: GET /api/sessions/:sessionId/events ─────────
    it("GET /api/sessions/:sessionId/events returns chronological timeline oldest-first", async () => {
      const res = await fetch(
        `${BASE_URL}/api/sessions/${SESSION_ALPHA}/events`
      );
      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(body.meta.count, 4);
      assert.strictEqual(body.data.length, 4);

      // Check oldest-first ordering
      const timestamps = body.data.map((e) => new Date(e.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        assert.ok(
          timestamps[i] >= timestamps[i - 1],
          `Events must be sorted oldest to newest (${timestamps[i]} >= ${timestamps[i - 1]})`
        );
      }

      // Check payload shape: no internal database fields like _id or __v
      const first = body.data[0];
      assert.strictEqual(first._id, undefined);
      assert.strictEqual(first.__v, undefined);
      assert.strictEqual(first.receivedAt, undefined);
      assert.strictEqual(first.type, "page_view");
      assert.strictEqual(first.pageUrl, "https://example.com/home");
      assert.ok(first.eventId);
      assert.ok(first.viewport);
      assert.ok(first.pageDimensions);
      assert.strictEqual(first.click, undefined); // page_views have no click object

      // Check click event has click coordinates and target
      const second = body.data[1];
      assert.strictEqual(second.type, "click");
      assert.ok(second.click);
      assert.strictEqual(second.click.x, 50);
      assert.strictEqual(second.click.y, 60);
      assert.strictEqual(second.click.target.tag, "BUTTON");
    });

    it("GET /api/sessions/:sessionId/events rejects invalid session IDs with 400", async () => {
      const invalidIds = ["short", "bad@char!", "space id", "a".repeat(65)];
      for (const id of invalidIds) {
        const res = await fetch(`${BASE_URL}/api/sessions/${encodeURIComponent(id)}/events`);
        assert.strictEqual(res.status, 400, `Expected 400 for invalid sessionId ${id}`);
        const body = await res.json();
        assert.strictEqual(body.error, "Validation Error");
      }
    });

    // ── API 3: GET /api/pages ──────────────────────────────
    it("GET /api/pages returns grouped pages with pageViews and clicks", async () => {
      const res = await fetch(`${BASE_URL}/api/pages`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.ok(Array.isArray(body.data));

      const pricing = body.data.find((p) => p.pageUrl === "https://example.com/pricing");
      const home = body.data.find((p) => p.pageUrl === "https://example.com/home");
      const products = body.data.find((p) => p.pageUrl === "https://example.com/products");
      const blog = body.data.find((p) => p.pageUrl === "https://example.com/blog");

      assert.ok(pricing, "Pricing page must be tracked");
      assert.strictEqual(pricing.pageViews, 1);
      assert.strictEqual(pricing.clicks, 2);

      assert.ok(home, "Home page must be tracked");
      assert.strictEqual(home.pageViews, 1);
      assert.strictEqual(home.clicks, 1);

      assert.ok(products, "Products page must be tracked");
      assert.strictEqual(products.pageViews, 1);
      assert.strictEqual(products.clicks, 1);

      assert.ok(blog, "Blog page must be tracked");
      assert.strictEqual(blog.pageViews, 1);
      assert.strictEqual(blog.clicks, 0);

      // Verify deterministic sorting (pageViews desc, clicks desc, pageUrl asc)
      for (let i = 1; i < body.data.length; i++) {
        const prev = body.data[i - 1];
        const curr = body.data[i];
        if (prev.pageViews === curr.pageViews) {
          assert.ok(
            prev.clicks >= curr.clicks,
            "When pageViews match, higher clicks must come first"
          );
        } else {
          assert.ok(
            prev.pageViews >= curr.pageViews,
            "Higher pageViews must come first"
          );
        }
      }
    });

    // ── API 4: GET /api/clicks?pageUrl=... ─────────────────
    it("GET /api/clicks retrieves only clicks for the requested page", async () => {
      const res = await fetch(
        `${BASE_URL}/api/clicks?pageUrl=${encodeURIComponent("https://example.com/pricing")}`
      );
      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(body.meta.count, 2);
      assert.strictEqual(body.meta.truncated, false);
      assert.strictEqual(body.data.length, 2);

      // Verify newest-first order
      const t0 = new Date(body.data[0].timestamp).getTime();
      const t1 = new Date(body.data[1].timestamp).getTime();
      assert.ok(t0 >= t1, "Clicks must be sorted newest first");

      // Verify click payload structure
      const clickEv = body.data[0];
      assert.ok(clickEv.eventId);
      assert.strictEqual(clickEv.sessionId, SESSION_BETA);
      assert.ok(clickEv.click);
      assert.ok(clickEv.viewport);
      assert.ok(clickEv.pageDimensions);
      assert.strictEqual(clickEv._id, undefined);
      assert.strictEqual(clickEv.__v, undefined);
      assert.strictEqual(clickEv.receivedAt, undefined);
    });

    it("GET /api/clicks normalizes query URL (strips query parameters and fragments)", async () => {
      // Query with query param and hash fragment: ?ref=google#pricing-table
      const rawUrl = "https://example.com/pricing?ref=google#pricing-table";
      const res = await fetch(
        `${BASE_URL}/api/clicks?pageUrl=${encodeURIComponent(rawUrl)}`
      );
      assert.strictEqual(res.status, 200);
      const body = await res.json();

      // Should match the normalized https://example.com/pricing events
      assert.strictEqual(body.meta.count, 2);
      assert.strictEqual(body.meta.truncated, false);
    });

    it("GET /api/clicks rejects missing or invalid pageUrl with 400", async () => {
      // Missing
      const resMissing = await fetch(`${BASE_URL}/api/clicks`);
      assert.strictEqual(resMissing.status, 400);

      // Invalid protocol
      const resFtp = await fetch(
        `${BASE_URL}/api/clicks?pageUrl=${encodeURIComponent("ftp://example.com/pricing")}`
      );
      assert.strictEqual(resFtp.status, 400);

      // Malformed URL
      const resBad = await fetch(
        `${BASE_URL}/api/clicks?pageUrl=${encodeURIComponent("not-a-valid-url")}`
      );
      assert.strictEqual(resBad.status, 400);
    });
  });

  // ── 5. Truncation Threshold Test (Capped at 5,000) ───────
  describe("GET /api/clicks truncation threshold (5,000 max)", () => {
    const TRUNC_PAGE = "https://example.com/truncation-test-page";
    const TRUNC_SESSION = `${TEST_PREFIX}trunc_session`;

    before(async () => {
      // Insert 5,005 click events to verify that the query caps at 5,000
      // and sets meta.truncated = true
      const bulkDocs = [];
      const baseTime = new Date("2026-10-12T12:00:00.000Z").getTime();

      for (let i = 0; i < 5005; i++) {
        const eventId = randomUUID();
        trackedEventIds.push(eventId);
        bulkDocs.push({
          eventId,
          sessionId: TRUNC_SESSION,
          type: "click",
          pageUrl: TRUNC_PAGE,
          timestamp: new Date(baseTime + i * 100),
          receivedAt: new Date(),
          viewport: { width: 1920, height: 1080 },
          pageDimensions: { width: 1920, height: 3000 },
          click: {
            x: 10,
            y: 20,
            pageX: 10,
            pageY: 20,
            target: { tag: "DIV", id: `div-${i}`, class: "trunc" },
          },
        });
      }

      await Event.insertMany(bulkDocs);
    });

    after(async () => {
      // Clean up truncation test events
      await Event.deleteMany({ sessionId: TRUNC_SESSION });
    });

    it("caps returned click documents at 5,000 and sets truncated: true", async () => {
      const res = await fetch(
        `${BASE_URL}/api/clicks?pageUrl=${encodeURIComponent(TRUNC_PAGE)}`
      );
      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(body.data.length, 5000);
      assert.strictEqual(body.meta.count, 5000);
      assert.strictEqual(body.meta.truncated, true);

      // Newest first check
      const newest = new Date(body.data[0].timestamp).getTime();
      const second = new Date(body.data[1].timestamp).getTime();
      assert.ok(newest >= second);
    });
  });

  // ── 6. Database Error Handling (503 Service Unavailable) ─
  describe("Database readiness error handling", () => {
    let originalReadyState;

    before(() => {
      originalReadyState = mongoose.connection.readyState;
    });

    after(() => {
      // Restore readyState
      Object.defineProperty(mongoose.connection, "readyState", {
        value: originalReadyState,
        configurable: true,
        writable: true,
      });
    });

    it("returns 503 Service Unavailable when mongoose is disconnected", async () => {
      // Simulate disconnected state (0)
      Object.defineProperty(mongoose.connection, "readyState", {
        value: 0,
        configurable: true,
        writable: true,
      });

      const endpoints = [
        "/api/sessions",
        `/api/sessions/${SESSION_ALPHA}/events`,
        "/api/pages",
        `/api/clicks?pageUrl=${encodeURIComponent("https://example.com/pricing")}`,
      ];

      for (const endpoint of endpoints) {
        const res = await fetch(`${BASE_URL}${endpoint}`);
        assert.strictEqual(res.status, 503, `Expected 503 for ${endpoint}`);
        const body = await res.json();
        assert.strictEqual(body.error, "Service Unavailable");
        assert.strictEqual(
          body.message,
          "Database is not available. Please retry later."
        );
      }
    });
  });
});
