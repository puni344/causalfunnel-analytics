// server/tests/integration/events.test.js
// ─────────────────────────────────────────────────────────
// Integration tests for POST /api/events.
//
// These tests require a REAL MongoDB connection. They:
//   • Connect to Atlas using the same .env credentials.
//   • Start the Express app on a random port.
//   • Send actual HTTP requests with fetch().
//   • Inspect saved documents and indexes in MongoDB.
//   • Clean up ONLY the test documents they created.
//
// Run with:  node --test tests/integration/events.test.js
// ─────────────────────────────────────────────────────────

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "../../src/config/db.js";
import app from "../../src/app.js";
import Event from "../../src/models/Event.js";

let server;
let BASE_URL;
const createdEventIds = []; // track IDs for cleanup

// ── Helpers ──────────────────────────────────────────────

function makePageView(overrides = {}) {
  const id = randomUUID();
  createdEventIds.push(id);
  return {
    eventId: id,
    sessionId: "test_sess_12345678",
    type: "page_view",
    pageUrl: "https://example.com/test-page?ref=unit",
    timestamp: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
    pageDimensions: { width: 1920, height: 4500 },
    ...overrides,
  };
}

function makeClick(overrides = {}) {
  const id = randomUUID();
  createdEventIds.push(id);
  return {
    eventId: id,
    sessionId: "test_sess_12345678",
    type: "click",
    pageUrl: "https://example.com/test-page",
    timestamp: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
    pageDimensions: { width: 1920, height: 4500 },
    click: {
      x: 150,
      y: 300,
      pageX: 150,
      pageY: 1300,
      target: { tag: "BUTTON", id: "cta-buy", class: "btn-primary" },
    },
    ...overrides,
  };
}

async function post(path, body) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ── Setup & teardown ─────────────────────────────────────

before(async () => {
  await connectDB();

  // Ensure indexes are built before running tests
  await Event.ensureIndexes();

  // Start on a random port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      BASE_URL = `http://localhost:${port}`;
      console.log(`  🧪 Integration test server on ${BASE_URL}`);
      resolve();
    });
  });
});

after(async () => {
  // Clean up only the documents this test run created
  if (createdEventIds.length > 0) {
    const result = await Event.deleteMany({
      eventId: { $in: createdEventIds },
    });
    console.log(`  🧹 Cleaned up ${result.deletedCount} test documents`);
  }

  if (server) server.close();
  await mongoose.disconnect();
});

// ── Tests ────────────────────────────────────────────────

describe("POST /api/events — happy paths", () => {
  it("1. saves a valid page_view and returns 201", async () => {
    const payload = makePageView();
    const res = await post("/api/events", payload);
    assert.equal(res.status, 201);

    const json = await res.json();
    assert.equal(json.data.eventId, payload.eventId);
    assert.equal(json.data.duplicate, false);

    // Verify in MongoDB
    const doc = await Event.findOne({ eventId: payload.eventId }).lean();
    assert.ok(doc, "Document should exist in MongoDB");
    assert.equal(doc.type, "page_view");
    assert.equal(doc.click, undefined, "click should be absent");
  });

  it("2. saves a valid click event with coordinates and target", async () => {
    const payload = makeClick();
    const res = await post("/api/events", payload);
    assert.equal(res.status, 201);

    const doc = await Event.findOne({ eventId: payload.eventId }).lean();
    assert.ok(doc);
    assert.equal(doc.type, "click");
    assert.equal(doc.click.x, 150);
    assert.equal(doc.click.y, 300);
    assert.equal(doc.click.pageX, 150);
    assert.equal(doc.click.pageY, 1300);
    assert.equal(doc.click.target.tag, "BUTTON");
    assert.equal(doc.click.target.id, "cta-buy");
    assert.equal(doc.click.target.class, "btn-primary");
  });

  it("11. normalizes pageUrl — strips query params and fragments", async () => {
    const payload = makePageView({
      pageUrl: "https://example.com/pricing?ref=google&utm=test#section",
    });
    const res = await post("/api/events", payload);
    assert.equal(res.status, 201);

    const doc = await Event.findOne({ eventId: payload.eventId }).lean();
    assert.equal(
      doc.pageUrl,
      "https://example.com/pricing",
      "Query params and fragment should be stripped"
    );
  });
});

