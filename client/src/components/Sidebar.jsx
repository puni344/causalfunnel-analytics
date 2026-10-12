// client/src/components/Sidebar.jsx
import React from "react";
import { API_BASE_URL } from "../api/client.js";

export function Sidebar({ activeTab, onSelectTab }) {
  const demoUrl = `${API_BASE_URL}/demo/index.html`;

  const navItems = [
    {
      id: "sessions",
      label: "Sessions",
      icon: "👥",
      badge: null,
    },
    {
      id: "journey",
      label: "User Journey",
      icon: "🗺️",
      badge: "Stage 6",
    },
    {
      id: "heatmap",
      label: "Heatmap",
      icon: "🔥",
      badge: "Stage 7",
    },
  ];

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-brand">
        <span className="brand-logo" aria-hidden="true">
          ⚡
        </span>
        <div className="brand-text">
          <span className="brand-title">CausalFunnel</span>
          <span className="brand-subtitle">User Analytics</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <div className="nav-section-label">ANALYTICS</div>
        <ul className="nav-list">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <li key={item.id} className="nav-item">
                <button
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`nav-button ${isActive ? "active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="nav-label">{item.label}</span>
                  {item.badge && <span className="nav-badge">{item.badge}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div className="demo-launcher-card">
          <div className="demo-launcher-header">
            <span className="demo-icon">🚀</span>
            <span className="demo-title">Test Demo Site</span>
          </div>
          <p className="demo-desc">
            Open the demo pages to trigger live events into MongoDB Atlas.
          </p>
          <a
            href={demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm demo-link-btn"
          >
            Launch Demo ↗
          </a>
        </div>
      </div>
    </aside>
  );
}
