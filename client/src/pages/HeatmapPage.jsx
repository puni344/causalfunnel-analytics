// client/src/pages/HeatmapPage.jsx
// ─────────────────────────────────────────────────────────
// Interactive Click Heatmap Page (Stage 7)
// Visualizes aggregated click density hotspots rendered over an iframe
// using normalized document coordinates from GET /api/clicks.
// ─────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchPages, fetchPageClicks } from "../api/client.js";
import { LoadingState } from "../components/LoadingState.jsx";
import { ErrorState } from "../components/ErrorState.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { formatUrl } from "../utils/journeyUtils.js";
import {
  classifyViewport,
  normalizeClickCoordinate,
  filterEventsByViewport,
  calculatePreviewDimensions,
  computeHeatmapSummary,
  drawHeatmapToCanvas,
  getAvailableViewportWidths,
  projectClickToCanvas,
} from "../utils/heatmapUtils.js";

export function HeatmapPage() {
  const [pages, setPages] = useState([]);
  const [selectedPageUrl, setSelectedPageUrl] = useState("");
  const [clicks, setClicks] = useState([]);
  const [isTruncated, setIsTruncated] = useState(false);

  // Filters & display options
  const [viewportProfile, setViewportProfile] = useState("all"); // "all" | "desktop" | "mobile"
  const [selectedWidth, setSelectedWidth] = useState("approximate"); // number | "approximate"
  const [showPinpoints, setShowPinpoints] = useState(true);
  const [hotspotRadius, setHotspotRadius] = useState(26);
  const [showIframe, setShowIframe] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  // Loading & error states
  const [loadingPages, setLoadingPages] = useState(true);
  const [loadingClicks, setLoadingClicks] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pagesError, setPagesError] = useState(null);
  const [clicksError, setClicksError] = useState(null);

  const canvasRef = useRef(null);
  const clicksAbortControllerRef = useRef(null);
  const pagesAbortControllerRef = useRef(null);

  // 1. Fetch tracked pages on initial mount
  const loadPages = useCallback(async () => {
    if (pagesAbortControllerRef.current) {
      pagesAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    pagesAbortControllerRef.current = controller;

    setLoadingPages(true);
    setPagesError(null);

    try {
      const result = await fetchPages({ signal: controller.signal });
      const pagesList = result.data || [];
      setPages(pagesList);

      // Default select the first page if available
      if (pagesList.length > 0) {
        setSelectedPageUrl((prev) => {
          // If previous selection still exists in the new list, keep it; otherwise pick first
          const exists = pagesList.some((p) => p.pageUrl === prev);
          return exists ? prev : pagesList[0].pageUrl;
        });
      } else {
        setSelectedPageUrl("");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setPagesError(err.message || "Failed to load tracked pages list.");
      }
    } finally {
      setLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    loadPages();
    return () => {
      if (pagesAbortControllerRef.current) {
        pagesAbortControllerRef.current.abort();
      }
    };
  }, [loadPages]);

  // 2. Fetch click events whenever selectedPageUrl changes
  const loadClicksForPage = useCallback(
    async (pageUrl, isManualRefresh = false) => {
      if (!pageUrl) {
        setClicks([]);
        setIsTruncated(false);
        return;
      }

      if (clicksAbortControllerRef.current) {
        clicksAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      clicksAbortControllerRef.current = controller;

      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoadingClicks(true);
      }
      setClicksError(null);
      setIframeError(false);

      try {
        const result = await fetchPageClicks(pageUrl, { signal: controller.signal });
        setClicks(result.data || []);
        setIsTruncated(Boolean(result.meta?.truncated));
      } catch (err) {
        if (err.name !== "AbortError") {
          setClicksError(err.message || "Failed to load click events for this page.");
        }
      } finally {
        setLoadingClicks(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedPageUrl) {
      loadClicksForPage(selectedPageUrl);
    } else {
      setClicks([]);
    }

    return () => {
      if (clicksAbortControllerRef.current) {
        clicksAbortControllerRef.current.abort();
      }
    };
  }, [selectedPageUrl, loadClicksForPage]);

  // Available widths recorded for current profile
  const availableWidths = getAvailableViewportWidths(clicks, viewportProfile);
  const clicksInProfile = filterEventsByViewport(clicks, viewportProfile, null);

  // Active width: ensure selected width is valid for current profile
  const activeSelectedWidth =
    typeof selectedWidth === "number" && availableWidths.some((w) => w.width === selectedWidth)
      ? selectedWidth
      : selectedWidth === "approximate"
      ? "approximate"
      : "approximate";

  const isWidthMatched = typeof activeSelectedWidth === "number";

  // Calculate filtered events and metrics
  const filteredEvents = filterEventsByViewport(
    clicks,
    viewportProfile,
    isWidthMatched ? activeSelectedWidth : null
  );
  const summary = computeHeatmapSummary(clicks);
  const previewDims = calculatePreviewDimensions(
    filteredEvents,
    viewportProfile,
    isWidthMatched ? activeSelectedWidth : null
  );

  // Selected page metadata from pages list
  const selectedPageMeta = pages.find((p) => p.pageUrl === selectedPageUrl) || null;

  // 3. Render canvas overlay whenever data, dimensions, or display options change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas logical coordinate resolution matching the preview frame
    canvas.width = previewDims.width;
    canvas.height = previewDims.height;

    // Map each filtered click event to canvas (x, y) using resolution-aware projection
    const points = [];
    for (const ev of filteredEvents) {
      const proj = projectClickToCanvas(ev, previewDims);
      if (proj) {
        points.push({
          x: proj.x,
          y: proj.y,
        });
      }
    }

    drawHeatmapToCanvas(canvas, points, {
      radius: hotspotRadius,
      showPinpoints,
    });
  }, [filteredEvents, previewDims.width, previewDims.height, hotspotRadius, showPinpoints]);

  const handlePageSelectChange = (e) => {
    setSelectedPageUrl(e.target.value);
  };

  const handleManualRefresh = () => {
    if (selectedPageUrl) {
      loadClicksForPage(selectedPageUrl, true);
    } else {
      loadPages();
    }
  };

  return (
    <div className="page-container heatmap-page">
      {/* Top Header */}
      <div className="page-header heatmap-header">
        <div>
          <div className="heatmap-badge-row">
            <span className="badge badge-heatmap">Stage 7</span>
            <span className="heatmap-status-indicator">● Live Hotspots</span>
          </div>
          <h1 className="page-title">Interactive Click Heatmap</h1>
          <p className="page-description">
            Spatial click density visualization overlaid directly onto the live website.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loadingPages || loadingClicks || refreshing}
            className={`btn btn-secondary refresh-btn ${refreshing ? "loading" : ""}`}
            title="Refresh click analytics from MongoDB"
          >
            <span className={`refresh-icon ${refreshing ? "spin" : ""}`}>🔄</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Main Pages Loading / Error States */}
      {loadingPages ? (
        <LoadingState message="Loading tracked pages from MongoDB Atlas…" />
      ) : pagesError ? (
        <ErrorState
          title="Could not load tracked pages"
          message={pagesError}
          onRetry={loadPages}
        />
      ) : pages.length === 0 ? (
        <EmptyState
          title="No Tracked Pages Found"
          message="No pages have recorded user activity yet. Visit the demo site on http://localhost:4000/demo/index.html to trigger page views and clicks."
          onRefresh={loadPages}
        />
      ) : (
        <>
          {/* Controls Panel Card */}
          <div className="heatmap-controls-card">
            <div className="controls-grid">
              {/* Page Selector */}
              <div className="control-group page-selector-group">
                <label htmlFor="heatmap-page-select" className="control-label">
                  Selected Page:
                </label>
                <div className="select-wrapper">
                  <select
                    id="heatmap-page-select"
                    value={selectedPageUrl}
                    onChange={handlePageSelectChange}
                    className="select-input"
                    disabled={loadingClicks || refreshing}
                  >
                    {pages.map((p) => (
                      <option key={p.pageUrl} value={p.pageUrl}>
                        {formatUrl(p.pageUrl)} ({p.clicks || 0} clicks, {p.pageViews || 0} views)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="selected-page-url-subtext" title={selectedPageUrl}>
                  {selectedPageUrl}
                </div>
              </div>

              {/* Viewport Filter */}
              <div className="control-group viewport-filter-group">
                <label className="control-label">Viewport Profile:</label>
                <div className="btn-group viewport-buttons" role="group" aria-label="Viewport Profile">
                  <button
                    type="button"
                    onClick={() => setViewportProfile("all")}
                    className={`btn btn-sm ${viewportProfile === "all" ? "btn-primary" : "btn-outline"}`}
                    title="All viewport sizes (aggregated)"
                  >
                    All ({summary.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewportProfile("desktop")}
                    className={`btn btn-sm ${viewportProfile === "desktop" ? "btn-primary" : "btn-outline"}`}
                    title="Desktop viewports (width >= 1024px)"
                  >
                    Desktop ({summary.desktop})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewportProfile("mobile")}
                    className={`btn btn-sm ${viewportProfile === "mobile" ? "btn-primary" : "btn-outline"}`}
                    title="Mobile viewports (width < 768px)"
                  >
                    Mobile ({summary.mobile})
                  </button>
                </div>
                <div className="viewport-hint">
                  {viewportProfile === "all" && "All viewports aggregated (responsive reflows may shift elements)"}
                  {viewportProfile === "desktop" && "Desktop events: width ≥ 1024 CSS px"}
                  {viewportProfile === "mobile" && "Mobile events: width < 768 CSS px"}
                </div>
              </div>

              {/* Resolution / Width-Matched Selector */}
              <div className="control-group resolution-filter-group">
                <label htmlFor="heatmap-resolution-select" className="control-label">
                  Preview Resolution:
                </label>
                <div className="select-wrapper">
                  <select
                    id="heatmap-resolution-select"
                    value={activeSelectedWidth}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedWidth(val === "approximate" ? "approximate" : Number(val));
                    }}
                    className="select-input"
                    disabled={loadingClicks || refreshing || clicks.length === 0}
                  >
                    <option value="approximate">
                      All Widths (Approximate) — {clicksInProfile.length} clicks
                    </option>
                    {availableWidths.map(({ width, count }) => (
                      <option key={width} value={width}>
                        {width}px Width-Matched (Exact) — {count} clicks
                      </option>
                    ))}
                  </select>
                </div>
                <div className="viewport-hint">
                  {isWidthMatched ? (
                    <span style={{ color: "#10b981", fontWeight: 600 }}>
                      🎯 {previewDims.width}px Matched ({filteredEvents.length} clicks) — Sub-pixel aligned
                    </span>
                  ) : (
                    <span style={{ color: "#d97706" }}>
                      ⚠️ {previewDims.width}px Preview (Approximate across {availableWidths.length} widths)
                    </span>
                  )}
                </div>
              </div>

              {/* Display Options */}
              <div className="control-group display-options-group">
                <label className="control-label">Display Options:</label>
                <div className="display-toggles">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={showIframe}
                      onChange={(e) => setShowIframe(e.target.checked)}
                    />
                    <span>Show Page Preview</span>
                  </label>
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={showPinpoints}
                      onChange={(e) => setShowPinpoints(e.target.checked)}
                    />
                    <span>Click Pinpoints</span>
                  </label>
                </div>
                <div className="slider-row">
                  <span className="slider-label">Radius: {hotspotRadius}px</span>
                  <input
                    type="range"
                    min="15"
                    max="50"
                    value={hotspotRadius}
                    onChange={(e) => setHotspotRadius(Number(e.target.value))}
                    className="range-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Metrics Summary Strip */}
          <div className="metrics-grid heatmap-metrics-grid">
            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-label">Hotspots Rendered</span>
                <span className="metric-badge">In View</span>
              </div>
              <div className="metric-value">{filteredEvents.length}</div>
              <div className="metric-caption">
                {isWidthMatched
                  ? `Matching ${previewDims.width}px resolution`
                  : viewportProfile === "all"
                  ? "Across all device sizes"
                  : `Matching ${viewportProfile} profile`}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-label">Total Page Clicks</span>
                <span className="metric-badge">All Time</span>
              </div>
              <div className="metric-value">{summary.total}</div>
              <div className="metric-caption">
                Recorded for {formatUrl(selectedPageUrl)}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-label">Page Views</span>
                <span className="metric-badge badge-pv-text">Audience</span>
              </div>
              <div className="metric-value">{selectedPageMeta?.pageViews || 0}</div>
              <div className="metric-caption">Total visits captured</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-label">Preview Mode</span>
                <span className="metric-badge">{isWidthMatched ? "Exact" : "Approximate"}</span>
              </div>
              <div className="metric-value">
                {isWidthMatched ? `${previewDims.width}px` : "Multi-Width"}
              </div>
              <div className="metric-caption">
                {isWidthMatched
                  ? `${filteredEvents.length} clicks at recorded resolution`
                  : `Aggregate view (${availableWidths.length} recorded widths)`}
              </div>
            </div>
          </div>

          {/* Truncation Warning Alert */}
          {isTruncated && (
            <div className="truncation-alert">
              <span className="alert-icon">⚠️</span>
              <div className="alert-text">
                <strong>High Click Density Truncation:</strong> This page exceeds the maximum
                API query threshold of 5,000 click events. The most recent 5,000 clicks are rendered.
              </div>
            </div>
          )}

          {/* Approximate Multi-Width Warning Banner */}
          {!isWidthMatched && availableWidths.length > 1 && (
            <div className="truncation-alert approximate-alert">
              <span className="alert-icon">ℹ️</span>
              <div className="alert-text">
                <strong>Multi-Resolution Aggregate View (Approximate):</strong> Clicks recorded across {availableWidths.length} different screen widths ({availableWidths.map((w) => `${w.width}px`).join(", ")}) are projected onto an aggregate {previewDims.width}px preview. Responsive element reflows and container margins may shift elements. For sub-pixel element alignment, select a width-matched resolution above.
              </div>
            </div>
          )}

          {/* Clicks Loading or Error State */}
          {loadingClicks ? (
            <LoadingState message={`Loading click events for ${formatUrl(selectedPageUrl)}…`} />
          ) : clicksError ? (
            <ErrorState
              title="Could not load clicks"
              message={clicksError}
              onRetry={() => loadClicksForPage(selectedPageUrl)}
            />
          ) : clicks.length === 0 ? (
            <div className="state-container empty-clicks-card">
              <div className="empty-icon">📍</div>
              <h3 className="empty-title">No Click Events for This Page</h3>
              <p className="empty-message">
                This page has recorded page views, but no user clicks have been tracked yet.
              </p>
              <div className="empty-actions">
                <a
                  href={selectedPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  Open Page & Click Elements ↗
                </a>
                <button
                  type="button"
                  onClick={() => loadClicksForPage(selectedPageUrl, true)}
                  className="btn btn-secondary"
                >
                  Refresh Clicks
                </button>
              </div>
            </div>
          ) : (
            /* Heatmap Canvas & Iframe Preview Stage */
            <div className="heatmap-stage-container">
              {/* Heatmap Legend Bar */}
              <div className="heatmap-legend-bar">
                <div className="legend-title">Density Intensity:</div>
                <div className="legend-gradient-wrapper">
                  <span className="legend-label">Low</span>
                  <div className="legend-gradient-bar" aria-hidden="true"></div>
                  <span className="legend-label">High</span>
                </div>
                <div className="legend-dimensions-tag">
                  Preview Frame: {previewDims.width}px &times; {previewDims.height}px {isWidthMatched ? "(Width-Matched: Exact Alignment)" : "(Aggregate: Approximate)"}
                </div>
              </div>

              {/* Iframe Fallback Banner if embedding fails */}
              {iframeError && (
                <div className="iframe-fallback-banner">
                  <span className="fallback-icon">🛡️</span>
                  <div className="fallback-info">
                    <strong>Preview restricted:</strong> The browser or website security policy
                    prevented direct iframe embedding for this URL.
                  </div>
                  <a
                    href={selectedPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-xs fallback-link-btn"
                  >
                    Open Page in New Tab ↗
                  </a>
                </div>
              )}

              {/* Preview Window Box */}
              <div className="preview-viewport-scroll">
                <div
                  className={`preview-canvas-wrapper profile-${viewportProfile}`}
                  style={{
                    width: `${previewDims.width}px`,
                    height: `${previewDims.height}px`,
                  }}
                >
                  {/* Underlay Iframe */}
                  {showIframe && !iframeError && (
                    <iframe
                      src={selectedPageUrl}
                      title="Heatmap Target Webpage Preview"
                      className="preview-iframe"
                      width={previewDims.width}
                      height={previewDims.height}
                      onError={() => setIframeError(true)}
                    />
                  )}

                  {/* Hotspots Overlay Canvas */}
                  <canvas
                    ref={canvasRef}
                    className="preview-canvas"
                    width={previewDims.width}
                    height={previewDims.height}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
