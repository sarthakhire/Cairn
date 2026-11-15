const test = require("node:test");
const assert = require("node:assert");
const { serializeClaim } = require("../src/services/serializer");
const mock = require("../../client/src/mock/claims.json");

// Round 3 added `verification`, `evidence[].match` and more `review` fields. The frontend mock may or
// may not have them yet, so the mock comparison looks at the Round 2 shape on both sides. The new
// fields are checked on their own below.
const round2 = ({ verification, evidence, review, ...rest }) => ({
  ...rest,
  evidence: evidence.map(({ match, ...e }) => e),
  review: { state: review.state, by: review.by, at: review.at },
});

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
        quoteFound: true,
        supportsStatement: true,
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
  const out = serializeClaim(stored);
  assert.deepEqual(round2(out), round2(mock.find((c) => c.id === "c_001")));
  assert.equal(out.verification, "verified");
  assert.equal(out.evidence[0].match.result, "verified");
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
  assert.equal(out.review.state, "draft");
  assert.equal(out.review.by, null);
  assert.equal(out.review.at, null);
  assert.deepEqual(out.evidence, []);
  assert.equal(out.nextAction, null);
  assert.equal(out.inference, false);
});

test("a claim saved before the review workflow gets safe defaults for the new review fields", () => {
  const out = serializeClaim({
    claimId: "c_007", type: "decision", statement: "x", status: "uncertain", visibility: "team",
    evidence: [], review: { state: "accepted", reviewerId: { name: "Lead" }, at: new Date("2026-03-02T18:40:00Z") },
  });
  assert.deepEqual(out.review, {
    state: "accepted", by: "Lead", at: "2026-03-02T18:40:00",
    edited: false, originalStatement: null, reason: null, override: null, history: [],
  });
  assert.equal(serializeClaim({ claimId: "c_008", type: "decision", statement: "x", status: "uncertain", visibility: "team", evidence: [], review: { state: "edited" } }).review.edited, true);
});

test("the reviewer view carries reason, override, history and original wording with names and ISO dates", () => {
  const at = new Date("2026-11-14T10:00:00Z");
  const out = serializeClaim({
    claimId: "c_009", type: "decision", statement: "New", status: "uncertain", visibility: "team", evidence: [],
    review: {
      state: "edited", reviewerId: { name: "Lead" }, at,
      originalStatement: "Old", reason: null,
      override: { reason: "The quote is right", byId: "u1", byName: "Lead", at },
      history: [{ at, byId: "u1", byName: "Lead", action: "edit", fromState: "draft", toState: "edited", fromStatement: "Old", toStatement: "New", reason: "The quote is right" }],
    },
  });
  assert.equal(out.review.edited, true);
  assert.equal(out.review.originalStatement, "Old");
  assert.deepEqual(out.review.override, { reason: "The quote is right", by: "Lead", at: "2026-11-14T10:00:00" });
  assert.deepEqual(out.review.history, [{
    at: "2026-11-14T10:00:00", by: "Lead", action: "edit", fromState: "draft", toState: "edited",
    fromStatement: "Old", toStatement: "New", reason: "The quote is right",
  }]);
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