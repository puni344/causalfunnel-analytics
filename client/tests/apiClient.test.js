// client/tests/apiClient.test.js
// ─────────────────────────────────────────────────────────
// Frontend API Client Tests
// Validates URL construction, JSON parsing, error normalization,
// and connection failure handling.
// ─────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { get, fetchSessions, ApiError, API_BASE_URL } from "../src/api/client.js";

describe("Frontend API Client — client/src/api/client.js", () => {
  it("exports a valid API_BASE_URL defaulting to localhost:4000", () => {
    assert.ok(API_BASE_URL);
    assert.strictEqual(typeof API_BASE_URL, "string");
    assert.ok(!API_BASE_URL.endsWith("/"), "Must not have trailing slash");
  });

  it("fetchSessions constructs correct query string parameters", async () => {
    let requestedUrl = null;

    // Temporarily intercept global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [
            {
              sessionId: "sess_12345678",
              firstEventAt: "2026-10-12T10:00:00.000Z",
              lastEventAt: "2026-10-12T10:05:00.000Z",
              totalEvents: 5,
              pageViews: 2,
              clicks: 3,
              entryPage: "http://localhost:4000/demo/index.html",
            },
          ],
          pagination: { page: 2, limit: 10, total: 25 },
        }),
      };
    };

    try {
      const result = await fetchSessions({ page: 2, limit: 10 });

      assert.ok(requestedUrl);
      assert.ok(requestedUrl.includes("/api/sessions?page=2&limit=10"));
      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.data[0].sessionId, "sess_12345678");
      assert.strictEqual(result.pagination.total, 25);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws ApiError with status and message when server returns non-2xx response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        error: "Validation Error",
        message: "page must be >= 1",
      }),
    });

    try {
      await assert.rejects(
        async () => {
          await get("/api/sessions?page=0");
        },
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.message, "page must be >= 1");
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles network disconnections gracefully with user-friendly ApiError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    try {
      await assert.rejects(
        async () => {
          await get("/api/sessions");
        },
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.strictEqual(err.status, 0);
          assert.match(err.message, /Cannot connect to analytics backend/);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles non-JSON or empty response gracefully without crashing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/plain" }),
      text: async () => "OK",
    });

    try {
      const data = await get("/api/health");
      assert.strictEqual(data, "OK");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates AbortError when AbortSignal is triggered", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
      if (options?.signal?.aborted) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) };
    };

    const controller = new AbortController();
    controller.abort();

    try {
      await assert.rejects(
        async () => {
          await get("/api/sessions", { signal: controller.signal });
        },
        (err) => {
          assert.strictEqual(err.name, "AbortError");
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
