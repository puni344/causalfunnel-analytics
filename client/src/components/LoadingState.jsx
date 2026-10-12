// client/src/components/LoadingState.jsx
import React from "react";

export function LoadingState({ message = "Loading analytics data..." }) {
  return (
    <div className="state-container loading-state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true"></div>
      <p className="state-message">{message}</p>
    </div>
  );
}
