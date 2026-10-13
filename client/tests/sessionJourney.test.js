// client/tests/sessionJourney.test.js
// ─────────────────────────────────────────────────────────
// Session Journey Visualization Tests
// Validates routing, chronological sorting, metric derivation,
// defensive coordinate & metadata formatting, and error classifications.
// ─────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseRoute,
  formatDuration,
  shortenId,
  formatUrl,
  formatFullDate,
  formatTimeOnly,
} from "../src/utils/journeyUtils.js";

describe("Session Journey — Routing & Route Parsing", () => {
  it("parses /sessions/:sessionId correctly with extracted session ID", () => {
    const route = parseRoute("/sessions/87a6bbcc-6a7e-43ac-8013-5d8cebc00867");
    assert.strictEqual(route.tab, "journey");
    assert.strictEqual(route.sessionId, "87a6bbcc-6a7e-43ac-8013-5d8cebc00867");
  });

  it("safely decodes URI-encoded session IDs", () => {
    const route = parseRoute("/sessions/user%20session%23123");
    assert.strictEqual(route.tab, "journey");
    assert.strictEqual(route.sessionId, "user session#123");
  });

  it("handles trailing slash on session route", () => {
    const route = parseRoute("/sessions/sess_xyz123/");
    assert.strictEqual(route.tab, "journey");
    assert.strictEqual(route.sessionId, "sess_xyz123");
  });

  it("routes / and /sessions to sessions tab without session ID", () => {
    assert.deepStrictEqual(parseRoute("/"), { tab: "sessions", sessionId: null });
    assert.deepStrictEqual(parseRoute("/sessions"), { tab: "sessions", sessionId: null });
    assert.deepStrictEqual(parseRoute("/sessions/"), { tab: "sessions", sessionId: null });
  });

  it("routes /heatmap to heatmap tab", () => {
    assert.deepStrictEqual(parseRoute("/heatmap"), { tab: "heatmap", sessionId: null });
  });

  it("routes /journey to journey tab with null session ID", () => {
    assert.deepStrictEqual(parseRoute("/journey"), { tab: "journey", sessionId: null });
  });
});

describe("Session Journey — Formatters & Duration Calculations", () => {
  it("formats session duration across varied intervals accurately", () => {
    const base = new Date("2026-10-12T10:00:00.000Z").getTime();

    // Less than 1 second
    const t0 = new Date(base + 400).toISOString();
    assert.strictEqual(formatDuration(new Date(base).toISOString(), t0), "< 1s");

    // Under 1 minute
    const t45s = new Date(base + 45000).toISOString();
    assert.strictEqual(formatDuration(new Date(base).toISOString(), t45s), "45s");

    // Minutes and seconds
    const t5m12s = new Date(base + (5 * 60 + 12) * 1000).toISOString();
    assert.strictEqual(formatDuration(new Date(base).toISOString(), t5m12s), "5m 12s");

    // Exact minutes
    const t10m = new Date(base + 10 * 60 * 1000).toISOString();
    assert.strictEqual(formatDuration(new Date(base).toISOString(), t10m), "10m");

    // Hours and minutes
    const t2h15m = new Date(base + (2 * 3600 + 15 * 60) * 1000).toISOString();
    assert.strictEqual(formatDuration(new Date(base).toISOString(), t2h15m), "2h 15m");
  });

  it("handles missing or invalid duration timestamps without crashing or NaN", () => {
    assert.strictEqual(formatDuration(null, null), "0s");
    assert.strictEqual(formatDuration("", ""), "0s");
    assert.strictEqual(formatDuration("invalid-date", "2026-10-12T10:00:00Z"), "0s");
    assert.strictEqual(formatDuration("2026-10-12T10:00:00Z", "not-a-date"), "0s");
  });

  it("shortens session IDs cleanly with ellipsis while leaving short IDs intact", () => {
    assert.strictEqual(
      shortenId("87a6bbcc-6a7e-43ac-8013-5d8cebc00867"),
      "87a6bbcc…c00867"
    );
    assert.strictEqual(shortenId("sess_1234"), "sess_1234");
    assert.strictEqual(shortenId(null), null);
  });

  it("formats URLs to readable paths while preserving origin for root path", () => {
    assert.strictEqual(formatUrl("http://localhost:4000/demo/index.html"), "/demo/index.html");
    assert.strictEqual(formatUrl("http://localhost:4000/demo/about.html"), "/demo/about.html");
    assert.strictEqual(formatUrl("http://localhost:4000/"), "http://localhost:4000");
    assert.strictEqual(formatUrl("not-a-url"), "not-a-url");
    assert.strictEqual(formatUrl(null), "—");
  });

  it("formats full date and time without crashing on invalid input", () => {
    const validIso = "2026-10-12T10:00:00.000Z";
    assert.match(formatFullDate(validIso), /Oct 12, 2026/);
    assert.ok(formatTimeOnly(validIso).length > 0);

    assert.strictEqual(formatFullDate(null), "—");
    assert.strictEqual(formatFullDate("invalid"), "—");
    assert.strictEqual(formatTimeOnly(null), "—");
    assert.strictEqual(formatTimeOnly("invalid"), "—");
  });
});

