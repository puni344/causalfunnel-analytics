// client/src/components/AppLayout.jsx
import React from "react";
import { Sidebar } from "./Sidebar.jsx";
import { API_BASE_URL } from "../api/client.js";

export function AppLayout({ activeTab, onSelectTab, children }) {
  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onSelectTab={onSelectTab} />
      <div className="main-content-wrapper">
        <header className="top-header">
          <div className="top-header-left">
            <span className="environment-tag">Live Mode</span>
            <span className="server-endpoint-info">
              Connected to <code>{API_BASE_URL}</code>
            </span>
          </div>
          <div className="top-header-right">
            <span className="badge-database">MongoDB Atlas</span>
          </div>
        </header>
        <main className="main-page-content">{children}</main>
      </div>
    </div>
  );
}
