// server/tests/integration/trackerGuards.test.js
// ─────────────────────────────────────────────────────────
// Verification of tracker guards and edge cases:
//   1. Double initialization protection (window.__CF_TRACKER_INITIALIZED__)
//   2. Iframe protection (window.self !== window.top exits early)
//   3. Network resilience on ingestion error (does not break caller)
// ─────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const trackerCode = fs.readFileSync(
  path.resolve(__dirname, "../../../tracker/tracker.js"),
  "utf-8"
);

describe("Tracker Guards & Resilience", () => {
  it("prevents double-initialization via __CF_TRACKER_INITIALIZED__", () => {
    let fetchCalls = 0;

    // Simulate browser window context
    const fakeWindow = {
      self: null,
      top: null,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
      location: { href: "http://localhost:4000/demo/index.html" },
      innerWidth: 1920,
      innerHeight: 1080,
      fetch: async () => {
        fetchCalls++;
        return { ok: true, status: 201 };
      },
    };
    fakeWindow.self = fakeWindow;
    fakeWindow.top = fakeWindow;

    const fakeDocument = {
      readyState: "complete",
      documentElement: { clientWidth: 1920, clientHeight: 1080, scrollWidth: 1920, scrollHeight: 3000 },
      body: { scrollWidth: 1920, scrollHeight: 3000 },
      addEventListener: () => {},
      querySelector: () => null,
      currentScript: null,
    };

    // Execute tracker script once
    const runner = new Function("window", "document", "crypto", trackerCode);
    runner(fakeWindow, fakeDocument, globalThis.crypto);

    assert.strictEqual(fakeWindow.__CF_TRACKER_INITIALIZED__, true);
    assert.strictEqual(fetchCalls, 1, "First execution should send 1 page_view");

    // Execute tracker script a second time on the same window
    runner(fakeWindow, fakeDocument, globalThis.crypto);

    assert.strictEqual(
      fetchCalls,
      1,
      "Second execution must NOT send another page_view (guard protected)"
    );
  });

  it("exits early when executed inside an iframe (window.self !== window.top)", () => {
    let fetchCalls = 0;

    const fakeTop = {};
    const fakeWindow = {
      self: null,
      top: fakeTop, // top is different from self -> iframe!
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
      location: { href: "http://localhost:4000/demo/index.html" },
      innerWidth: 800,
      innerHeight: 600,
      fetch: async () => {
        fetchCalls++;
        return { ok: true, status: 201 };
      },
    };
    fakeWindow.self = fakeWindow;

    const fakeDocument = {
      readyState: "complete",
      documentElement: { clientWidth: 800, clientHeight: 600 },
      body: {},
      addEventListener: () => {},
      querySelector: () => null,
      currentScript: null,
    };

    const runner = new Function("window", "document", "crypto", trackerCode);
    runner(fakeWindow, fakeDocument, globalThis.crypto);

    assert.strictEqual(fetchCalls, 0, "Iframe must NOT transmit any tracking events");
    assert.strictEqual(
      fakeWindow.__CF_TRACKER_INITIALIZED__,
      undefined,
      "Tracker should exit before setting initialization flag"
    );
  });

  it("does not throw uncaught errors when fetch rejects", async () => {
    const fakeWindow = {
      self: null,
      top: null,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
      location: { href: "http://localhost:4000/demo/index.html" },
      innerWidth: 1920,
      innerHeight: 1080,
      fetch: async () => {
        throw new Error("Network request failed");
      },
    };
    fakeWindow.self = fakeWindow;
    fakeWindow.top = fakeWindow;

    const fakeDocument = {
      readyState: "complete",
      documentElement: { clientWidth: 1920, clientHeight: 1080 },
      body: {},
      addEventListener: () => {},
      querySelector: () => null,
      currentScript: null,
    };

    const runner = new Function("window", "document", "crypto", trackerCode);

    // Should not throw synchronously
    assert.doesNotThrow(() => {
      runner(fakeWindow, fakeDocument, globalThis.crypto);
    });
  });
});
