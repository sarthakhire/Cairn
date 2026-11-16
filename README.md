# Cairn (HandoverTrail)

Cairn is an evidence-linked knowledge handover tool. It pulls claims (decisions, open questions, ownership, risks, next actions) out of team sources, ties each claim to a quote from the source, checks that quote against the source text, and requires a human reviewer to accept, edit or reject each claim. Nothing reaches the incoming person until the lead approves a version. The server decides what each role can see.

Built by team EthicalOne.

- Live app: https://cairn-handovertrail.netlify.app/
- Backend API: https://cairn-handovertrail.onrender.com (free hosting, it sleeps after 15 minutes, the first request can take up to a minute)

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Lead (reviewer) | lead@demo.test | demo1234 |
| Incoming lead | incoming.lead@demo.test | demo1234 |
| Incoming developer | incoming.dev@demo.test | demo1234 |

These are throwaway demo accounts with synthetic data. The sign-in screen has one-click buttons for each of them. The password only works if the server was seeded with `SEED_PASSWORD=demo1234`.

## Try it in 5 minutes

1. Open the live app and sign in as the lead. If the server is asleep, wait for the wake-up screen to finish.
2. Follow the "Start here" checklist: open a claim and read the Evidence check.
3. Open the Review queue and reject a claim. A reason of 10 to 500 characters is required.
4. Press "Approve handover" and read the blockers it lists.
5. Use "Preview as" to see what the Incoming developer would get.
6. Open the Audit log.

## Features

- Sign-in with roles: lead, incoming lead, incoming developer. The server filters claims by role and by visibility (team, lead only, restricted).
- Source upload (notes, GitHub export, tasks CSV) with redaction of sensitive text at upload.
- Claim extraction from sources with a language model, in three tiers (team, lead only, restricted).
- Evidence verification: every quote is matched against the cited source text and labelled verified, partial, mismatch or none, with a side by side view of the claimed quote and the closest passage.
- Review workflow: accept, edit, reject (with reason) and reopen, an override reason for mismatch claims, and a history of each claim for the lead.
- Approval gate: approval is blocked while claims are still drafts or accepted with a mismatch. Warnings are counted but do not block.
- Versioned approvals, acknowledgement by incoming roles, and revoke.
- Audit trail with filters and paging, including denied access attempts.
- Lead-only "Preview as" for incoming roles, built by the server.
- Conflict resolution, gap questions, timeline and first-week plan views.
- Reliability: request timeouts, wake-up screen for a sleeping server, error boundary, buttons that disable while saving.

See `docs/` for details on each part.

## Architecture

React 19 + Vite + Tailwind 4 client (`client/`), Express 5 + Mongoose API (`server/`), MongoDB Atlas, and a hosted language model used only for extraction. The client only talks to the server through `client/src/lib/api.js`.

## Prerequisites

- Node.js 22
- A MongoDB Atlas connection string (a free cluster works)
- Optional: a language model API key, only needed to run extraction

## Run it locally

Clone and install:

```powershell
git clone https://github.com/sarthakhire/Cairn.git
cd Cairn
cd server
npm install
cd ..\client
npm install
cd ..
```

### Server environment

Copy `server/.env.example` to `server/.env` and fill in:

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | no | Defaults to 5000 |
| `MONGO_URI` | yes | MongoDB Atlas connection string |
| `JWT_SECRET` | yes | At least 16 characters, use a long random value |
| `SEED_PASSWORD` | yes | Password given to the three demo users when seeding (use `demo1234` so the quick-fill buttons work) |
| `CORS_ORIGIN` | yes | Allowed frontend origin(s), comma separated, for example `http://localhost:5173` |
| `LLM_PROVIDER` | no | `gemini` (default) or `anthropic` |
| `LLM_API_KEY` | only for extraction | API key for the provider |
| `LLM_MODEL` | no | Model name |
| `LLM_MIN_INTERVAL_MS` | no | Minimum gap between model calls |
| `EXTRACTION_AS_OF` | no | Reference date used during extraction |
| `EXTRACT_RESTRICTED` | no | Set to `false` to keep restricted sources away from the hosted model |

Never commit `.env` files.

### Client environment

Copy `client/.env.example` to `client/.env`:

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Backend address, no trailing slash. Defaults to `http://localhost:5000` |

### Seed users and start

```powershell
cd server
npm run seed
npm run dev
```

In a second terminal:

```powershell
cd client
npm run dev
```

Open http://localhost:5173 and sign in with a demo account. A fresh database has users but no claims. Claims come from uploading sources (lead, Sources tab) and running extraction, which needs `LLM_API_KEY`.

### Mock mode (no server needed)

For working on the interface only, create `client/.env.development.local` with:

```
VITE_USE_MOCK=true
```

The dev server then uses a built-in stand-in API with sample claims. It never applies to a production build.

## Tests and checks

```powershell
cd server
npm test
cd ..\client
npm run lint
npm run build
npm test
```

## Server scripts

| Command (in `server/`) | What it does |
|---|---|
| `npm run seed` | Creates the three demo users |
| `npm run reverify` | Recomputes the evidence check for all claims |
| `npm run seed:planted` | Inserts synthetic test claims with deliberately wrong quotes |
| `npm run export:demo` / `npm run restore:demo` | Save and restore a known-good demo state |
| `npm run check:demo` / `npm run reset:demo` | Check and reset the demo state |

## Deploy

Frontend on Netlify (build directory `client`, command `npm run build`, publish `dist`, set `VITE_API_URL`), backend on Render (root directory `server`, Node 22). Steps are in `docs/deploy.md`.

## Docs

- `docs/api-contract.md` for the API
- `docs/verification-calibration.md` for the quote matching threshold and test results
- `docs/redaction.md` for what is masked at upload
- `docs/deploy.md` for deployment

## Troubleshooting

- Sign-in says "network error" locally: add `http://localhost:5173` to `CORS_ORIGIN` in `server/.env` and restart the server.
- First request on the live app is slow: the free server sleeps and takes up to a minute to wake.
- Demo buttons say "Wrong email or password": the database was seeded with a different `SEED_PASSWORD`. Run `npm run seed` again with `SEED_PASSWORD=demo1234`.
- Extraction fails: `LLM_API_KEY` is not set. The demo data does not need it.
- Changed `VITE_API_URL` on Netlify but nothing changed: the value is read at build time, redeploy.

## Known limits

- Claims come from a language model, so every claim needs human review.
- Restricted sources are also sent to the hosted model during extraction unless `EXTRACT_RESTRICTED=false`.
- An edited claim is not re-verified, because the evidence does not change with an edit.
- The matching threshold was calibrated on a small synthetic set.
- The planted test claims are synthetic.
- The live demo shares one database between all visitors.
- Not built: bulk accept, audit CSV export.