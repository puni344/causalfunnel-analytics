// client/src/components/EmptyState.jsx
import React from "react";
import { API_BASE_URL } from "../api/client.js";

export function EmptyState({
  title = "No sessions yet",
  message = "No user sessions have been recorded. Open the demo page and click around to generate analytics events.",
  onRefresh,
}) {
  const demoUrl = `${API_BASE_URL}/demo/index.html`;

  return (
    <div className="state-container empty-state">
      <div className="empty-icon" aria-hidden="true">
        📊
      </div>
      <h3 className="empty-title">{title}</h3>
      <p className="empty-message">{message}</p>
      <div className="empty-actions">
        <a
          href={demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          Open Demo Page ↗
        </a>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="btn btn-secondary"
          >
            Check Again
          </button>
        )}
      </div>
    </div>
  );
}
