# Cairn Testing

How Cairn was tested for Round 3, what passed, what broke, and what is not covered.

Fields marked `FILL` must be completed from the real test runs before this file is committed. Do not leave a `FILL` in the final version.

---

## 1. Automated tests

| Area | Command | Baseline (Round 2) | Final count | Result |
|---|---|---|---|---|
| Server (`node --test`) | `cd server && npm test` | 164 passing | FILL | FILL |
| Client | `cd client && npm test` | FILL | FILL | FILL |
| Lint | `cd client && npm run lint` | n/a | n/a | FILL |
| Build | `cd client && npm run build` | n/a | n/a | FILL |

Last full run: FILL (date and time), Node version: FILL

### What the new server tests cover

Fill in the real test file names and counts.

| Area | Test file | Tests | What it proves |
|---|---|---|---|
| Quote matcher | `verify-match.test.js` | FILL | exact, fuzzy, number guard, negation guard, wrong chunk, too short |
| Planted fakes | FILL | FILL | each fake gets its expected result and reason |
| Approval gate | FILL | FILL | draft blocks, accepted mismatch blocks, override unblocks, partial does not block, repeat approval returns 409 |
| Review workflow | FILL | FILL | accept, edit, reject, reopen, override rules, repeated action is a no-op |
| Leak tests | FILL | FILL | reason, override, history and original text never reach incoming roles |
| Audit | FILL | FILL | filters, paging, denied access logging, CSV safety |

Note: the API tests use fixtures instead of a real database. They prove permission logic, not real MongoDB behaviour. The real-database run is in section 2.

---

## 2. Real-database run

Real server against a real MongoDB, all three accounts.

Date: FILL. Database: FILL (scratch Atlas database or local).

| Step | Role | Result | Notes |
|---|---|---|---|
| Upload sources | lead | FILL | |
| Extract or restore demo data | lead | FILL | |
| Review claims | lead | FILL | |
| Reject with reason | lead | FILL | |
| Edit a claim | lead | FILL | |
| Accept an overridden mismatch | lead | FILL | |
| Approve | lead | FILL | |
| Acknowledge | incoming roles | FILL | |
| Revoke approval | lead | FILL | |
| View as | lead | FILL | |
| Audit filters | lead | FILL | |
| Export | lead | FILL | |

---

## 3. End-to-end matrix

Each row was run in a private window against the live link, and again locally.

Live URL: FILL. Tester(s): FILL.

Result values: `PASS`, `FAIL`, or `LIMITATION` (declared in `what-does-not-work.md`).

| # | Role | Journey | Expected | Live | Local | Date | Notes |
|---|---|---|---|---|---|---|---|
| 1 | any | Open the link with the server asleep | Wake-up message, then the login form works, nothing hangs | FILL | FILL | FILL | |
| 2 | any | Wrong password, empty fields, very long email | Clear error, no crash | FILL | FILL | FILL | |
| 3 | any | Refresh after login | Still signed in; after 8 hours, back to login with a message | FILL | FILL | FILL | |
| 4 | lead | Open a claim with verified, partial and mismatch evidence | Badges, side-by-side quote and passage, score and reason | FILL | FILL | FILL | |
| 5 | lead | Reject with an empty or short reason | Blocked in the UI and by the server (400) | FILL | FILL | FILL | |
| 6 | lead | Reject with a reason, then reopen | History shows both, audit shows both rows | FILL | FILL | FILL | |
| 7 | lead | Edit a claim | "Human edited" chip, original in history, status unchanged | FILL | FILL | FILL | |
| 8 | lead | Accept a mismatch claim without an override | Blocked; with an override, accepted and marked | FILL | FILL | FILL | |
| 9 | lead | Approve with a draft pending | 409 with a blockers list that links to the claims | FILL | FILL | FILL | |
| 10 | lead | Approve twice in a row | Second time says nothing changed; one version, one audit row | FILL | FILL | FILL | |
| 11 | lead | Double-click Accept | One request, one history entry | FILL | FILL | FILL | |
| 12 | lead | Preview as Incoming developer | Same claims that role really sees, banner shown, actions disabled | FILL | FILL | FILL | |
| 13 | lead | Audit filters (actor, action, outcome, date, claim), paging, export | Correct rows, no duplicates across pages, CSV opens in Excel | FILL | FILL | FILL | |
| 14 | incoming_dev | Before any approval | "Nothing has been shared yet" | FILL | FILL | FILL | |
| 15 | incoming_dev | After approval | No lead_only claims, no counts, restricted shown as placeholder, no reasons or history | FILL | FILL | FILL | |
| 16 | incoming_dev | Request a hidden claim id directly | 404 identical to a missing id; a denied row appears in the lead's audit | FILL | FILL | FILL | |
| 17 | incoming_dev | Call a lead-only API (audit, sources) | 403 and a denied row | FILL | FILL | FILL | |
| 18 | incoming_lead | Sees lead_only but not restricted detail | Matches the permission matrix | FILL | FILL | FILL | |
| 19 | incoming roles | Acknowledge twice | One acknowledgement, one audit row | FILL | FILL | FILL | |
| 20 | lead | Upload an empty file, a 3 MB file, a .txt, a malformed CSV and JSON | Clear errors, no 500 | FILL | FILL | FILL | |
| 21 | lead | Upload one .md, one .json, one .csv | Each ingests, kinds shown correctly | FILL | FILL | FILL | |
| 22 | lead | Run extraction with no LLM key | Friendly message, no hang | FILL | FILL | FILL | |
| 23 | lead | Upload a file with a fake email and password to a team source | Masked in the stored text; restricted source is not masked | FILL | FILL | FILL | |
| 24 | lead | Restore demo data after breaking things | Back to the known-good state | FILL | FILL | FILL | |
| 25 | any | Phone-width layout | No horizontal scroll, dialogs usable | FILL | FILL | FILL | |

Summary: FILL passed, FILL failed, FILL declared limitations, out of 25.

---

## 4. Bugs found and fixed

Real list only. Fixed in order of severity: crashes and hangs, then wrong data, then rough edges.

| # | Found in | Severity | Problem | Fix | Commit |
|---|---|---|---|---|---|
| 1 | FILL (matrix row or step) | FILL | FILL | FILL | FILL |

---

## 5. Not tested

Be honest here. Items to confirm or remove:

- Real LLM extraction at scale (only a stub LLM is used in automated tests; extraction on live data used pre-extracted claims). FILL: confirm.
- Load and concurrency (many judges using the shared demo database at once).
- Browsers other than FILL (list the browsers and phones actually used).
- Token expiry after 8 hours on the live site. FILL: confirm whether tested.
- FILL: anything else.

---

## 6. How to re-run

```powershell
cd server
npm install
npm test

cd ..\client
npm install
npm test
npm run lint
npm run build
```

Expected: no failures, lint clean, build succeeds.