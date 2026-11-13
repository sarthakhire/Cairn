## POST /api/sources (lead only)

Upload a source file. `multipart/form-data` with fields:
- `file`: .md, .json or .csv, max 2 MB
- `sensitivity`: team | lead_only | restricted (required)
- `formality`: formal | informal (optional, default informal)

201: `{ "source": { "id", "name", "kind", "sensitivity", "formality" }, "chunkCount": 5 }`
Errors, all `{ "error": "message" }`: 400 missing or invalid field, 409 name already exists,
413 file too large, 415 unsupported type, 422 file could not be read.

## Auth and role rules (Phase 4)

Roles: `lead` (the reviewer), `incoming_lead`, `incoming_developer`.

`POST /api/auth/login` body `{ email, password }` returns `{ token, user: { id, name, email, role } }`. Send the token as `Authorization: Bearer <token>` on every other call. Missing, expired or forged token gives 401. Wrong email or password gives one identical 401.

| Role | team | lead_only | restricted | draft / rejected |
|---|---|---|---|---|
| lead | full | full | full | visible |
| incoming_lead | full | full | placeholder | hidden |
| incoming_developer | full | hidden (no count) | placeholder | hidden |

A placeholder keeps `id`, `type`, `status`, `visibility` and `review`. It carries the placeholder statement, empty `evidence`, `nextAction: null`, `conflictsWith: []`, `inference: false`.

`conflictsWith` only lists ids of claims the caller can also see.

`GET /api/claims/:id` returns 404 both for a missing claim and for one the caller may not see.
## POST /api/extract (lead only)

Runs extraction and verification over every uploaded chunk, one tier at a time (team, lead_only, restricted). No body. Replaces all existing `draft` claims with new ones. Accepted, edited and rejected claims are never touched.

200:

```json
{
  "claimsCreated": 12,
  "verified": 5,
  "uncertain": 4,
  "conflicting": 2,
  "missing": 1,
  "evidenceCoverage": 0.42,
  "quotesNotFound": 1,
  "dropped": 2,
  "duplicatesSkipped": 0,
  "skippedBatches": 0,
  "draftsReplaced": 9,
  "perTier": { "team": { "claims": 8, "verified": 4 }, "lead_only": { "claims": 3, "verified": 1 }, "restricted": { "claims": 1, "verified": 0 } }
}
```

`evidenceCoverage` is verified claims divided by all claims. Errors, all `{ "error": "message" }`: 401, 403 (not the reviewer), 409 (a run is already in progress), 422 (no chunks uploaded yet), 502 (the model returned nothing usable, existing drafts kept), 503 (`LLM_API_KEY` not set).

Extraction rules: a claim inherits the tier of the chunks it came from. `verified` needs a quote found in a formal source and a yes from the support check. A claim without a quote is kept only as `missing` (open_question and ownership); for other types it is dropped. `conflicting` is flagged only between claims of the same tier, type and subject.

## Review, approval and audit (Phase 6)

All routes need `Authorization: Bearer <token>`. Errors are `{ "error": "message" }`.

### GET /api/claims and GET /api/claims/:id (all roles)

The `lead` sees the live claims, drafts and rejected included. `incoming_lead` and `incoming_developer` see only the **approved version** (the snapshot saved at approval), filtered by the role table above. Until a version is approved they get `[]` (and 404 on a single claim). Edits the lead makes after approving do not reach them until the next approval.

### PATCH /api/claims/:id (lead only)

Body: `{ "action": "accept" }`, `{ "action": "reject" }` or `{ "action": "edit", "statement": "new text" }` (1 to 1000 characters, must differ from the current one).
200: the updated claim. Review state becomes `accepted`, `rejected` or `edited`. An edit changes only the statement and review fields: evidence and status are never touched, so an edit can never make a claim `verified`.
Errors: 400 bad body or unchanged statement, 403 not the lead, 404 unknown id.

### GET /api/approval (all roles)

Lead: `{ approval, acknowledgements, pendingCount, changedCount, nextVersion, versions }`.
Incoming roles: `{ approval, acknowledgements }` only, and `acknowledgements` holds just their own receipt.

- `approval`: `{ "by": "Demo Lead", "at": "2026-03-02T18:40:00", "version": 2 }` or `null` when nothing is shared.
- `acknowledgements`: `{ "incoming_lead": { "at": "2026-03-03T09:00:00" } }`, empty when none.
- `changedCount`: claims that differ between the approved version and the live claims.
- `versions`: `[{ "number", "by", "at", "summary": { total, verified, conflicts, missing, draft }, "claims": [...] }]`, oldest first.

