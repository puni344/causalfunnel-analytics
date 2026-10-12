// client/src/api/client.js
// ─────────────────────────────────────────────────────────
// Centralized API Client for CausalFunnel Analytics Dashboard
// ─────────────────────────────────────────────────────────

export const API_BASE_URL = (
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_URL) ||
  "http://localhost:4000"
).replace(/\/+$/, "");

/**
 * Custom error class representing API failures with HTTP status code.
 */
export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Reusable GET request helper.
 *
 * @param {string} endpoint - Path such as "/api/sessions"
 * @param {object} [options] - Additional fetch options (e.g. signal)
 * @returns {Promise<any>}
 */
export async function get(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
      signal: options.signal,
    });
  } catch (err) {
    // If request was intentionally aborted (e.g. user changed pages), propagate AbortError
    if (err.name === "AbortError") {
      throw err;
    }
    throw new ApiError(
      0,
      `Cannot connect to analytics backend at ${API_BASE_URL}. Please verify the server is running.`
    );
  }

  // Parse JSON body safely
  let data;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch (_parseErr) {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      (data && typeof data === "object" && (data.message || data.error)) ||
      `Request failed with status ${response.status}`;
    const details = data && typeof data === "object" && data.details ? data.details : null;
    throw new ApiError(response.status, errorMsg, details);
  }

  return data;
}

/**
 * Fetches paginated session summaries from GET /api/sessions.
 *
 * @param {object} params
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ data: Array, pagination: { page: number, limit: number, total: number } }>}
 */
export async function fetchSessions({ page = 1, limit = 20, signal } = {}) {
  return get(`/api/sessions?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`, {
    signal,
  });
}
