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
  getAvailableViewportWidths,
  projectClickToCanvas,
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

describe("Heatmap — Resolution-Aware Alignment & Projection", () => {
  // Test 1: Width-matched events use their actual recorded viewport width
  it("extracts distinct recorded viewport widths accurately", () => {
    const sampleEvents = [
      { viewport: { width: 1440 } },
      { viewport: { width: 1440 } },
      { viewport: { width: 1920 } },
      { viewport: { width: 1200 } },
      { viewport: { width: 390 } },
      { viewport: { width: 0 } }, // invalid
      { viewport: null },
    ];

    const widths = getAvailableViewportWidths(sampleEvents, "all");
    assert.deepStrictEqual(widths, [
      { width: 1920, count: 1 },
      { width: 1440, count: 2 },
      { width: 1200, count: 1 },
      { width: 390, count: 1 },
    ]);

    const desktopWidths = getAvailableViewportWidths(sampleEvents, "desktop");
    assert.deepStrictEqual(desktopWidths, [
      { width: 1920, count: 1 },
      { width: 1440, count: 2 },
      { width: 1200, count: 1 },
    ]);
  });

  // Test 2: A centered max-width container aligns at its matching preview width
  it("aligns a centered max-width container element at matching preview width (offset = 0px)", () => {
    // In a 1440px viewport with a 1000px centered container (left margin = 220px),
    // an element 311px inside the container has pageX = 220 + 311 = 531px.
    const event1440 = {
      click: { pageX: 531, pageY: 338 },
      pageDimensions: { width: 1440, height: 2691 },
      viewport: { width: 1440, height: 900 },
    };

    const previewDims1440 = { width: 1440, height: 2691 };
    const projected = projectClickToCanvas(event1440, previewDims1440);

    assert.ok(projected);
    assert.strictEqual(projected.isExact, true);
    assert.strictEqual(projected.x, 531);
    assert.strictEqual(projected.y, 338);

    // Physical target in 1440px iframe is also at 220 + 311 = 531px.
    const targetCenterIn1440Iframe = 531;
    const offset = Math.abs(projected.x - targetCenterIn1440Iframe);
    assert.ok(offset <= 10, `Expected offset <= 10px, got ${offset}px`);
    assert.strictEqual(offset, 0);
  });

  // Test 3: A 1200px event is not silently treated as an exact 1440px event
  it("does not treat a 1200px event as exact when rendered in a 1440px preview", () => {
    // In a 1200px viewport (left margin = 100px), element at 311px has pageX = 100 + 311 = 411px.
    const event1200 = {
      click: { pageX: 411, pageY: 338 },
      pageDimensions: { width: 1200, height: 2691 },
      viewport: { width: 1200, height: 800 },
    };

    const previewDims1440 = { width: 1440, height: 2691 };
    const projected = projectClickToCanvas(event1200, previewDims1440);

    assert.ok(projected);
    assert.strictEqual(projected.isExact, false); // Not exact
    // Proportional projection: (411 / 1200) * 1440 = 493.2px
    assert.strictEqual(projected.x, (411 / 1200) * 1440);
    // In 1440px iframe, target is at 531px, showing that 1200px and 1440px cannot be treated identically
    const targetIn1440 = 531;
    assert.notStrictEqual(projected.x, targetIn1440);
  });

  // Test 4: A 1440px event aligns when rendered at a compatible 1440px preview
  it("aligns a 1440px event on Card Alpha when rendered at a compatible 1440px preview", () => {
    // Card Alpha in column 1: xe = 126.5px. In 1440px viewport: pageX = 220 + 126.5 = 346.5px.
    const eventCardAlpha1440 = {
      click: { pageX: 346.5, pageY: 652 },
      pageDimensions: { width: 1440, height: 2691 },
      viewport: { width: 1440, height: 900 },
    };

    const previewDims = calculatePreviewDimensions([eventCardAlpha1440], "desktop", 1440);
    assert.strictEqual(previewDims.width, 1440);
    assert.strictEqual(previewDims.isWidthMatched, true);

    const projected = projectClickToCanvas(eventCardAlpha1440, previewDims);
    assert.ok(projected);
    assert.strictEqual(projected.isExact, true);
    assert.strictEqual(projected.x, 346.5);
    assert.strictEqual(projected.y, 652);

    const targetCenter = 220 + 126.5;
    assert.strictEqual(Math.abs(projected.x - targetCenter), 0);
  });

  // Test 5: A 1920px event aligns when rendered at a compatible 1920px preview
  it("aligns a 1920px event on Card Alpha when rendered at a compatible 1920px preview", () => {
    // In 1920px viewport (left margin = 460px): pageX = 460 + 126.5 = 586.5px.
    const eventCardAlpha1920 = {
      click: { pageX: 586.5, pageY: 652 },
      pageDimensions: { width: 1920, height: 2691 },
      viewport: { width: 1920, height: 1080 },
    };

    const previewDims = calculatePreviewDimensions([eventCardAlpha1920], "desktop", 1920);
    assert.strictEqual(previewDims.width, 1920);
    assert.strictEqual(previewDims.isWidthMatched, true);

    const projected = projectClickToCanvas(eventCardAlpha1920, previewDims);
    assert.ok(projected);
    assert.strictEqual(projected.isExact, true);
    assert.strictEqual(projected.x, 586.5);
    assert.strictEqual(projected.y, 652);

    const targetCenter = 460 + 126.5;
    assert.strictEqual(Math.abs(projected.x - targetCenter), 0);
  });

  // Test 6: The All profile is explicitly approximate when widths differ
  it("labels projection as non-exact when rendered in an aggregate preview with differing widths", () => {
    // 1920px click rendered on 1200px aggregate preview
    const event1920 = {
      click: { pageX: 586.5, pageY: 652 },
      pageDimensions: { width: 1920, height: 2691 },
      viewport: { width: 1920, height: 1080 },
    };

    const previewDims1200 = calculatePreviewDimensions([event1920], "all", null);
    assert.strictEqual(previewDims1200.width, 1200);
    assert.strictEqual(previewDims1200.isWidthMatched, false);

    const projected = projectClickToCanvas(event1920, previewDims1200);
    assert.ok(projected);
    assert.strictEqual(projected.isExact, false); // Approximate

    // Projected position drifts from what a 1200px container element would be (226.5px)
    const expectedApproxX = (586.5 / 1920) * 1200; // ~366.56px
    assert.strictEqual(projected.x, expectedApproxX);
    const targetIn1200 = 100 + 126.5; // 226.5px
    const offset = Math.abs(projected.x - targetIn1200);
    assert.ok(offset > 100, `Expected large drift in aggregate mode, got ${offset}px`);
  });

  // Test 7: Invalid dimensions and absent coordinates do not generate invalid drawing positions
  it("returns null safely for invalid dimensions, absent coordinates, and zero widths", () => {
    const validDims = { width: 1440, height: 2000 };

    assert.strictEqual(projectClickToCanvas(null, validDims), null);
    assert.strictEqual(projectClickToCanvas({}, validDims), null);
    assert.strictEqual(projectClickToCanvas({ click: null }, validDims), null);
    assert.strictEqual(projectClickToCanvas({ click: { pageX: NaN, pageY: 100 } }, validDims), null);
    assert.strictEqual(projectClickToCanvas({ click: { pageX: -5, pageY: 100 } }, validDims), null);

    // Invalid preview dimensions
    const validEvent = { click: { pageX: 100, pageY: 200 }, pageDimensions: { width: 1440, height: 2000 } };
    assert.strictEqual(projectClickToCanvas(validEvent, null), null);
    assert.strictEqual(projectClickToCanvas(validEvent, { width: 0, height: 2000 }), null);
    assert.strictEqual(projectClickToCanvas(validEvent, { width: -100, height: 2000 }), null);
    assert.strictEqual(projectClickToCanvas(validEvent, { width: 1440, height: 0 }), null);
  });

  // Test 8: Preview height is derived from the selected width population rather than unrelated viewport profiles
  it("derives preview height strictly from the selected width population without mixing mobile heights", () => {
    const desktop1440Events = [
      {
        viewport: { width: 1440 },
        pageDimensions: { width: 1440, height: 2691 },
      },
    ];

    const mobileEvents = [
      {
        viewport: { width: 390 },
        pageDimensions: { width: 390, height: 3474 },
      },
    ];

    // When desktop1440Events is the filtered population:
    const desktopDims = calculatePreviewDimensions(desktop1440Events, "desktop", 1440);
    assert.strictEqual(desktopDims.height, 2691); // Not 3474!

    // When mobile is selected:
    const mobileDims = calculatePreviewDimensions(mobileEvents, "mobile", 390);
    assert.strictEqual(mobileDims.height, 3474);
  });

  // Test 9: Existing Mobile, Desktop and All filtering still works
  it("preserves backward-compatible profile filtering without selectedWidth", () => {
    const events = [
      { viewport: { width: 1440 } },
      { viewport: { width: 1920 } },
      { viewport: { width: 800 } },  // intermediate
      { viewport: { width: 390 } },  // mobile
    ];

    const all = filterEventsByViewport(events, "all");
    assert.strictEqual(all.length, 4);

    const desktop = filterEventsByViewport(events, "desktop");
    assert.strictEqual(desktop.length, 2);

    const mobile = filterEventsByViewport(events, "mobile");
    assert.strictEqual(mobile.length, 1);

    // With specific width filter:
    const specific1440 = filterEventsByViewport(events, "desktop", 1440);
    assert.strictEqual(specific1440.length, 1);
  });
});
