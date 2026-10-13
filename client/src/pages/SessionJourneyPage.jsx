// client/src/pages/SessionJourneyPage.jsx
// ─────────────────────────────────────────────────────────
// Session Journey Visualization Page
// Displays the chronological interaction timeline for a single session
// fetched from GET /api/sessions/:sessionId/events
// ─────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchSessionEvents } from "../api/client.js";
import { LoadingState } from "../components/LoadingState.jsx";
import { ErrorState } from "../components/ErrorState.jsx";
import { EmptyState } from "../components/EmptyState.jsx";

import {
  formatDuration,
  shortenId,
  formatUrl,
  formatFullDate,
  formatTimeOnly,
} from "../utils/journeyUtils.js";

export function SessionJourneyPage({ sessionId, onBackToSessions }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [copied, setCopied] = useState(false);

  const abortControllerRef = useRef(null);

  const loadJourney = useCallback(
    async (isManualRefresh = false) => {
      if (!sessionId) {
        setError("No session ID specified.");
        setLoading(false);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setErrorStatus(null);

      try {
        const result = await fetchSessionEvents(sessionId, {
          signal: controller.signal,
        });

        const rawEvents = result.data || [];
        // Ensure deterministic chronological ordering
        const sorted = [...rawEvents].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setEvents(sorted);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load session journey.");
          setErrorStatus(err.status || 500);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    loadJourney();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadJourney]);

  const handleCopyId = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(sessionId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  // Derive metrics safely from the real event stream
  const totalEvents = events.length;
  const pageViewsCount = events.filter((e) => e.type === "page_view").length;
  const clicksCount = events.filter((e) => e.type === "click").length;
  const firstEvent = events[0] || null;
  const lastEvent = events[events.length - 1] || null;
  const entryPage = firstEvent ? firstEvent.pageUrl : "—";
  const duration = firstEvent && lastEvent ? formatDuration(firstEvent.timestamp, lastEvent.timestamp) : "0s";

  return (
    <div className="page-container journey-page">
      {/* Top Breadcrumb & Actions */}
      <div className="journey-nav-bar">
        <button
          type="button"
          onClick={onBackToSessions}
          className="btn btn-outline btn-sm back-btn"
          aria-label="Back to all sessions"
        >
          &larr; Back to Sessions
        </button>

        <div className="journey-nav-actions">
          <button
            type="button"
            onClick={() => loadJourney(true)}
            disabled={loading || refreshing}
            className={`btn btn-secondary btn-sm refresh-btn ${refreshing ? "loading" : ""}`}
            title="Refresh session timeline"
          >
            <span className={`refresh-icon ${refreshing ? "spin" : ""}`}>🔄</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Session Title Header */}
      <div className="journey-header">
        <div className="journey-title-group">
          <span className="journey-badge">Session Journey</span>
          <h1 className="journey-title">
            <span className="session-id-full-display" title={sessionId}>
              {shortenId(sessionId)}
            </span>
            <button
              type="button"
              onClick={handleCopyId}
              className="btn btn-outline btn-xs copy-id-btn"
              title="Copy full Session ID"
            >
              {copied ? "✓ Copied" : "📋 Copy ID"}
            </button>
          </h1>
          <p className="journey-subtitle">
            Chronological step-by-step user interactions recorded for this session.
          </p>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      {!loading && !error && events.length > 0 && (
        <div className="metrics-grid journey-metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-label">Session Duration</span>
              <span className="metric-badge">Activity</span>
            </div>
            <div className="metric-value">{duration}</div>
            <div className="metric-caption">
              From {formatTimeOnly(firstEvent?.timestamp)} to {formatTimeOnly(lastEvent?.timestamp)}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-label">Total Events</span>
              <span className="metric-badge">Stream</span>
            </div>
            <div className="metric-value">{totalEvents}</div>
            <div className="metric-caption">Recorded interactions</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-label">Page Views</span>
              <span className="metric-badge badge-pv-text">Navigation</span>
            </div>
            <div className="metric-value">{pageViewsCount}</div>
            <div className="metric-caption">Distinct page visits</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-label">Clicks</span>
              <span className="metric-badge badge-click-text">Interaction</span>
            </div>
            <div className="metric-value">{clicksCount}</div>
            <div className="metric-caption">Tracked button/link clicks</div>
          </div>
        </div>
      )}

      {/* Entry Page banner */}
      {!loading && !error && events.length > 0 && (
        <div className="entry-page-banner">
          <span className="banner-icon">🚪</span>
          <span className="banner-label">Entry Page:</span>
          <code className="banner-url" title={entryPage}>
            {entryPage}
          </code>
          <span className="banner-time">
            Started: {formatFullDate(firstEvent?.timestamp)}
          </span>
        </div>
      )}

      {/* Content States */}
      {loading ? (
        <LoadingState message="Loading chronological journey events from MongoDB…" />
      ) : error ? (
        errorStatus === 404 ? (
          <div className="state-container error-state not-found-state">
            <div className="error-icon">🔍</div>
            <h3 className="error-title">Session Not Found</h3>
            <p className="error-message">
              No events were found for session <code>{shortenId(sessionId)}</code>.
              The session ID may be invalid or its events may have expired.
            </p>
            <div className="not-found-actions">
              <button
                type="button"
                onClick={onBackToSessions}
                className="btn btn-primary"
              >
                Return to Sessions
              </button>
              <button
                type="button"
                onClick={() => loadJourney(false)}
                className="btn btn-secondary"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <ErrorState
            title={errorStatus === 400 ? "Invalid Session ID" : "Could not load journey"}
            message={error}
            onRetry={() => loadJourney(false)}
          />
        )
      ) : events.length === 0 ? (
        <EmptyState
          title="No events found"
          message="This session has no recorded event activity."
          onRefresh={() => loadJourney(true)}
        />
      ) : (
        /* Timeline View */
        <div className="timeline-card">
          <div className="timeline-header">
            <h2 className="timeline-title">Event Timeline ({events.length} steps)</h2>
            <span className="timeline-order-badge">Oldest &rarr; Newest</span>
          </div>

          <ol className="timeline-list">
            {events.map((ev, idx) => {
              const isClick = ev.type === "click";
              const stepNumber = idx + 1;

              return (
                <li key={ev.eventId || idx} className={`timeline-item item-${ev.type}`}>
                  {/* Step Milestone Marker */}
                  <div className="timeline-marker-col">
                    <div className={`timeline-marker marker-${ev.type}`}>
                      {isClick ? "🖱️" : "📄"}
                    </div>
                    {idx < events.length - 1 && <div className="timeline-line"></div>}
                  </div>

                  {/* Event Details Content */}
                  <div className="timeline-content">
                    <div className="timeline-item-header">
                      <div className="timeline-item-title-group">
                        <span className="step-badge">Step #{stepNumber}</span>
                        <span className={`event-type-badge badge-${ev.type}`}>
                          {isClick ? "Click Event" : "Page View"}
                        </span>
                        <span className="timeline-timestamp" title={ev.timestamp}>
                          {formatFullDate(ev.timestamp)}
                        </span>
                      </div>
                      <span className="event-id-subtle" title={`Event ID: ${ev.eventId}`}>
                        {shortenId(ev.eventId)}
                      </span>
                    </div>

                    {/* Page Location */}
                    <div className="timeline-page-row">
                      <span className="page-icon">📍</span>
                      <span className="page-label">Page:</span>
                      <span className="page-path-tag" title={ev.pageUrl}>
                        {formatUrl(ev.pageUrl)}
                      </span>
                      <span className="page-full-url" title={ev.pageUrl}>
                        {ev.pageUrl}
                      </span>
                    </div>

                    {/* Click-Specific Data */}
                    {isClick && ev.click && (
                      <div className="click-details-box">
                        <div className="click-details-grid">
                          {/* Target Element */}
                          <div className="click-detail-item">
                            <span className="detail-label">Clicked Target:</span>
                            <span className="target-tag-pill">
                              &lt;{ev.click.target?.tag || "UNKNOWN"}&gt;
                            </span>
                            {ev.click.target?.id && (
                              <code className="target-id-pill">
                                #{ev.click.target.id}
                              </code>
                            )}
                            {ev.click.target?.class && (
                              <code className="target-class-pill">
                                .{ev.click.target.class}
                              </code>
                            )}
                          </div>

                          {/* Coordinates */}
                          <div className="click-detail-item">
                            <span className="detail-label">Viewport Position:</span>
                            <span className="coord-value">
                              x: <strong>{ev.click.x}</strong>px, y: <strong>{ev.click.y}</strong>px
                            </span>
                            <span className="coord-type-hint">(Viewport-relative)</span>
                          </div>

                          <div className="click-detail-item">
                            <span className="detail-label">Document Position:</span>
                            <span className="coord-value">
                              pageX: <strong>{ev.click.pageX}</strong>px, pageY: <strong>{ev.click.pageY}</strong>px
                            </span>
                            <span className="coord-type-hint">(Document-relative)</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Viewport & Page Dimensions Footer */}
                    {ev.viewport && ev.pageDimensions && (
                      <div className="timeline-item-meta">
                        <span className="meta-dim">
                          Viewport: {ev.viewport.width} &times; {ev.viewport.height}
                        </span>
                        <span className="meta-separator">&bull;</span>
                        <span className="meta-dim">
                          Page: {ev.pageDimensions.width} &times; {ev.pageDimensions.height}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
