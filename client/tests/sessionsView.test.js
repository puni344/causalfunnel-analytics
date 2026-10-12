// client/tests/sessionsView.test.js
// ─────────────────────────────────────────────────────────
// Sessions View Logic Tests
// Validates metric calculation, formatting, and pagination math.
// ─────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Mirror formatting helpers used in SessionsPage
function formatDate(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (_e) {
    return isoString;
  }
}

function shortenId(id) {
  if (!id || id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function computeMetrics(sessions) {
  return {
    totalEvents: sessions.reduce((acc, s) => acc + (s.totalEvents || 0), 0),
    pageViews: sessions.reduce((acc, s) => acc + (s.pageViews || 0), 0),
    clicks: sessions.reduce((acc, s) => acc + (s.clicks || 0), 0),
  };
}

function computePagination(page, limit, total) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);
  return { totalPages, startItem, endItem };
}

describe("Sessions View Logic & Calculations", () => {
  it("shortens long UUID session IDs with ellipsis while preserving start and end", () => {
    const longId = "87a6bbcc-6a7e-43ac-8013-5d8cebc00867";
    const shortened = shortenId(longId);
    assert.strictEqual(shortened, "87a6bbcc…c00867");

    // Short IDs are not truncated
    assert.strictEqual(shortenId("short_sess_12"), "short_sess_12");
  });

  it("formats ISO timestamps into readable strings", () => {
    const formatted = formatDate("2026-10-12T10:00:00.000Z");
    assert.match(formatted, /Oct 12, 2026/);
    assert.strictEqual(formatDate(null), "—");
    assert.strictEqual(formatDate(""), "—");
  });

  it("calculates page summary metrics from real session rows accurately", () => {
    const mockSessions = [
      { sessionId: "s1", totalEvents: 10, pageViews: 4, clicks: 6 },
      { sessionId: "s2", totalEvents: 5, pageViews: 1, clicks: 4 },
      { sessionId: "s3", totalEvents: 1, pageViews: 1, clicks: 0 },
    ];

    const metrics = computeMetrics(mockSessions);
    assert.strictEqual(metrics.totalEvents, 16);
    assert.strictEqual(metrics.pageViews, 6);
    assert.strictEqual(metrics.clicks, 10);
  });

  it("computes pagination bounds correctly for first, middle, and empty pages", () => {
    // Page 1 of 45 items with limit 20
    const p1 = computePagination(1, 20, 45);
    assert.strictEqual(p1.startItem, 1);
    assert.strictEqual(p1.endItem, 20);
    assert.strictEqual(p1.totalPages, 3);

    // Page 3 (last page) of 45 items with limit 20
    const p3 = computePagination(3, 20, 45);
    assert.strictEqual(p3.startItem, 41);
    assert.strictEqual(p3.endItem, 45);
    assert.strictEqual(p3.totalPages, 3);

    // Empty dataset (total = 0)
    const pEmpty = computePagination(1, 20, 0);
    assert.strictEqual(pEmpty.startItem, 0);
    assert.strictEqual(pEmpty.endItem, 0);
    assert.strictEqual(pEmpty.totalPages, 1);
  });
});
