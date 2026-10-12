// server/tests/unit/eventSchema.test.js
// ─────────────────────────────────────────────────────────
// Unit tests for the Zod event validation schema.
// These run without MongoDB — they only test input parsing.
// ─────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eventRequestSchema,
  normalizePageUrl,
} from "../../src/validators/eventSchema.js";

// ── Test fixtures ────────────────────────────────────────

function validPageView(overrides = {}) {
  return {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    sessionId: "sess_abcd1234",
    type: "page_view",
    pageUrl: "https://example.com/pricing?ref=google#faq",
    timestamp: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
    pageDimensions: { width: 1920, height: 4500 },
    ...overrides,
  };
}

function validClick(overrides = {}) {
  return {
    eventId: "660e8400-e29b-41d4-a716-446655440001",
    sessionId: "sess_abcd1234",
    type: "click",
    pageUrl: "https://example.com/pricing",
    timestamp: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
    pageDimensions: { width: 1920, height: 4500 },
    click: {
      x: 100,
      y: 200,
      pageX: 100,
      pageY: 1200,
      target: { tag: "BUTTON", id: "cta-signup", class: "btn primary" },
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────

describe("eventRequestSchema — valid inputs", () => {
  it("accepts a valid page_view", () => {
    const result = eventRequestSchema.safeParse(validPageView());
    assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  });

  it("accepts a valid click event", () => {
    const result = eventRequestSchema.safeParse(validClick());
    assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  });

  it("strips unknown fields", () => {
    const input = validPageView({ secretField: "malicious", extra: 42 });
    const result = eventRequestSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.secretField, undefined);
    assert.equal(result.data.extra, undefined);
  });
});

describe("eventRequestSchema — eventId", () => {
  it("rejects a non-UUID eventId", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ eventId: "not-a-uuid" })
    );
    assert.equal(result.success, false);
    const msg = result.error.issues[0].message;
    assert.ok(msg.toLowerCase().includes("uuid"), msg);
  });

  it("rejects a missing eventId", () => {
    const input = validPageView();
    delete input.eventId;
    const result = eventRequestSchema.safeParse(input);
    assert.equal(result.success, false);
  });
});

describe("eventRequestSchema — sessionId", () => {
  it("rejects a sessionId shorter than 8 characters", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ sessionId: "short" })
    );
    assert.equal(result.success, false);
  });

  it("rejects a sessionId with invalid characters", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ sessionId: "sess id with spaces!" })
    );
    assert.equal(result.success, false);
  });
});

describe("eventRequestSchema — type", () => {
  it('rejects an invalid type like "hover"', () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ type: "hover" })
    );
    assert.equal(result.success, false);
  });
});

describe("eventRequestSchema — pageUrl", () => {
  it("rejects an ftp:// URL", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ pageUrl: "ftp://files.example.com/doc.pdf" })
    );
    assert.equal(result.success, false);
  });

  it("rejects a completely invalid URL", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ pageUrl: "not a url at all" })
    );
    assert.equal(result.success, false);
  });
});

describe("eventRequestSchema — timestamp", () => {
  it("rejects a timestamp more than 5 minutes in the future", () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = eventRequestSchema.safeParse(
      validPageView({ timestamp: future })
    );
    assert.equal(result.success, false);
  });

  it("rejects an invalid date string", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ timestamp: "yesterday" })
    );
    assert.equal(result.success, false);
  });
});

describe("eventRequestSchema — viewport & pageDimensions", () => {
  it("rejects viewport.width = 0", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ viewport: { width: 0, height: 1080 } })
    );
    assert.equal(result.success, false);
  });

  it("rejects viewport.width > 10000", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ viewport: { width: 20000, height: 1080 } })
    );
    assert.equal(result.success, false);
  });

  it("rejects pageDimensions.height > 100000", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({
        pageDimensions: { width: 1920, height: 200000 },
      })
    );
    assert.equal(result.success, false);
  });

  it("rejects non-integer viewport dimensions", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({ viewport: { width: 1920.5, height: 1080 } })
    );
    assert.equal(result.success, false);
  });
});

describe("eventRequestSchema — click conditional rules", () => {
  it("rejects a click event without a click object", () => {
    const input = validClick();
    delete input.click;
    const result = eventRequestSchema.safeParse(input);
    assert.equal(result.success, false);
    const paths = result.error.issues.map((i) => i.path.join("."));
    assert.ok(paths.includes("click"));
  });

  it("rejects a page_view event with a click object", () => {
    const result = eventRequestSchema.safeParse(
      validPageView({
        click: {
          x: 10,
          y: 20,
          pageX: 10,
          pageY: 20,
          target: { tag: "A" },
        },
      })
    );
    assert.equal(result.success, false);
    const msg = result.error.issues[0].message;
    assert.ok(msg.includes("must not be present"), msg);
  });

  it("rejects negative click coordinates", () => {
    const result = eventRequestSchema.safeParse(
      validClick({
        click: {
          x: -1,
          y: 200,
          pageX: 100,
          pageY: 1200,
          target: { tag: "BUTTON" },
        },
      })
    );
    assert.equal(result.success, false);
  });

  it("rejects click.x exceeding viewport.width", () => {
    const result = eventRequestSchema.safeParse(
      validClick({
        viewport: { width: 1920, height: 1080 },
        click: {
          x: 2000, // exceeds viewport.width of 1920
          y: 200,
          pageX: 2000,
          pageY: 1200,
          target: { tag: "BUTTON" },
        },
      })
    );
    assert.equal(result.success, false);
    const msg = result.error.issues.find(
      (i) => i.path.join(".") === "click.x"
    );
    assert.ok(msg, "Expected an issue on click.x");
  });

  it("rejects a click event with missing target", () => {
    const input = validClick();
    delete input.click.target;
    const result = eventRequestSchema.safeParse(input);
    assert.equal(result.success, false);
  });
});

describe("normalizePageUrl", () => {
  it("strips query parameters", () => {
    const result = normalizePageUrl("https://example.com/pricing?ref=google");
    assert.equal(result, "https://example.com/pricing");
  });

  it("strips URL fragments", () => {
    const result = normalizePageUrl("https://example.com/docs#section-3");
    assert.equal(result, "https://example.com/docs");
  });

  it("strips both query and fragment", () => {
    const result = normalizePageUrl(
      "https://example.com/page?a=1&b=2#top"
    );
    assert.equal(result, "https://example.com/page");
  });

  it("preserves origin and pathname", () => {
    const result = normalizePageUrl("http://localhost:3000/dashboard/users");
    assert.equal(result, "http://localhost:3000/dashboard/users");
  });
});
