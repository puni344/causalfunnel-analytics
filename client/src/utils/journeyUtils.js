// client/src/utils/journeyUtils.js
// ─────────────────────────────────────────────────────────
// Pure helper functions for routing, duration math,
// URL formatting, and event journey statistics.
// ─────────────────────────────────────────────────────────

/**
 * Parses a browser pathname into dashboard tab and session ID.
 *
 * @param {string} [pathname="/"]
 * @returns {{ tab: "sessions" | "journey" | "heatmap", sessionId: string | null }}
 */
export function parseRoute(pathname = "/") {
  const sessionMatch = pathname.match(/^\/sessions\/([^/]+)\/?$/);
  if (sessionMatch) {
    try {
      return {
        tab: "journey",
        sessionId: decodeURIComponent(sessionMatch[1]),
      };
    } catch (_e) {
      return {
        tab: "journey",
        sessionId: sessionMatch[1],
      };
    }
  }

  if (pathname.startsWith("/journey")) {
    return { tab: "journey", sessionId: null };
  }

  if (pathname.startsWith("/heatmap")) {
    return { tab: "heatmap", sessionId: null };
  }

  // Default to sessions table for / or /sessions or unknown paths
  return { tab: "sessions", sessionId: null };
}

/**
 * Formats duration between two ISO timestamp strings.
 *
 * @param {string|null} startIso
 * @param {string|null} endIso
 * @returns {string} E.g., "< 1s", "45s", "5m 12s", "2h 15m"
 */
export function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return "0s";
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end)) return "0s";
  const diffSec = Math.max(0, Math.round((end - start) / 1000));
  if (diffSec < 1) return "< 1s";
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

/**
 * Shortens a long UUID string for display, preserving start and end segments.
 *
 * @param {string|null} id
 * @returns {string|null}
 */
export function shortenId(id) {
  if (!id || id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

/**
 * Extracts a human-readable pathname from an absolute URL.
 *
 * @param {string|null} url
 * @returns {string}
 */
export function formatUrl(url) {
  if (!url) return "—";
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.origin : parsed.pathname;
  } catch (_e) {
    return url;
  }
}

/**
 * Formats an ISO string into full readable date and time.
 *
 * @param {string|null} isoString
 * @returns {string}
 */
export function formatFullDate(isoString) {
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

/**
 * Formats an ISO string to time-only string.
 *
 * @param {string|null} isoString
 * @returns {string}
 */
export function formatTimeOnly(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch (_e) {
    return isoString;
  }
}

/**
 * Sorts raw events in ascending chronological order deterministically.
 *
 * @param {Array} events
 * @returns {Array}
 */
export function sortEventsChronologically(events = []) {
  return [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Derives summary statistics safely from an array of session events.
 *
 * @param {Array} events
 * @returns {{
 *   totalEvents: number,
 *   pageViewsCount: number,
 *   clicksCount: number,
 *   firstEvent: object|null,
 *   lastEvent: object|null,
 *   entryPage: string,
 *   duration: string
 * }}
 */
export function deriveJourneySummary(events = []) {
  const sorted = sortEventsChronologically(events);
  const totalEvents = sorted.length;
  const pageViewsCount = sorted.filter((e) => e.type === "page_view").length;
  const clicksCount = sorted.filter((e) => e.type === "click").length;
  const firstEvent = sorted[0] || null;
  const lastEvent = sorted[sorted.length - 1] || null;
  const entryPage = firstEvent ? firstEvent.pageUrl : "—";
  const duration =
    firstEvent && lastEvent ? formatDuration(firstEvent.timestamp, lastEvent.timestamp) : "0s";

  return {
    totalEvents,
    pageViewsCount,
    clicksCount,
    firstEvent,
    lastEvent,
    entryPage,
    duration,
  };
}
