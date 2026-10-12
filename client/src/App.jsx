// client/src/App.jsx
// ─────────────────────────────────────────────────────────
// CausalFunnel Analytics Dashboard — Main Application Shell
// Supports direct URL routing: /sessions, /sessions/:sessionId, /heatmap
// ─────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "./components/AppLayout.jsx";
import { SessionsPage } from "./pages/SessionsPage.jsx";
import { SessionJourneyPage } from "./pages/SessionJourneyPage.jsx";
import { HeatmapPage } from "./pages/HeatmapPage.jsx";

import { parseRoute } from "./utils/journeyUtils.js";

export default function App() {
  const [route, setRoute] = useState(() => {
    if (typeof window !== "undefined" && window.location) {
      return parseRoute(window.location.pathname);
    }
    return { tab: "sessions", sessionId: null };
  });

  const [lastSelectedSessionId, setLastSelectedSessionId] = useState(() => {
    if (typeof window !== "undefined" && window.location) {
      const parsed = parseRoute(window.location.pathname);
      return parsed.sessionId;
    }
    return null;
  });

  // Keep track of browser back/forward buttons
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const newRoute = parseRoute(window.location.pathname);
      setRoute(newRoute);
      if (newRoute.sessionId) {
        setLastSelectedSessionId(newRoute.sessionId);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = useCallback((path) => {
    if (typeof window !== "undefined" && window.history) {
      if (window.location.pathname !== path) {
        window.history.pushState(null, "", path);
      }
    }
    const newRoute = parseRoute(path);
    setRoute(newRoute);
    if (newRoute.sessionId) {
      setLastSelectedSessionId(newRoute.sessionId);
    }
  }, []);

  const handleSelectTab = (tabId) => {
    if (tabId === "sessions") {
      navigateTo("/sessions");
    } else if (tabId === "journey") {
      if (lastSelectedSessionId) {
        navigateTo(`/sessions/${encodeURIComponent(lastSelectedSessionId)}`);
      } else {
        navigateTo("/journey");
      }
    } else if (tabId === "heatmap") {
      navigateTo("/heatmap");
    }
  };

  const handleSelectSession = (sessionId) => {
    setLastSelectedSessionId(sessionId);
    navigateTo(`/sessions/${encodeURIComponent(sessionId)}`);
  };

  const handleBackToSessions = () => {
    navigateTo("/sessions");
  };

  return (
    <AppLayout activeTab={route.tab} onSelectTab={handleSelectTab}>
      {route.tab === "sessions" && (
        <SessionsPage onSelectSession={handleSelectSession} />
      )}

      {route.tab === "journey" && (
        route.sessionId ? (
          <SessionJourneyPage
            sessionId={route.sessionId}
            onBackToSessions={handleBackToSessions}
          />
        ) : (
          <div className="page-container">
            <div className="page-header">
              <div>
                <h1 className="page-title">Session Journey</h1>
                <p className="page-description">
                  Chronological interaction timelines and click inspections.
                </p>
              </div>
            </div>
            <div className="state-container">
              <div className="empty-icon">🗺️</div>
              <h3 className="empty-title">Select a Session to View Its Journey</h3>
              <p className="empty-message">
                Click on any session in the Sessions overview table to inspect its
                complete step-by-step chronological user journey.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigateTo("/sessions")}
              >
                Browse Sessions &rarr;
              </button>
            </div>
          </div>
        )
      )}

      {route.tab === "heatmap" && <HeatmapPage />}
    </AppLayout>
  );
}
