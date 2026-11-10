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