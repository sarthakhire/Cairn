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