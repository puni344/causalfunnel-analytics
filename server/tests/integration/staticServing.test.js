// server/tests/integration/staticServing.test.js
// ─────────────────────────────────────────────────────────
// Integration tests for static file serving:
//   1. GET /tracker.js
//   2. GET /demo/index.html
//   3. GET /demo/about.html
//   4. GET /demo/demo.css
//   5. Negative tests (prevent leaking private files)
// ─────────────────────────────────────────────────────────

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import app from "../../src/app.js";

let server;
let BASE_URL;

describe("Static Serving — Integration Tests", () => {
  before(async () => {
    server = app.listen(0);
    const { port } = server.address();
    BASE_URL = `http://localhost:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("GET /tracker.js serves tracking script with javascript content-type", async () => {
    const res = await fetch(`${BASE_URL}/tracker.js`);
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /javascript/);
    const text = await res.text();
    assert.match(text, /CausalFunnel Analytics Tracker/);
    assert.match(text, /__CF_TRACKER_INITIALIZED__/);
  });

  it("GET /demo/index.html serves homepage HTML with tracker script tag", async () => {
    const res = await fetch(`${BASE_URL}/demo/index.html`);
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/html/);
    const text = await res.text();
    assert.match(text, /<title>CausalFunnel Analytics Demo — Home<\/title>/);
    assert.match(text, /<script src="\/tracker\.js"/);
    assert.match(text, /id="btn-hero-primary"/);
    assert.match(text, /id="btn-deep-scroll"/);
  });

  it("GET /demo/about.html serves about page HTML with tracker script tag", async () => {
    const res = await fetch(`${BASE_URL}/demo/about.html`);
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/html/);
    const text = await res.text();
    assert.match(text, /<title>CausalFunnel Analytics Demo — About<\/title>/);
    assert.match(text, /<script src="\/tracker\.js"/);
    assert.match(text, /id="link-hero-home"/);
  });

  it("GET /demo/demo.css serves stylesheet with text/css content-type", async () => {
    const res = await fetch(`${BASE_URL}/demo/demo.css`);
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/css/);
    const text = await res.text();
    assert.match(text, /--primary:/);
  });

  it("returns 404 for non-existent static demo file", async () => {
    const res = await fetch(`${BASE_URL}/demo/nonexistent-file.html`);
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.error, "Not Found");
  });

  it("returns 404 for unrecognized demo paths and subpaths", async () => {
    const res = await fetch(`${BASE_URL}/demo/unknown/deep/path.html`);
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.error, "Not Found");
  });

  it("returns 404 for unknown API paths", async () => {
    const res = await fetch(`${BASE_URL}/api/nonexistent`);
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.error, "Not Found");
  });

  it("does not expose server .env, client .env, or package.json files", async () => {
    const resEnv = await fetch(`${BASE_URL}/.env`);
    assert.strictEqual(resEnv.status, 404);
    const textEnv = await resEnv.text();
    assert.doesNotMatch(textEnv, /MONGODB_URI/);

    const resClientEnv = await fetch(`${BASE_URL}/client/.env`);
    assert.strictEqual(resClientEnv.status, 404);

    const resPkg = await fetch(`${BASE_URL}/package.json`);
    assert.strictEqual(resPkg.status, 404);
    const textPkg = await resPkg.text();
    assert.doesNotMatch(textPkg, /"dependencies"/);
  });

  it("denies access to dotfiles under /demo (e.g. /demo/.env)", async () => {
    const res = await fetch(`${BASE_URL}/demo/.env`);
    // Static middleware denies dotfiles; express responds with 403 or 404 without disclosure
    assert.ok(res.status === 403 || res.status === 404);
    const text = await res.text();
    assert.doesNotMatch(text, /MONGODB_URI/);
    assert.doesNotMatch(text, /VITE_API_URL/);
  });

  it("blocks directory traversal attempts (e.g. /demo/..%2fserver/.env and /..%2fserver/.env)", async () => {
    const traversalUrls = [
      `${BASE_URL}/demo/..%2fserver/.env`,
      `${BASE_URL}/demo/..%2f..%2fserver/.env`,
      `${BASE_URL}/demo/..%5cserver/.env`,
      `${BASE_URL}/..%2fserver/.env`,
      `${BASE_URL}/..%2f.env`,
    ];

    for (const url of traversalUrls) {
      const res = await fetch(url);
      assert.ok(
        res.status === 400 || res.status === 403 || res.status === 404,
        `Expected blocked status for ${url}, got ${res.status}`
      );
      const text = await res.text();
      assert.doesNotMatch(text, /MONGODB_URI/);
      assert.doesNotMatch(text, /PORT=/);
    }
  });
});
