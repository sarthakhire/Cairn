const test = require("node:test");
const assert = require("node:assert");
const { serializeClaim } = require("../src/services/serializer");
const mock = require("../../client/src/mock/claims.json");

test("serializer output matches the frontend mock (c_001)", () => {
  const stored = {
    claimId: "c_001",
    type: "decision",
    statement: "The frontend is built with React and Vite.",
    status: "verified",
    visibility: "team",
    evidence: [
      {
        quote: "frontend will be React with Vite, fast to set up",
        chunkId: {
          n: 4,
          timestamp: new Date("2026-02-03T00:00:00Z"),
          sourceId: { name: "meeting-notes-01.md" },
        },
      },
    ],
    review: {
      state: "accepted",
      reviewerId: { name: "Lead" },
      at: new Date("2026-03-02T18:40:00Z"),
    },
    nextAction: null,
    conflictsWith: [],
    inference: false,
  };
  assert.deepEqual(serializeClaim(stored), mock.find((c) => c.id === "c_001"));
});

test("unreviewed claim has null by/at and empty evidence is allowed", () => {
  const out = serializeClaim({
    claimId: "c_006",
    type: "open_question",
    statement: "Who owns the deployment credentials?",
    status: "missing",
    visibility: "team",
    evidence: [],
    review: { state: "draft", reviewerId: null, at: null },
    conflictsWith: [],
  });
  assert.deepEqual(out.review, { state: "draft", by: null, at: null });
  assert.deepEqual(out.evidence, []);
  assert.equal(out.nextAction, null);
  assert.equal(out.inference, false);
});

test("evidence date falls back to the source upload date", () => {
  const out = serializeClaim({
    claimId: "c_020",
    type: "decision",
    statement: "x",
    status: "uncertain",
    visibility: "team",
    evidence: [
      {
        quote: "some quote that is long enough",
        chunkId: { n: 1, timestamp: null, sourceId: { name: "a.md", createdAt: new Date("2026-02-10T09:00:00Z") } },
      },
    ],
    review: { state: "draft" },
  });
  assert.equal(out.evidence[0].date, "2026-02-10");
});