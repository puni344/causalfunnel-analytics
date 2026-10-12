// client/tests/heatmap.test.js
// ─────────────────────────────────────────────────────────
// Heatmap Logic & Coordinate Math Unit Tests
// Validates viewport classification, document-coordinate normalization,
// clamping, responsive filtering, and dimension calculations.
// ─────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyViewport,
  normalizeClickCoordinate,
  filterEventsByViewport,
  calculatePreviewDimensions,
  computeHeatmapSummary,
  drawHeatmapToCanvas,
} from "../src/utils/heatmapUtils.js";

describe("Heatmap — Viewport Classification", () => {
  it("categorizes viewport width < 768px strictly as mobile", () => {
    assert.strictEqual(classifyViewport(390), "mobile");
    assert.strictEqual(classifyViewport(414), "mobile");
    assert.strictEqual(classifyViewport(767), "mobile");
  });

  it("categorizes viewport width >= 1024px strictly as desktop", () => {
    assert.strictEqual(classifyViewport(1024), "desktop");
    assert.strictEqual(classifyViewport(1440), "desktop");
    assert.strictEqual(classifyViewport(1920), "desktop");
  });

  it("categorizes intermediate widths [768px, 1024px) as intermediate without mislabeling", () => {
    assert.strictEqual(classifyViewport(768), "intermediate");
    assert.strictEqual(classifyViewport(834), "intermediate");
    assert.strictEqual(classifyViewport(1023), "intermediate");
  });

  it("safely categorizes invalid or missing widths as unknown", () => {
    assert.strictEqual(classifyViewport(0), "unknown");
    assert.strictEqual(classifyViewport(-500), "unknown");
    assert.strictEqual(classifyViewport(null), "unknown");
    assert.strictEqual(classifyViewport(undefined), "unknown");
    assert.strictEqual(classifyViewport(NaN), "unknown");
    assert.strictEqual(classifyViewport("1200"), "unknown");
  });
});

describe("Heatmap — Coordinate Normalization Strategy", () => {
  it("normalizes document-relative coordinates accurately using event's own page dimensions", () => {
    const event = {
      click: { x: 300, y: 150, pageX: 450, pageY: 900 },
      viewport: { width: 1440, height: 900 },
      pageDimensions: { width: 1500, height: 3000 },
    };

    const norm = normalizeClickCoordinate(event);
    assert.ok(norm);
    assert.strictEqual(norm.system, "document");
    assert.strictEqual(norm.normX, 450 / 1500); // 0.30
    assert.strictEqual(norm.normY, 900 / 3000); // 0.30
    assert.strictEqual(norm.sourceWidth, 1500);
    assert.strictEqual(norm.sourceHeight, 3000);
  });

  it("clamps out-of-bounds coordinates strictly to [0, 1] range", () => {
    const eventOutOfBounds = {
      click: { pageX: 1800, pageY: -50 },
      pageDimensions: { width: 1500, height: 2000 },
    };

    const norm = normalizeClickCoordinate(eventOutOfBounds);
    assert.ok(norm);
    assert.strictEqual(norm.normX, 1.0); // clamped from 1.2
    assert.strictEqual(norm.normY, 0.0); // clamped from -0.025
  });

  it("falls back to viewport-relative coordinates only when document dimensions are missing", () => {
    const eventViewportOnly = {
      click: { x: 360, y: 450 },
      viewport: { width: 1440, height: 900 },
      // pageDimensions is completely missing
    };

    const norm = normalizeClickCoordinate(eventViewportOnly);
    assert.ok(norm);
    assert.strictEqual(norm.system, "viewport");
    assert.strictEqual(norm.normX, 360 / 1440); // 0.25
    assert.strictEqual(norm.normY, 450 / 900); // 0.50
    assert.strictEqual(norm.sourceWidth, 1440);
  });

  it("returns null safely without throwing when coordinates or dimensions are invalid", () => {
    assert.strictEqual(normalizeClickCoordinate(null), null);
    assert.strictEqual(normalizeClickCoordinate({}), null);
    assert.strictEqual(normalizeClickCoordinate({ click: {} }), null);

    // Zero dimensions guard against divide-by-zero
    const zeroDimEvent = {
      click: { pageX: 100, pageY: 200 },
      pageDimensions: { width: 0, height: 0 },
    };
    assert.strictEqual(normalizeClickCoordinate(zeroDimEvent), null);
  });
});