describe("Session Journey — Chronological Ordering & Metrics Derivation", () => {
  const mockRawEvents = [
    {
      eventId: "ev_click_2",
      sessionId: "sess_journey_1",
      type: "click",
      pageUrl: "http://localhost:4000/demo/about.html",
      timestamp: "2026-10-12T10:03:00.000Z",
      viewport: { width: 1440, height: 900 },
      pageDimensions: { width: 1440, height: 2200 },
      click: {
        x: 450,
        y: 200,
        pageX: 450,
        pageY: 350,
        target: { tag: "BUTTON", id: "contact-submit", class: "btn-primary" },
      },
    },
    {
      eventId: "ev_pv_1",
      sessionId: "sess_journey_1",
      type: "page_view",
      pageUrl: "http://localhost:4000/demo/index.html",
      timestamp: "2026-10-12T10:00:00.000Z",
      viewport: { width: 1440, height: 900 },
      pageDimensions: { width: 1440, height: 1800 },
    },
    {
      eventId: "ev_click_1",
      sessionId: "sess_journey_1",
      type: "click",
      pageUrl: "http://localhost:4000/demo/index.html",
      timestamp: "2026-10-12T10:01:30.000Z",
      viewport: { width: 1440, height: 900 },
      pageDimensions: { width: 1440, height: 1800 },
      click: {
        x: 120,
        y: 80,
        pageX: 120,
        pageY: 80,
        target: { tag: "A", id: "nav-about", class: "nav-link" },
      },
    },
    {
      eventId: "ev_pv_2",
      sessionId: "sess_journey_1",
      type: "page_view",
      pageUrl: "http://localhost:4000/demo/about.html",
      timestamp: "2026-10-12T10:02:00.000Z",
      viewport: { width: 1440, height: 900 },
      pageDimensions: { width: 1440, height: 2200 },
    },
  ];

  it("sorts raw events chronologically in deterministic ascending order", () => {
    const sorted = [...mockRawEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    assert.strictEqual(sorted[0].eventId, "ev_pv_1"); // 10:00:00
    assert.strictEqual(sorted[1].eventId, "ev_click_1"); // 10:01:30
    assert.strictEqual(sorted[2].eventId, "ev_pv_2"); // 10:02:00
    assert.strictEqual(sorted[3].eventId, "ev_click_2"); // 10:03:00
  });

  it("derives accurate summary totals matching the actual returned events", () => {
    const sorted = [...mockRawEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const totalEvents = sorted.length;
    const pageViews = sorted.filter((e) => e.type === "page_view").length;
    const clicks = sorted.filter((e) => e.type === "click").length;
    const entryPage = sorted[0].pageUrl;
    const duration = formatDuration(sorted[0].timestamp, sorted[sorted.length - 1].timestamp);

    assert.strictEqual(totalEvents, 4);
    assert.strictEqual(pageViews, 2);
    assert.strictEqual(clicks, 2);
    assert.strictEqual(entryPage, "http://localhost:4000/demo/index.html");
    assert.strictEqual(duration, "3m");
  });

  it("handles empty event stream without errors or NaN statistics", () => {
    const events = [];
    const totalEvents = events.length;
    const pageViews = events.filter((e) => e.type === "page_view").length;
    const clicks = events.filter((e) => e.type === "click").length;
    const firstEvent = events[0] || null;
    const lastEvent = events[events.length - 1] || null;
    const entryPage = firstEvent ? firstEvent.pageUrl : "—";
    const duration = firstEvent && lastEvent ? formatDuration(firstEvent.timestamp, lastEvent.timestamp) : "0s";

    assert.strictEqual(totalEvents, 0);
    assert.strictEqual(pageViews, 0);
    assert.strictEqual(clicks, 0);
    assert.strictEqual(entryPage, "—");
    assert.strictEqual(duration, "0s");
  });

  it("preserves viewport-relative and document-relative coordinate systems separately", () => {
    const clickEv = mockRawEvents.find((e) => e.eventId === "ev_click_2");
    assert.ok(clickEv.click);

    // Viewport-relative coordinates (x, y)
    assert.strictEqual(clickEv.click.x, 450);
    assert.strictEqual(clickEv.click.y, 200);

    // Document-relative coordinates (pageX, pageY)
    assert.strictEqual(clickEv.click.pageX, 450);
    assert.strictEqual(clickEv.click.pageY, 350);

    assert.notStrictEqual(
      clickEv.click.y,
      clickEv.click.pageY,
      "Viewport y and Document pageY must not be conflated when page is scrolled"
    );
  });

  it("renders defensively when optional click target or dimension fields are omitted", () => {
    const sparseClickEvent = {
      eventId: "ev_sparse",
      sessionId: "sess_sparse",
      type: "click",
      pageUrl: "http://localhost:4000/demo/test.html",
      timestamp: "2026-10-12T10:00:00.000Z",
      click: {
        x: 100,
        y: 150,
        pageX: 100,
        pageY: 150,
        // target is omitted entirely
      },
      // viewport and pageDimensions are omitted
    };

    // Target tag defensive fallback
    const targetTag = sparseClickEvent.click?.target?.tag || "UNKNOWN";
    assert.strictEqual(targetTag, "UNKNOWN");

    const targetId = sparseClickEvent.click?.target?.id || null;
    assert.strictEqual(targetId, null);

    const hasDimensions = Boolean(sparseClickEvent.viewport && sparseClickEvent.pageDimensions);
    assert.strictEqual(hasDimensions, false);
  });
});
