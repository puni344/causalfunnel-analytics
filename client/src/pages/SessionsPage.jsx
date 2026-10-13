// client/src/pages/SessionsPage.jsx
// ─────────────────────────────────────────────────────────
// Sessions Overview Page
// Fetches real session aggregations from GET /api/sessions
// ─────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchSessions } from "../api/client.js";
import { LoadingState } from "../components/LoadingState.jsx";
import { ErrorState } from "../components/ErrorState.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Pagination } from "../components/Pagination.jsx";

function formatDate(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch (_e) {
    return isoString;
  }
}

function shortenId(id) {
  if (!id || id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function formatUrl(url) {
  if (!url) return "—";
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.origin : parsed.pathname;
  } catch (_e) {
    return url;
  }
}

export function SessionsPage({ onSelectSession }) {
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Track active request to prevent stale async overwrite
  const abortControllerRef = useRef(null);

  const loadSessions = useCallback(async (targetPage = 1, isManualRefresh = false) => {
    // Abort any in-flight request when page changes
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

    try {
      const result = await fetchSessions({
        page: targetPage,
        limit: 20,
        signal: controller.signal,
      });

      setSessions(result.data || []);
      setPagination(result.pagination || { page: targetPage, limit: 20, total: 0 });
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Failed to retrieve session data from the server.");
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadSessions(pagination.page);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadSessions, pagination.page]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1) {
      setPagination((prev) => ({ ...prev, page: newPage }));
      loadSessions(newPage);
    }
  };

  const handleRefresh = () => {
    loadSessions(pagination.page, true);
  };

  // Compute summary metrics across current page
  const pageTotalEvents = sessions.reduce((acc, s) => acc + (s.totalEvents || 0), 0);
  const pageViews = sessions.reduce((acc, s) => acc + (s.pageViews || 0), 0);
  const pageClicks = sessions.reduce((acc, s) => acc + (s.clicks || 0), 0);

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">User Sessions</h1>
          <p className="page-description">
            Live aggregated user journeys recorded from the CausalFunnel tracking script.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className={`btn btn-secondary refresh-btn ${refreshing ? "loading" : ""}`}
            title="Refresh session data"
          >
            <span className={`refresh-icon ${refreshing ? "spin" : ""}`}>🔄</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Total Sessions</span>
            <span className="metric-badge">All time</span>
          </div>
          <div className="metric-value">{pagination.total.toLocaleString()}</div>
          <div className="metric-caption">
            {sessions.length} visible on page {pagination.page}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Events on Page</span>
            <span className="metric-badge">Page {pagination.page}</span>
          </div>
          <div className="metric-value">{pageTotalEvents.toLocaleString()}</div>
          <div className="metric-caption">Sum of interactions for loaded sessions</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Page Views</span>
            <span className="metric-badge">Page {pagination.page}</span>
          </div>
          <div className="metric-value">{pageViews.toLocaleString()}</div>
          <div className="metric-caption">Total page visits captured</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Clicks</span>
            <span className="metric-badge">Page {pagination.page}</span>
          </div>
          <div className="metric-value">{pageClicks.toLocaleString()}</div>
          <div className="metric-caption">Document & coordinate clicks</div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <LoadingState message="Loading aggregated sessions from MongoDB Atlas…" />
      ) : error ? (
        <ErrorState
          title="Could not load sessions"
          message={error}
          onRetry={() => loadSessions(pagination.page)}
        />
      ) : sessions.length === 0 ? (
        <EmptyState onRefresh={handleRefresh} />
      ) : (
        <div className="table-card">
          <div className="table-wrapper">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th scope="col">Session ID</th>
                  <th scope="col">Entry Page</th>
                  <th scope="col">First Activity</th>
                  <th scope="col">Last Activity</th>
                  <th scope="col" className="text-right">Page Views</th>
                  <th scope="col" className="text-right">Clicks</th>
                  <th scope="col" className="text-right">Total Events</th>
                  <th scope="col" className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const isSelected = selectedSessionId === session.sessionId;
                  return (
                    <tr
                      key={session.sessionId}
                      onClick={(e) => {
                        // Prevent unintended navigation if clicking another nested interactive control
                        if (e.target.closest("button, a, input, select, textarea")) {
                          return;
                        }
                        setSelectedSessionId(session.sessionId);
                        if (onSelectSession) {
                          onSelectSession(session.sessionId);
                        }
                      }}
                      className={`session-row ${isSelected ? "selected-row" : ""}`}
                      title="Click row to inspect session journey"
                    >
                      <td className="session-id-cell">
                        <span
                          className="session-id-code"
                          title={`Full ID: ${session.sessionId}`}
                        >
                          {shortenId(session.sessionId)}
                        </span>
                      </td>

                      <td className="entry-page-cell">
                        <span
                          className="entry-page-tag"
                          title={session.entryPage}
                        >
                          {formatUrl(session.entryPage)}
                        </span>
                      </td>

                      <td className="timestamp-cell">
                        {formatDate(session.firstEventAt)}
                      </td>

                      <td className="timestamp-cell">
                        {formatDate(session.lastEventAt)}
                      </td>

                      <td className="text-right count-cell">
                        <span className="badge badge-pv">
                          {session.pageViews}
                        </span>
                      </td>

                      <td className="text-right count-cell">
                        <span className="badge badge-click">
                          {session.clicks}
                        </span>
                      </td>

                      <td className="text-right count-cell font-semibold">
                        {session.totalEvents}
                      </td>

                      <td className="text-center action-cell">
                        <button
                          type="button"
                          className="btn btn-outline btn-xs view-journey-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSessionId(session.sessionId);
                            if (onSelectSession) {
                              onSelectSession(session.sessionId);
                            }
                          }}
                          title={`View session journey for ${session.sessionId}`}
                        >
                          View Journey &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  );
}