describe("POST /api/events — duplicate handling", () => {
  it("3. second request with same eventId returns 200 duplicate:true, no extra document", async () => {
    const payload = makePageView();

    // First request — creates document
    const res1 = await post("/api/events", payload);
    assert.equal(res1.status, 201);

    // Second request — same eventId
    const res2 = await post("/api/events", payload);
    assert.equal(res2.status, 200);
    const json2 = await res2.json();
    assert.equal(json2.data.duplicate, true);

    // Only one document should exist
    const count = await Event.countDocuments({ eventId: payload.eventId });
    assert.equal(count, 1, "Duplicate should not create a second document");
  });
});

describe("POST /api/events — validation errors (400)", () => {
  it("4. rejects an invalid event type", async () => {
    const res = await post("/api/events", makePageView({ type: "hover" }));
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, "Validation Error");
  });

  it("5. rejects missing required fields", async () => {
    const res = await post("/api/events", { eventId: randomUUID() });
    assert.equal(res.status, 400);
  });

  it("6a. rejects an invalid URL", async () => {
    const res = await post(
      "/api/events",
      makePageView({ pageUrl: "not-a-url" })
    );
    assert.equal(res.status, 400);
  });

  it("6b. rejects a timestamp far in the future", async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await post(
      "/api/events",
      makePageView({ timestamp: future })
    );
    assert.equal(res.status, 400);
  });

  it("7. rejects a click event missing coordinates", async () => {
    const payload = makeClick();
    delete payload.click.x;
    delete payload.click.y;
    const res = await post("/api/events", payload);
    assert.equal(res.status, 400);
  });

  it("8. rejects negative click coordinates", async () => {
    const payload = makeClick({
      click: {
        x: -5,
        y: 200,
        pageX: 100,
        pageY: 1200,
        target: { tag: "A" },
      },
    });
    const res = await post("/api/events", payload);
    assert.equal(res.status, 400);
  });

  it("8b. rejects out-of-range coordinates (x > viewport.width)", async () => {
    const payload = makeClick({
      viewport: { width: 1920, height: 1080 },
      click: {
        x: 2000,
        y: 200,
        pageX: 2000,
        pageY: 1200,
        target: { tag: "DIV" },
      },
    });
    const res = await post("/api/events", payload);
    assert.equal(res.status, 400);
  });

  it("9. rejects a page_view containing a click object", async () => {
    const payload = makePageView({
      click: {
        x: 10,
        y: 20,
        pageX: 10,
        pageY: 20,
        target: { tag: "A" },
      },
    });
    const res = await post("/api/events", payload);
    assert.equal(res.status, 400);
    const json = await res.json();
    const messages = json.details.map((d) => d.message).join(" ");
    assert.ok(messages.includes("must not be present"), messages);
  });
});

describe("POST /api/events — unknown fields & normalization", () => {
  it("10. unknown fields are not stored in MongoDB", async () => {
    const payload = makePageView({
      secretToken: "steal-me",
      userPassword: "hunter2",
    });
    const res = await post("/api/events", payload);
    assert.equal(res.status, 201);

    const doc = await Event.findOne({ eventId: payload.eventId }).lean();
    assert.equal(doc.secretToken, undefined);
    assert.equal(doc.userPassword, undefined);
  });
});

describe("POST /api/events — error handling", () => {
  it("13a. malformed JSON returns 400", async () => {
    const res = await fetch(`${BASE_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json!!!",
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.toLowerCase().includes("malformed"));
  });

  it("13b. oversized body returns 413", async () => {
    // Create a payload > 100 KB
    const huge = { data: "x".repeat(200_000) };
    const res = await fetch(`${BASE_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(huge),
    });
    assert.equal(res.status, 413);
  });
});

describe("POST /api/events — index verification", () => {
  it("confirms indexes are built on the events collection", async () => {
    const indexes = await Event.collection.indexes();
    const indexKeys = indexes.map((idx) => Object.keys(idx.key).join("+"));

    // eventId unique
    assert.ok(
      indexes.some((idx) => idx.key.eventId && idx.unique),
      "eventId unique index should exist"
    );
    // sessionId + timestamp compound
    assert.ok(
      indexKeys.includes("sessionId+timestamp"),
      "sessionId+timestamp compound index should exist"
    );
    // type + pageUrl compound
    assert.ok(
      indexKeys.includes("type+pageUrl"),
      "type+pageUrl compound index should exist"
    );

    console.log("  📇 Indexes found:", indexKeys.join(", "));
  });
});
