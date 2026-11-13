# Deploying HandoverTrail

Frontend: Netlify (client/). Backend: Render web service (server/). Database: MongoDB Atlas.

## 1. Atlas

Network Access: allow `0.0.0.0/0`. Render's free instances have no fixed address, so an IP list will not work. The database user's password is what protects the data, so use a long one.

## 2. Backend on Render

New > Web Service > connect the GitHub repo.

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance type | Free |
| Health Check Path | `/api/health` |

Environment variables:

| Name | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `MONGO_URI` | the Atlas connection string |
| `JWT_SECRET` | 32+ random characters (not the one used locally) |
| `CORS_ORIGIN` | `https://cairn-handovertrail.netlify.app` (no trailing slash needed) |

The LLM variables are not needed: the claims are already in the database, and the model is only called when someone runs extraction.

## 3. Frontend on Netlify

Site configuration > Environment variables: `VITE_API_URL` = the Render URL (for example `https://cairn-api.onrender.com`, no trailing slash). Then trigger a new deploy: Vite reads the value at build time.

## 4. Before a demo

A free Render service sleeps after 15 minutes without traffic and takes about a minute to wake. Open `<render-url>/api/health` a few minutes before presenting, and again right before you start.
