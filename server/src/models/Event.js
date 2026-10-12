// server/src/models/Event.js
// ─────────────────────────────────────────────────────────
// Mongoose model for analytics events.
//
// One document per accepted event. The collection is named
// "events". Each document stores either a page_view or a
// click with its coordinates and target metadata.
//
// Indexes:
//   1. Unique on eventId   → prevents duplicate documents
//      when the tracker retries the same request.
//   2. Compound (sessionId + timestamp) → supports future
//      session-journal queries that list events in order.
//   3. Compound (type + pageUrl) → supports queries like
//      "show me all clicks on /pricing".
// ─────────────────────────────────────────────────────────

import mongoose from "mongoose";

const { Schema } = mongoose;

// ── Click target sub-schema ──────────────────────────────
const clickTargetSchema = new Schema(
  {
    tag: { type: String, required: true, maxlength: 50 },
    id: { type: String, default: "", maxlength: 200 },
    class: { type: String, default: "", maxlength: 500 },
  },
  { _id: false }
);

// ── Click sub-schema ─────────────────────────────────────
const clickSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    pageX: { type: Number, required: true },
    pageY: { type: Number, required: true },
    target: { type: clickTargetSchema, required: true },
  },
  { _id: false }
);

// ── Dimensions sub-schema ────────────────────────────────
const dimensionsSchema = new Schema(
  {
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

// ── Main event schema ────────────────────────────────────
const eventSchema = new Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    sessionId: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 64,
    },
    type: {
      type: String,
      required: true,
      enum: ["page_view", "click"],
    },
    pageUrl: {
      type: String,
      required: true,
      maxlength: 2048,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    receivedAt: {
      type: Date,
      required: true,
    },
    viewport: {
      type: dimensionsSchema,
      required: true,
    },
    pageDimensions: {
      type: dimensionsSchema,
      required: true,
    },
    click: {
      type: clickSchema,
      default: undefined, // absent for page_view events
    },
  },
  {
    // Disable the automatic __v version key; we don't need
    // optimistic-locking for write-once analytics events.
    versionKey: false,
  }
);

// ── Indexes ──────────────────────────────────────────────
// 1. eventId unique index is created automatically by
//    `unique: true` above.

// 2. Session journal: look up all events for a session,
//    sorted by the time they occurred in the browser.
eventSchema.index({ sessionId: 1, timestamp: 1 });

// 3. Click queries: find click events on a specific page.
eventSchema.index({ type: 1, pageUrl: 1 });

const Event = mongoose.model("Event", eventSchema);

export default Event;
