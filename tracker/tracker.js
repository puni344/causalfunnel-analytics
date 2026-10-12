/**
 * CausalFunnel Analytics Tracker
 * ─────────────────────────────────────────────────────────
 * Lightweight, zero-dependency plain JavaScript tracking script.
 * Captures page views and click events with viewport and page
 * dimensions, and transmits them to POST /api/events.
 * ─────────────────────────────────────────────────────────
 */
(function () {
  "use strict";

  // ── 1. Iframe Protection ──────────────────────────────────
  // Do not record events if running inside an iframe (e.g. heatmap preview).
  try {
    if (window.self !== window.top) {
      return;
    }
  } catch (_err) {
    // Cross-origin iframe security restriction triggers exception
    return;
  }

  // ── 2. Double-Initialization Guard ────────────────────────
  if (window.__CF_TRACKER_INITIALIZED__) {
    return;
  }
  window.__CF_TRACKER_INITIALIZED__ = true;

  // ── 3. Configuration & UUID Generation ────────────────────
  const STORAGE_KEY = "cf_session_id";
  let inMemorySessionId = null;

  /**
   * Generates a standard RFC4122 v4 UUID.
   * Uses crypto.randomUUID() when available, with a robust fallback.
   */
  function generateUUID() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      try {
        return crypto.randomUUID();
      } catch (_e) {}
    }

    // Fallback using crypto.getRandomValues if available
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.getRandomValues === "function"
    ) {
      try {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC4122
        const hex = Array.from(bytes, (b) =>
          b.toString(16).padStart(2, "0")
        ).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
          12,
          16
        )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      } catch (_e) {}
    }

    // Math.random fallback (RFC4122 format)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ── 4. Session ID Management ──────────────────────────────
  /**
   * Reads or initializes the persistent session ID.
   * Stored in localStorage under cf_session_id.
   * Falls back to in-memory storage if localStorage is blocked.
   */
  function getSessionId() {
    try {
      if (typeof window.localStorage !== "undefined") {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && /^[a-zA-Z0-9_-]{8,64}$/.test(stored)) {
          return stored;
        }
        const fresh = generateUUID();
        window.localStorage.setItem(STORAGE_KEY, fresh);
        return fresh;
      }
    } catch (_storageErr) {
      // localStorage is disabled, blocked by cookies policy, or private browsing
    }

    if (!inMemorySessionId) {
      inMemorySessionId = generateUUID();
    }
    return inMemorySessionId;
  }

  // ── 5. Script API Endpoint Resolution ─────────────────────
  /**
   * Resolves the target API URL.
   * Reads data-api-url attribute from the tracker's script tag,
   * defaulting to same-origin /api/events.
   */
  function getApiUrl() {
    try {
      const scriptTag =
        document.currentScript ||
        document.querySelector('script[src*="tracker.js"]');
      if (scriptTag) {
        const customUrl = scriptTag.getAttribute("data-api-url");
        if (customUrl) {
          return customUrl;
        }
      }
    } catch (_e) {}
    return "/api/events";
  }

  // ── 6. Layout & Coordinate Measurement ────────────────────
  function getViewportDimensions() {
    const w =
      window.innerWidth ||
      (document.documentElement ? document.documentElement.clientWidth : 1);
    const h =
      window.innerHeight ||
      (document.documentElement ? document.documentElement.clientHeight : 1);
    return {
      width: Math.max(1, Math.round(w)),
      height: Math.max(1, Math.round(h)),
    };
  }

  function getPageDimensions(viewport) {
    const docEl = document.documentElement;
    const body = document.body;
    const w = Math.max(
      viewport.width,
      docEl ? docEl.scrollWidth : 0,
      body ? body.scrollWidth : 0,
      docEl ? docEl.offsetWidth : 0,
      body ? body.offsetWidth : 0
    );
    const h = Math.max(
      viewport.height,
      docEl ? docEl.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      docEl ? docEl.offsetHeight : 0,
      body ? body.offsetHeight : 0
    );
    return {
      width: Math.max(1, Math.round(w)),
      height: Math.max(1, Math.round(h)),
    };
  }

  // ── 7. Transmission ───────────────────────────────────────
  /**
   * Transmits an event payload to the ingestion endpoint.
   * Uses fetch with keepalive where supported.
   * Retries once on transient network failure, reusing the same eventId.
   */
  function sendEvent(payload, attempt = 1) {
    const url = getApiUrl();
    const bodyString = JSON.stringify(payload);
    const fetchFn =
      typeof window !== "undefined" && typeof window.fetch === "function"
        ? window.fetch.bind(window)
        : fetch;

    try {
      fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: bodyString,
        keepalive: true,
      })
        .then(function (res) {
          // If server returns 5xx, retry once with same eventId
          if (!res.ok && res.status >= 500 && attempt < 2) {
            setTimeout(function () {
              sendEvent(payload, attempt + 1);
            }, 1000);
          }
        })
        .catch(function (_netErr) {
          // Network failure (e.g. offline) - retry once after delay
          if (attempt < 2) {
            setTimeout(function () {
              sendEvent(payload, attempt + 1);
            }, 1000);
          }
        });
    } catch (_syncErr) {
      // Never throw or disrupt host page operations
    }
  }

  // ── 8. Page View Tracking ─────────────────────────────────
  function trackPageView() {
    try {
      const viewport = getViewportDimensions();
      const pageDimensions = getPageDimensions(viewport);

      const eventPayload = {
        eventId: generateUUID(),
        sessionId: getSessionId(),
        type: "page_view",
        pageUrl: window.location.href,
        timestamp: new Date().toISOString(),
        viewport: viewport,
        pageDimensions: pageDimensions,
      };

      sendEvent(eventPayload);
    } catch (_err) {
      // Defensive protection
    }
  }

  // ── 9. Click Tracking ─────────────────────────────────────
  function handleClick(e) {
    try {
      if (!e) return;

      const viewport = getViewportDimensions();
      const pageDimensions = getPageDimensions(viewport);

      // Viewport-relative coordinates (clamped within [0, viewport])
      const clientX = typeof e.clientX === "number" ? Math.round(e.clientX) : 0;
      const clientY = typeof e.clientY === "number" ? Math.round(e.clientY) : 0;
      const x = Math.max(0, Math.min(clientX, viewport.width));
      const y = Math.max(0, Math.min(clientY, viewport.height));

      // Document-relative coordinates
      const scrollX =
        window.scrollX ||
        window.pageXOffset ||
        (document.documentElement ? document.documentElement.scrollLeft : 0) ||
        0;
      const scrollY =
        window.scrollY ||
        window.pageYOffset ||
        (document.documentElement ? document.documentElement.scrollTop : 0) ||
        0;

      const rawPageX =
        typeof e.pageX === "number" ? Math.round(e.pageX) : clientX + scrollX;
      const rawPageY =
        typeof e.pageY === "number" ? Math.round(e.pageY) : clientY + scrollY;

      const pageX = Math.max(0, rawPageX);
      const pageY = Math.max(0, rawPageY);

      // Safe target extraction
      const targetEl = e.target || e.srcElement;
      let tag = "UNKNOWN";
      let id = "";
      let className = "";

      if (targetEl && targetEl.tagName) {
        tag = String(targetEl.tagName).toUpperCase().slice(0, 50);
        if (targetEl.id) {
          id = String(targetEl.id).slice(0, 200);
        }
        if (targetEl.className) {
          className =
            typeof targetEl.className === "string"
              ? targetEl.className.slice(0, 500)
              : typeof targetEl.className.baseVal === "string"
              ? targetEl.className.baseVal.slice(0, 500)
              : "";
        }
      }

      const eventPayload = {
        eventId: generateUUID(),
        sessionId: getSessionId(),
        type: "click",
        pageUrl: window.location.href,
        timestamp: new Date().toISOString(),
        viewport: viewport,
        pageDimensions: pageDimensions,
        click: {
          x: x,
          y: y,
          pageX: pageX,
          pageY: pageY,
          target: {
            tag: tag,
            id: id,
            class: className,
          },
        },
      };

      sendEvent(eventPayload);
    } catch (_err) {
      // Defensive protection
    }
  }

  // ── 10. Initialization ────────────────────────────────────
  function init() {
    // Send single page_view for this page load
    trackPageView();

    // Listen for clicks at document level in capture mode
    document.addEventListener("click", handleClick, true);
  }

  // Safe execution: handles execution before or after DOMContentLoaded
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