### POST /api/approval (lead only)

No body. Saves every current claim as the next version, makes it the one incoming roles see, and clears all acknowledgements. 201 with the same body as GET. 409 if two approvals collide (retry).

### DELETE /api/approval (lead only)

Revokes sharing; versions are kept. 200 with the same body as GET. 409 if nothing is approved.

### POST /api/approval/acknowledge (incoming roles only)

No body. Records that the caller confirmed receipt of the approved version; the first time is kept. 200 with the incoming-role body of GET. 403 for the lead, 409 if nothing is approved.

### GET /api/audit (lead only)

Newest first, at most 200: `[{ "at": "2026-03-02T18:40:00", "actor": "Demo Lead", "action": "Accepted", "detail": "..." }]`.
Actions: Accepted, Rejected, Edited, Handover approved, Approval revoked, Acknowledged, Source imported, Extraction run.

### GET /api/sources (lead only)

`[{ "id", "name", "kind", "sensitivity", "formality", "chunkCount", "redactions": { credential, email, phone }, "redactedTotal", "at" }]`, newest first. Never includes chunk text.

### POST /api/sources (lead only)

Multipart form: `sensitivity` (`team`, `lead_only` or `restricted`), `formality` (`formal` or `informal`, default `informal`), and the file in a field named `file` (.md, .json or .csv, up to 2 MB). Send the text fields before the file.
201: `{ "source": {...}, "chunkCount": 6, "redactions": { credential, email, phone }, "redactedTotal": 3 }`.

- For `team` and `lead_only` sources the server masks credentials, emails and phone numbers **before storing**, so only the redacted text exists. The counts are returned and written to the audit log.
- `restricted` sources are stored as written (secrets belong there) and are readable only by the reviewer; their counts are 0.
- 400 missing or bad fields, 409 a source with that file name already exists, 413 too large, 415 unsupported type, 422 unreadable content.

### Demo accounts (npm run seed)

`lead@demo.test`, `incoming.lead@demo.test`, `incoming.dev@demo.test`. Set `SEED_PASSWORD` in `.env` to choose the password (for example `demo1234`); otherwise one is generated and printed once. Running the seed also removes the old `@cairn.demo` accounts.


## Conflicts and gap answers (Phase 7)

Both routes are lead only (401 without a token, 403 for other roles).

### POST /api/claims/resolve

Body: `{ "keepId": "c_001", "dropId": "c_002" }`. Two claims that point at each other as conflicts.
200: `{ "claims": [...] }`, every claim the resolution changed, in the normal claim shape.

- The kept claim becomes `accepted`; the set-aside claim becomes `rejected` and loses all its conflict links.
- A claim with no conflicts left goes back to the status its own evidence earned (`baseStatus`). **Resolving never upgrades a claim to `verified`**; a human choice shows in `review.state`, not in `status`. (The old mock set the kept claim to `verified`; the client should stop assuming that.)
- A claim still in another conflict stays `conflicting`.
- 400 for a bad body or the same id twice, 409 if the two claims are not in conflict with each other (or do not exist).
- Writes an audit row "Conflict resolved".

### GET /api/claims/resolutions

The resolution log, newest first: `[{ "keepId", "dropId", "keepStatement", "dropStatement", "by", "at" }]`.

### POST /api/claims/:id/answer

Body: `{ "answer": "text" }` (1 to 2000 characters). Only for open questions: status `missing`, or `uncertain` with `inference: true`, and never `restricted` (400 otherwise, 404 for an unknown id).
201: `{ "claim": {...}, "replaced": "c_003", "redacted": { "credential": 1, "email": 0, "phone": 1, "total": 2 } }`.

- Credentials, emails and phone numbers are masked **before anything is stored**; show the notice when `redacted.total > 0`.
- The new claim: same type and visibility as the question, statement `"<question> Answer: <text>"`, status `uncertain`, review `draft`, `inference: false`, evidence from a source named "Answer from departing member" (or "Answer from departing member (lead only)" for lead-only questions). That source is informal, so an answer can never become `verified` on its own.
- The original question claim is deleted; the new one gets the next claim id.
- Writes an audit row "Gap answered".
