// client/src/components/ErrorState.jsx
import React from "react";

export function ErrorState({
  title = "Failed to load data",
  message = "An error occurred while fetching information from the server.",
  onRetry,
}) {
  return (
    <div className="state-container error-state" role="alert">
      <div className="error-icon" aria-hidden="true">
        ⚠️
      </div>
      <h3 className="error-title">{title}</h3>
      <p className="error-message">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-primary retry-btn"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
