# API Contract

Frontend aur backend ke beech ka format. Source of truth: `client/src/mock/claims.json`.
Koi field badalni ho to dono ko bata ke yahan update karo.

## Claim object

| Field | Type | Values / notes |
|---|---|---|
| id | string | e.g. "c_001" |
| type | string | decision, open_question, ownership, risk_dependency, next_action |
| statement | string | The claim in one sentence |
| status | string | verified, uncertain, conflicting, missing |
| evidence | array | Each item: quote, source, chunk, date. Empty for missing |
| visibility | string | team, lead_only, restricted |
| review | object | state: draft, accepted, edited, rejected. by and at are null until reviewed |
| nextAction | string or null | Linked next action |
| conflictsWith | array of ids | Claim ids this one contradicts |
| inference | boolean | true means AI inference, UI shows an "AI inference" label |

## Rules the backend must follow

- A claim cannot be `verified` without at least one verified quote.
- Restricted claims: send the placeholder statement "Restricted: request access from reviewer" and no evidence. Never send the real text to a role that cannot see it.
- Filtering by role happens on the server. The frontend does not hide anything.

## Proposed endpoints (Sarthak to confirm or change)

| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/login | Login with a seeded role account, returns JWT |
| POST | /api/sources | Upload a source with a sensitivity label |
| GET | /api/claims | List claims for the logged-in role |
| GET | /api/claims/:id | One claim with evidence |
| PATCH | /api/claims/:id/review | Body: state (accepted, edited, rejected), optional statement |
| GET | /api/handover | Role-based handover view (approved claims only) |
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