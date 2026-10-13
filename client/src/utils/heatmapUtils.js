// client/src/utils/heatmapUtils.js
// ─────────────────────────────────────────────────────────
// Pure utilities for Heatmap coordinate normalization,
// viewport classification, event filtering, and canvas drawing.
// ─────────────────────────────────────────────────────────

/**
 * Categorizes a viewport width into Mobile, Desktop, or Intermediate.
 *
 * Thresholds:
 *   - Mobile: < 768 CSS pixels (e.g. mobile phones)
 *   - Desktop: >= 1024 CSS pixels (e.g. laptops and desktops)
 *   - Intermediate: >= 768 and < 1024 CSS pixels (tablets, included in "All" only)
 *
 * @param {number|null|undefined} width
 * @returns {"mobile" | "desktop" | "intermediate" | "unknown"}
 */
export function classifyViewport(width) {
  if (typeof width !== "number" || isNaN(width) || width <= 0) {
    return "unknown";
  }
  if (width < 768) {
    return "mobile";
  }
  if (width >= 1024) {
    return "desktop";
  }
  return "intermediate";
}

/**
 * Normalizes an event's click coordinates relative to document dimensions.
 *
 * Primary: Document-relative coordinates (pageX / pageDimensions.width, pageY / pageDimensions.height).
 * Fallback: Viewport-relative coordinates (x / viewport.width, y / viewport.height) only when
 *           document dimensions are missing or invalid.
 *
 * @param {object} event
 * @returns {{
 *   normX: number,
 *   normY: number,
 *   system: "document" | "viewport",
 *   rawX: number,
 *   rawY: number,
 *   sourceWidth: number,
 *   sourceHeight: number
 * } | null}
 */
export function normalizeClickCoordinate(event) {
  if (!event || !event.click) return null;

  const { click, pageDimensions, viewport } = event;

  // Primary: document-relative coordinates
  const hasPageCoords =
    typeof click.pageX === "number" &&
    !isNaN(click.pageX) &&
    typeof click.pageY === "number" &&
    !isNaN(click.pageY);

  const hasValidPageDims =
    pageDimensions &&
    typeof pageDimensions.width === "number" &&
    pageDimensions.width > 0 &&
    typeof pageDimensions.height === "number" &&
    pageDimensions.height > 0;

  if (hasPageCoords && hasValidPageDims) {
    const normX = Math.max(0, Math.min(1, click.pageX / pageDimensions.width));
    const normY = Math.max(0, Math.min(1, click.pageY / pageDimensions.height));

    return {
      normX,
      normY,
      system: "document",
      rawX: click.pageX,
      rawY: click.pageY,
      sourceWidth: pageDimensions.width,
      sourceHeight: pageDimensions.height,
    };
  }

  // Explicit fallback: viewport-relative coordinates
  const hasViewportCoords =
    typeof click.x === "number" &&
    !isNaN(click.x) &&
    typeof click.y === "number" &&
    !isNaN(click.y);

  const hasValidViewportDims =
    viewport &&
    typeof viewport.width === "number" &&
    viewport.width > 0 &&
    typeof viewport.height === "number" &&
    viewport.height > 0;

  if (hasViewportCoords && hasValidViewportDims) {
    const normX = Math.max(0, Math.min(1, click.x / viewport.width));
    const normY = Math.max(0, Math.min(1, click.y / viewport.height));

    return {
      normX,
      normY,
      system: "viewport",
      rawX: click.x,
      rawY: click.y,
      sourceWidth: viewport.width,
      sourceHeight: viewport.height,
    };
  }

  return null;
}

/**
 * Extracts distinct recorded viewport widths from events matching the given profile.
 *
 * @param {Array} events
 * @param {"all" | "desktop" | "mobile"} [profile="all"]
 * @returns {Array<{ width: number, count: number }>} Sorted descending by width
 */
export function getAvailableViewportWidths(events = [], profile = "all") {
  if (!Array.isArray(events)) return [];
  const matching = profile === "all" ? events : filterEventsByViewport(events, profile, null);
  const countByWidth = new Map();

  for (const ev of matching) {
    const w = ev.viewport?.width;
    if (typeof w === "number" && !isNaN(w) && w > 0) {
      countByWidth.set(w, (countByWidth.get(w) || 0) + 1);
    }
  }

  return Array.from(countByWidth.entries())
    .map(([width, count]) => ({ width, count }))
    .sort((a, b) => b.width - a.width);
}

