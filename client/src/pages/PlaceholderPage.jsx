// client/src/pages/PlaceholderPage.jsx
import React from "react";

export function PlaceholderPage({ title, stageNumber, description, features = [] }) {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-description">{description}</p>
        </div>
      </div>

      <div className="placeholder-card">
        <div className="placeholder-badge">Stage {stageNumber} Preview</div>
        <h2 className="placeholder-title">Under Construction for Stage {stageNumber}</h2>
        <p className="placeholder-desc">
          This feature is scheduled for implementation in Stage {stageNumber}. All backend
          event ingestion and storage pipelines are already in place and collecting data for this view.
        </p>

        <div className="planned-features-box">
          <h3 className="planned-title">Upcoming Capabilities:</h3>
          <ul className="planned-list">
            {features.map((feature, idx) => (
              <li key={idx} className="planned-item">
                <span className="check-icon">✓</span> {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
