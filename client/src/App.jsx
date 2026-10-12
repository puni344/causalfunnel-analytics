// client/src/App.jsx
import React, { useState } from "react";
import { AppLayout } from "./components/AppLayout.jsx";
import { SessionsPage } from "./pages/SessionsPage.jsx";
import { PlaceholderPage } from "./pages/PlaceholderPage.jsx";

export default function App() {
  const [activeTab, setActiveTab] = useState("sessions");

  return (
    <AppLayout activeTab={activeTab} onSelectTab={setActiveTab}>
      {activeTab === "sessions" && <SessionsPage />}

      {activeTab === "journey" && (
        <PlaceholderPage
          title="User Journey Analytics"
          stageNumber={6}
          description="Chronological event journey timeline and interaction replay per user session."
          features={[
            "Interactive timeline view of every page_view and click event",
            "Oldest-to-newest chronological ordering with exact timestamps",
            "Detailed click coordinate inspection (x, y, pageX, pageY)",
            "Direct journey inspection linked from the Sessions table",
          ]}
        />
      )}

      {activeTab === "heatmap" && (
        <PlaceholderPage
          title="Visual Click Heatmaps"
          stageNumber={7}
          description="Spatial click density overlays rendered on top of the live demo website."
          features={[
            "Preview target webpage inside isolated iframe with analytics disabled",
            "Render colored click density points from GET /api/clicks",
            "Automatic URL canonicalization and page matching",
            "Supports high-density click clusters up to 5,000 data points",
          ]}
        />
      )}
    </AppLayout>
  );
}
