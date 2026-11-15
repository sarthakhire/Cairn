const test = require("node:test");
const assert = require("node:assert");
const { parseAuditQuery, buildFilter, fetchAuditPage, DEFAULT_LIMIT, MAX_LIMIT } = require("../src/services/auditQuery");

const ok = (query) => {
  const p = parseAuditQuery(query);
  assert.equal(p.ok, true, JSON.stringify(p));
  return p.filters;
};
const bad = (query) => {
  const p = parseAuditQuery(query);
  assert.equal(p.ok, false, "expected a 400 for " + JSON.stringify(query));
  assert.equal(typeof p.error, "string");
};

test("no parameters gives the defaults", () => {
  const f = ok({});
  assert.equal(f.limit, DEFAULT_LIMIT);
  assert.equal(f.before, undefined);
  assert.deepEqual(buildFilter(f), {});
});

test("limit: whole numbers from 1, cut to the cap, nothing else", () => {
  assert.equal(ok({ limit: "10" }).limit, 10);
  assert.equal(ok({ limit: "200" }).limit, 200);
  assert.equal(ok({ limit: "5000" }).limit, MAX_LIMIT);
  for (const limit of ["0", "-1", "abc", "1.5", "1e3", " "]) {
    if (limit === " ") assert.equal(ok({ limit }).limit, DEFAULT_LIMIT); // blank counts as absent
    else bad({ limit });
  }
});

test("bad values and unknown parameters are refused", () => {
  bad({ outcome: "maybe" });
  bad({ claimId: "c_x" });
  bad({ claimId: "C_001" });
  bad({ before: "not-an-id" });
  bad({ before: "a".repeat(23) });
  bad({ nope: "1" });
  bad({ actor: ["a", "b"] }); // ?actor=a&actor=b
  bad({ actor: { $ne: "x" } }); // ?actor[$ne]=x
  bad({ actor: "x".repeat(101) });
  bad({ action: "x".repeat(101) });
});

test("dates: real calendar dates only, zone-less times are UTC, a date-only 'to' covers that whole day", () => {
  for (const from of ["2026-13-01", "2026-02-30", "yesterday", "2026-11-14T25:00:00Z", "14/11/2026", "2026-11-14 10:00"]) bad({ from });
  for (const to of ["2026-00-10", "tomorrow"]) bad({ to });
  const a = ok({ from: "2026-11-14T10:00:00" });
  assert.equal(a.from.toISOString(), "2026-11-14T10:00:00.000Z");
  const b = ok({ from: "2026-11-14T10:00:00+05:30" });
  assert.equal(b.from.toISOString(), "2026-11-14T04:30:00.000Z");
  const c = ok({ from: "2026-11-14", to: "2026-11-14" });
  assert.equal(c.to.toISOString(), "2026-11-15T00:00:00.000Z");
  assert.equal(c.toExclusive, true);
  const d = ok({ to: "2026-11-14T12:00:00Z" });
  assert.equal(d.toExclusive, false);
  bad({ from: "2026-11-15", to: "2026-11-14" });
  bad({ from: "2026-11-14T10:00:00Z", to: "2026-11-14T09:00:00Z" });
  ok({ from: "2026-11-14T10:00:00Z", to: "2026-11-14T10:00:00Z" }); // a single instant is allowed
});

test("blank values count as absent", () => {
  const f = ok({ actor: "  ", action: "", outcome: "", from: "", to: "" });
  assert.deepEqual(buildFilter(f), {});
});

test("the Mongo filter for each parameter", () => {
  assert.deepEqual(buildFilter(ok({ claimId: "c_007" })), { $and: [{ claimId: "c_007" }] });
  assert.deepEqual(buildFilter(ok({ action: "Accepted" })), { $and: [{ action: "Accepted" }] });
  assert.deepEqual(buildFilter(ok({ action: "Extraction run" })), { $and: [{ action: "extract" }] });
  assert.deepEqual(buildFilter(ok({ outcome: "denied" })), { $and: [{ outcome: "denied" }] });
  assert.deepEqual(buildFilter(ok({ outcome: "allowed" })), { $and: [{ outcome: { $ne: "denied" } }] }); // old rows have no value
  assert.deepEqual(buildFilter(ok({}), { actorIds: ["u1"] }), { $and: [{ actorId: { $in: ["u1"] } }] });
  const f = buildFilter(ok({ from: "2026-11-14", to: "2026-11-14" }));
  assert.deepEqual(f.$and[0].at.$gte, new Date("2026-11-14T00:00:00Z"));
  assert.deepEqual(f.$and[0].at.$lt, new Date("2026-11-15T00:00:00Z"));
});

// ---- Paging against a small in-memory stand-in for the model ---------------------------------
const hex = (n) => n.toString(16).padStart(24, "0");
const val = (v) => (v instanceof Date ? v.getTime() : v);

function matches(doc, cond) {
  return Object.entries(cond).every(([key, want]) => {
    if (key === "$and") return want.every((c) => matches(doc, c));
    if (key === "$or") return want.some((c) => matches(doc, c));
    const have = doc[key];
    if (want && typeof want === "object" && !(want instanceof Date)) {
      return Object.entries(want).every(([op, x]) => {
        if (op === "$lt") return val(have) < val(x);
        if (op === "$lte") return val(have) <= val(x);
        if (op === "$gte") return val(have) >= val(x);
        if (op === "$ne") return have !== x;
        if (op === "$in") return x.includes(have);
        throw new Error("operator not supported by the test stand-in: " + op);
      });
    }
    return val(have) === val(want);
  });
}