/**
 * Filters click events by responsive viewport profile and optional width-matched resolution.
 *
 * @param {Array} events
 * @param {"all" | "desktop" | "mobile"} [profile="all"]
 * @param {number|null|"approximate"} [selectedWidth=null]
 * @returns {Array}
 */
export function filterEventsByViewport(events = [], profile = "all", selectedWidth = null) {
  if (!Array.isArray(events)) return [];

  let filtered = events;
  if (profile !== "all") {
    filtered = filtered.filter((ev) => {
      const width = ev.viewport?.width;
      const category = classifyViewport(width);
      return category === profile;
    });
  }

  if (typeof selectedWidth === "number" && selectedWidth > 0) {
    filtered = filtered.filter((ev) => ev.viewport?.width === selectedWidth);
  }

  return filtered;
}

/**
 * Calculates logical preview container dimensions based on profile, selected width, and event metadata.
 *
 * @param {Array} events
 * @param {"all" | "desktop" | "mobile"} [profile="all"]
 * @param {number|null|"approximate"} [selectedWidth=null]
 * @returns {{ width: number, height: number, isWidthMatched: boolean }}
 */
export function calculatePreviewDimensions(events = [], profile = "all", selectedWidth = null) {
  const isWidthMatched = typeof selectedWidth === "number" && selectedWidth > 0;
  let profileWidth = 1200;

  if (isWidthMatched) {
    profileWidth = selectedWidth;
  } else if (profile === "mobile") {
    profileWidth = 390;
  }

  // Derive height from recorded pageDimensions of matching events only
  const validHeights = events
    .map((e) => e.pageDimensions?.height)
    .filter((h) => typeof h === "number" && h > 0);

  let derivedHeight = 2000;
  if (validHeights.length > 0) {
    // Use the maximum recorded height within this event population or at least 1400px
    const maxHeight = Math.max(...validHeights);
    derivedHeight = Math.max(1400, Math.min(6000, maxHeight));
  } else if (profile === "mobile" || (isWidthMatched && selectedWidth < 768)) {
    derivedHeight = 2400; // Mobile pages are typically taller vertically
  }

  return {
    width: profileWidth,
    height: derivedHeight,
    isWidthMatched,
  };
}

/**
 * Projects an event's click coordinates onto preview canvas coordinates.
 *
 * For width-matched previews where preview width equals recorded document or viewport width,
 * uses direct 1-to-1 pixel coordinates to guarantee sub-pixel alignment across centered
 * containers and complex CSS layouts.
 *
 * When source and destination widths genuinely differ (e.g. aggregate approximate mode),
 * applies proportional normalization with safe clamping.
 *
 * @param {object} event
 * @param {{ width: number, height: number }} previewDims
 * @returns {{
 *   x: number,
 *   y: number,
 *   system: "document" | "viewport",
 *   isExact: boolean
 * } | null}
 */
export function projectClickToCanvas(event, previewDims) {
  if (!event || !event.click || !previewDims) return null;
  const { click, pageDimensions, viewport } = event;
  const destWidth = previewDims.width;
  const destHeight = previewDims.height;

  if (
    typeof destWidth !== "number" ||
    isNaN(destWidth) ||
    destWidth <= 0 ||
    typeof destHeight !== "number" ||
    isNaN(destHeight) ||
    destHeight <= 0
  ) {
    return null;
  }

  const hasPageX = typeof click.pageX === "number" && !isNaN(click.pageX) && click.pageX >= 0;
  const hasPageY = typeof click.pageY === "number" && !isNaN(click.pageY) && click.pageY >= 0;
  const srcDocWidth = pageDimensions?.width;
  const srcDocHeight = pageDimensions?.height;
  const hasValidPageDims =
    typeof srcDocWidth === "number" &&
    srcDocWidth > 0 &&
    typeof srcDocHeight === "number" &&
    srcDocHeight > 0;

  // 1. Primary: Document-relative coordinates
  if (hasPageX && hasPageY) {
    let x, y;
    let isExact = false;

    // Check if destination width matches source recorded width (width-matched mode)
    const isExactWidth =
      (hasValidPageDims && srcDocWidth === destWidth) ||
      (viewport?.width === destWidth);

    if (isExactWidth) {
      x = click.pageX;
      isExact = true;
    } else if (hasValidPageDims) {
      const normX = Math.max(0, Math.min(1, click.pageX / srcDocWidth));
      x = normX * destWidth;
    } else if (typeof viewport?.width === "number" && viewport.width > 0) {
      const normX = Math.max(0, Math.min(1, click.pageX / viewport.width));
      x = normX * destWidth;
    } else {
      return null;
    }

    // Height projection
    if (hasValidPageDims && srcDocHeight === destHeight) {
      y = click.pageY;
    } else if (hasValidPageDims) {
      const normY = Math.max(0, Math.min(1, click.pageY / srcDocHeight));
      y = normY * destHeight;
    } else {
      y = click.pageY;
    }

    // Clamp within destination canvas boundary
    x = Math.max(0, Math.min(destWidth, x));
    y = Math.max(0, Math.min(destHeight, y));

    return {
      x,
      y,
      system: "document",
      isExact,
    };
  }

  // 2. Fallback: Viewport-relative coordinates (when pageX/pageY absent)
  const hasViewX = typeof click.x === "number" && !isNaN(click.x) && click.x >= 0;
  const hasViewY = typeof click.y === "number" && !isNaN(click.y) && click.y >= 0;
  const vWidth = viewport?.width;
  const vHeight = viewport?.height;
  const hasValidViewportDims =
    typeof vWidth === "number" && vWidth > 0 && typeof vHeight === "number" && vHeight > 0;

  if (hasViewX && hasViewY && hasValidViewportDims) {
    let x, y;
    let isExact = false;

    if (vWidth === destWidth) {
      x = click.x;
      isExact = true;
    } else {
      x = Math.max(0, Math.min(1, click.x / vWidth)) * destWidth;
    }

    if (vHeight === destHeight) {
      y = click.y;
    } else {
      y = Math.max(0, Math.min(1, click.y / vHeight)) * destHeight;
    }

    x = Math.max(0, Math.min(destWidth, x));
    y = Math.max(0, Math.min(destHeight, y));

    return {
      x,
      y,
      system: "viewport",
      isExact,
    };
  }

  return null;
}

