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
## POST /api/sources (new, lead only once auth is in)

Upload a source file. `multipart/form-data` with fields:
- `file`: .md, .json or .csv, max 2 MB
- `sensitivity`: team | lead_only | restricted (required)
- `formality`: formal | informal (optional, default informal)

201: `{ "source": { "id", "name", "kind", "sensitivity", "formality" }, "chunkCount": 5 }`
Errors, all `{ "error": "message" }`: 400 missing or invalid field, 409 name already exists,
413 file too large, 415 unsupported type, 422 file could not be read.