describe("Heatmap — Responsive Event Filtering", () => {
  const sampleEvents = [
    {
      eventId: "e_desktop",
      viewport: { width: 1440, height: 900 },
      click: { pageX: 500, pageY: 300 },
      pageDimensions: { width: 1440, height: 2200 },
    },
    {
      eventId: "e_mobile",
      viewport: { width: 390, height: 844 },
      click: { pageX: 150, pageY: 600 },
      pageDimensions: { width: 390, height: 2800 },
    },
    {
      eventId: "e_tablet",
      viewport: { width: 834, height: 1194 },
      click: { pageX: 400, pageY: 500 },
      pageDimensions: { width: 834, height: 2400 },
    },
  ];

  it("profile 'all' includes all events regardless of viewport width", () => {
    const filtered = filterEventsByViewport(sampleEvents, "all");
    assert.strictEqual(filtered.length, 3);
  });

  it("profile 'desktop' strictly isolates desktop events (width >= 1024px)", () => {
    const filtered = filterEventsByViewport(sampleEvents, "desktop");
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].eventId, "e_desktop");
  });

  it("profile 'mobile' strictly isolates mobile events (width < 768px)", () => {
    const filtered = filterEventsByViewport(sampleEvents, "mobile");
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].eventId, "e_mobile");
  });

  it("intermediate tablet events are excluded from both desktop and mobile profiles", () => {
    const desktopFiltered = filterEventsByViewport(sampleEvents, "desktop");
    const mobileFiltered = filterEventsByViewport(sampleEvents, "mobile");

    assert.ok(!desktopFiltered.some((e) => e.eventId === "e_tablet"));
    assert.ok(!mobileFiltered.some((e) => e.eventId === "e_tablet"));
  });
});

describe("Heatmap — Preview Dimensions & Summaries", () => {
  it("derives preview dimensions matching profile and recorded document heights", () => {
    const events = [
      { pageDimensions: { width: 1440, height: 2500 } },
      { pageDimensions: { width: 1440, height: 1800 } },
    ];

    const desktopDims = calculatePreviewDimensions(events, "desktop");
    assert.strictEqual(desktopDims.width, 1200);
    assert.strictEqual(desktopDims.height, 2500);

    const mobileDims = calculatePreviewDimensions(events, "mobile");
    assert.strictEqual(mobileDims.width, 390);
    assert.strictEqual(mobileDims.height, 2500);
  });

  it("computes comprehensive heatmap summary breakdown accurately", () => {
    const events = [
      {
        viewport: { width: 1440, height: 900 },
        click: { pageX: 100, pageY: 200 },
        pageDimensions: { width: 1440, height: 2000 },
      },
      {
        viewport: { width: 375, height: 667 },
        click: { pageX: 80, pageY: 150 },
        pageDimensions: { width: 375, height: 2200 },
      },
      {
        viewport: { width: 800, height: 1000 },
        click: { x: 50, y: 70 }, // Viewport fallback
        // missing pageDimensions
      },
      {
        viewport: { width: 1200, height: 800 },
        click: { pageX: "invalid" }, // Invalid coord
      },
    ];

    const summary = computeHeatmapSummary(events);
    assert.strictEqual(summary.total, 4);
    assert.strictEqual(summary.desktop, 2);
    assert.strictEqual(summary.mobile, 1);
    assert.strictEqual(summary.intermediate, 1);
    assert.strictEqual(summary.withDocCoords, 2);
    assert.strictEqual(summary.withViewportFallback, 1);
    assert.strictEqual(summary.invalidCoords, 1);
  });

  it("drawHeatmapToCanvas handles empty points and null canvas gracefully without errors", () => {
    assert.doesNotThrow(() => drawHeatmapToCanvas(null, []));

    // Mock canvas context
    let clearRectCalled = false;
    let arcCount = 0;
    const mockCtx = {
      clearRect: () => {
        clearRectCalled = true;
      },
      createRadialGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {
        arcCount++;
      },
      fill: () => {},
      stroke: () => {},
    };
    const mockCanvas = {
      width: 1200,
      height: 2000,
      getContext: () => mockCtx,
    };

    drawHeatmapToCanvas(mockCanvas, [{ x: 100, y: 200 }, { x: 300, y: 400 }]);
    assert.strictEqual(clearRectCalled, true);
    assert.ok(arcCount >= 2);
  });
});