/**
 * Computes summary counts across raw click events.
 *
 * @param {Array} events
 * @returns {{
 *   total: number,
 *   desktop: number,
 *   mobile: number,
 *   intermediate: number,
 *   unknown: number,
 *   withDocCoords: number,
 *   withViewportFallback: number,
 *   invalidCoords: number
 * }}
 */
export function computeHeatmapSummary(events = []) {
  let desktop = 0;
  let mobile = 0;
  let intermediate = 0;
  let unknown = 0;
  let withDocCoords = 0;
  let withViewportFallback = 0;
  let invalidCoords = 0;

  for (const ev of events) {
    const cat = classifyViewport(ev.viewport?.width);
    if (cat === "desktop") desktop++;
    else if (cat === "mobile") mobile++;
    else if (cat === "intermediate") intermediate++;
    else unknown++;

    const norm = normalizeClickCoordinate(ev);
    if (!norm) {
      invalidCoords++;
    } else if (norm.system === "document") {
      withDocCoords++;
    } else {
      withViewportFallback++;
    }
  }

  return {
    total: events.length,
    desktop,
    mobile,
    intermediate,
    unknown,
    withDocCoords,
    withViewportFallback,
    invalidCoords,
  };
}

/**
 * Renders heat hotspots on a 2D HTML5 canvas.
 *
 * Utilizes radial gradients and additive color layering to display
 * hotspot density without creating individual DOM elements.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ x: number, y: number }>} points
 * @param {object} [options]
 * @param {number} [options.radius=26]
 * @param {boolean} [options.showPinpoints=true]
 */
export function drawHeatmapToCanvas(canvas, points, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { radius = 26, showPinpoints = true } = options;
  const width = canvas.width;
  const height = canvas.height;

  // Clear previous drawing
  ctx.clearRect(0, 0, width, height);

  if (!points || points.length === 0) return;

  // Pass 1: Render radial glow with additive blending
  ctx.save();
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (typeof pt.x !== "number" || typeof pt.y !== "number") continue;

    const radGrad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
    // Multi-stop heat gradient from warm core to subtle cyan periphery
    radGrad.addColorStop(0, "rgba(239, 68, 68, 0.45)"); // Core Red (high density)
    radGrad.addColorStop(0.25, "rgba(249, 115, 22, 0.35)"); // Orange
    radGrad.addColorStop(0.55, "rgba(234, 179, 8, 0.22)"); // Yellow
    radGrad.addColorStop(0.85, "rgba(6, 182, 212, 0.12)"); // Cyan glow
    radGrad.addColorStop(1, "rgba(6, 182, 212, 0)"); // Transparent edge

    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Pass 2: Sharp pinpoint markers for precise coordinate verification
  if (showPinpoints) {
    ctx.save();
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (typeof pt.x !== "number" || typeof pt.y !== "number") continue;

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
}