function fakeModels(rows, users = []) {
  const AuditLog = {
    findById: (id) => ({ select: () => ({ lean: async () => rows.find((r) => r._id === id) || null }) }),
    find: (filter) => {
      let out = rows.filter((r) => matches(r, filter));
      const q = {
        sort: () => {
          out = [...out].sort((a, b) => val(b.at) - val(a.at) || (a._id < b._id ? 1 : -1));
          return q;
        },
        limit: (n) => ((out = out.slice(0, n)), q),
        populate: () => q,
        lean: async () => out,
      };
      return q;
    },
  };
  const User = { find: ({ name }) => ({ select: () => ({ lean: async () => users.filter((u) => u.name === name) }) }) };
  return { AuditLog, User };
}

// 120 rows; many share the same second so the (at, _id) tie-break is exercised.
const ROWS = Array.from({ length: 120 }, (_, i) => ({
  _id: hex(i + 1),
  at: new Date(Date.UTC(2026, 10, 14, 10, 0, Math.floor(i / 7))),
  action: i % 3 === 0 ? "Accepted" : "Rejected",
  outcome: i % 10 === 0 ? "denied" : i % 4 === 0 ? undefined : "allowed",
  claimId: "c_" + String((i % 5) + 1).padStart(3, "0"),
  actorId: i % 2 === 0 ? "u_lead" : "u_dev",
}));
const NEWEST_FIRST = [...ROWS].sort((a, b) => b.at - a.at || (a._id < b._id ? 1 : -1)).map((r) => r._id);

async function readAll(models, filters) {
  const seen = [];
  let before;
  for (let pages = 0; pages < 500; pages++) {
    const page = await fetchAuditPage(models, { ...filters, before });
    seen.push(page.rows.map((r) => r._id));
    if (!page.nextCursor) return seen;
    before = page.nextCursor;
  }
  throw new Error("paging did not end");
}

test("paging: every row exactly once, newest first, no gaps or duplicates", async () => {
  const pages = await readAll(fakeModels(ROWS), ok({ limit: "50" }));
  assert.deepEqual(pages.map((p) => p.length), [50, 50, 20]);
  assert.deepEqual(pages.flat(), NEWEST_FIRST);
});

test("paging: a total that is an exact multiple of the limit has no empty last page", async () => {
  const pages = await readAll(fakeModels(ROWS.slice(0, 100)), ok({ limit: "50" }));
  assert.deepEqual(pages.map((p) => p.length), [50, 50]);
});

test("paging works with every page size, including 1", async () => {
  for (const limit of ["1", "7", "33", "120", "200"]) {
    const pages = await readAll(fakeModels(ROWS), ok({ limit }));
    assert.deepEqual(pages.flat(), NEWEST_FIRST, "limit " + limit);
  }
});

test("filters combine with paging", async () => {
  const f = ok({ outcome: "denied", claimId: "c_001", limit: "3" });
  const pages = await readAll(fakeModels(ROWS), f);
  const want = NEWEST_FIRST.filter((id) => {
    const r = ROWS.find((x) => x._id === id);
    return r.outcome === "denied" && r.claimId === "c_001";
  });
  assert.deepEqual(pages.flat(), want);
  assert.ok(want.length > 0);
});

test("outcome allowed also returns old rows that have no outcome value", async () => {
  const pages = await readAll(fakeModels(ROWS), ok({ outcome: "allowed", limit: "200" }));
  const want = NEWEST_FIRST.filter((id) => ROWS.find((x) => x._id === id).outcome !== "denied");
  assert.deepEqual(pages.flat(), want);
  assert.ok(ROWS.some((r) => r.outcome === undefined));
});

test("time range: from and to bound the rows, a date-only 'to' includes that whole day", async () => {
  const rows = [
    { _id: hex(1), at: new Date("2026-11-13T23:59:59Z"), action: "A" },
    { _id: hex(2), at: new Date("2026-11-14T00:00:00Z"), action: "A" },
    { _id: hex(3), at: new Date("2026-11-14T23:59:59Z"), action: "A" },
    { _id: hex(4), at: new Date("2026-11-15T00:00:00Z"), action: "A" },
  ];
  const pages = await readAll(fakeModels(rows), ok({ from: "2026-11-14", to: "2026-11-14" }));
  assert.deepEqual(pages.flat(), [hex(3), hex(2)]);
});

test("actor filter looks the person up by name; an unknown name gives an empty page", async () => {
  const models = fakeModels(ROWS, [{ _id: "u_lead", name: "Demo Lead" }, { _id: "u_dev", name: "Demo Incoming developer" }]);
  const lead = await fetchAuditPage(models, ok({ actor: "Demo Lead", limit: "200" }));
  assert.equal(lead.rows.length, 60);
  assert.ok(lead.rows.every((r) => r.actorId === "u_lead"));
  assert.deepEqual(await fetchAuditPage(models, ok({ actor: "Nobody" })), { rows: [], nextCursor: null });
});

test("an unknown cursor is a 400, not an empty or restarted page", async () => {
  const page = await fetchAuditPage(fakeModels(ROWS), ok({ before: hex(9999) }));
  assert.deepEqual(page, { error: "Unknown cursor", status: 400 });
});

test("the extraction run can be filtered by the label the audit view shows", async () => {
  const rows = [{ _id: hex(1), at: new Date("2026-11-14T10:00:00Z"), action: "extract" }, { _id: hex(2), at: new Date("2026-11-14T11:00:00Z"), action: "Accepted" }];
  const page = await fetchAuditPage(fakeModels(rows), ok({ action: "Extraction run" }));
  assert.deepEqual(page.rows.map((r) => r._id), [hex(1)]);
});