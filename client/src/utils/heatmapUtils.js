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
 * Filters click events by responsive viewport profile.
 *
 * @param {Array} events
 * @param {"all" | "desktop" | "mobile"} profile
 * @returns {Array}
 */
export function filterEventsByViewport(events = [], profile = "all") {
  if (!Array.isArray(events)) return [];
  if (profile === "all") return events;

  return events.filter((ev) => {
    const width = ev.viewport?.width;
    const category = classifyViewport(width);
    return category === profile;
  });
}

/**
 * Calculates logical preview container dimensions based on profile and event metadata.
 *
 * @param {Array} events
 * @param {"all" | "desktop" | "mobile"} profile
 * @returns {{ width: number, height: number }}
 */
export function calculatePreviewDimensions(events = [], profile = "all") {
  const profileWidth = profile === "mobile" ? 390 : 1200;

  // Derive height from recorded pageDimensions of matching events
  const validHeights = events
    .map((e) => e.pageDimensions?.height)
    .filter((h) => typeof h === "number" && h > 0);

  let derivedHeight = 2000;
  if (validHeights.length > 0) {
    // Use the maximum recorded height or at least 1400px
    const maxHeight = Math.max(...validHeights);
    derivedHeight = Math.max(1400, Math.min(6000, maxHeight));
  } else if (profile === "mobile") {
    derivedHeight = 2400; // Mobile pages are typically taller vertically
  }

  return {
    width: profileWidth,
    height: derivedHeight,
  };
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
