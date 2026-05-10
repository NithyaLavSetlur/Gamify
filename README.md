# Gamify Study RPG

Full-stack gamified study dashboard with React, TypeScript, Vite, Tailwind CSS, Framer Motion, FastAPI, and SQLite/PostgreSQL-ready SQLAlchemy.

The hosted app stores study data through the backend database, not browser cache. Production should use PostgreSQL so quests, XP, streaks, boss fights, study sessions, imported TickTick tasks, Google Calendar events, and settings survive browser cache clearing and device changes.

The first hosted version does **not** require TickTick or Google credentials. Manual quests, XP, streaks, boss fights, study timer, stats, and manual calendar blocks work before OAuth is configured.

The Context AI assistant works without an OpenAI key using deterministic context extraction. Add `OPENAI_API_KEY` to the backend environment to enable model-backed short chatbot replies.

## Data Persistence

- Local development uses SQLite by default at `backend/gamify.db`.
- Production should set `DATABASE_URL` to PostgreSQL, such as Railway Postgres.
- Browser cache/local storage is not the source of truth for study data.
- The Settings page shows the active storage mode under **Data Storage**.
- Lock In screen preferences are also stored on the backend profile.
- Clearing browser cache does not delete hosted PostgreSQL data.

Current limitation: the app is still a personal single-profile app, not a full multi-user login system. Adding email/password login and per-user data isolation is a separate auth feature.

## First Deployment Order

1. Deploy the backend first.
2. Copy the backend public URL, for example `https://gamify-api.onrender.com`.
3. Deploy the frontend.
4. Set frontend `VITE_API_BASE_URL` to `https://your-backend.example/api`.
5. Open the deployed frontend Settings page.
6. Copy the TickTick and Google redirect URIs shown there.
7. Create the TickTick developer app and Google OAuth app.
8. Add OAuth credentials to backend environment variables.
9. Redeploy the backend.
10. Use the Settings page Connect buttons to finish OAuth.

## Local Development

Backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.local.example .env
python -m uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
Copy-Item .env.local.example .env
npm run dev
```

Local URLs:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Health: `http://localhost:8000/api/health`
- API docs: `http://localhost:8000/docs`

## Backend First Deploy

Recommended Render/Railway settings:

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Set these backend environment variables first, with OAuth credentials blank:

```env
APP_NAME=Gamify Study RPG
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
BACKEND_PUBLIC_URL=https://your-backend.example
FRONTEND_URL=https://your-frontend.example
PRODUCTION_FRONTEND_URL=https://your-frontend.example
CORS_ORIGINS=https://your-frontend.example
SECRET_KEY=replace-with-a-long-random-string
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

TICKTICK_CLIENT_ID=
TICKTICK_CLIENT_SECRET=
TICKTICK_REDIRECT_URI=https://your-backend.example/api/integrations/ticktick/callback

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-backend.example/api/integrations/google/callback
GOOGLE_CALENDAR_ID=primary
```

For a temporary first deploy you can use SQLite, but hosted SQLite may reset depending on the provider. Use PostgreSQL for persistent production data.

Check backend after deploy:

```text
https://your-backend.example/api/health
```

Expected before OAuth credentials:

```json
{
  "status": "ok",
  "database": { "ok": true },
  "integrations": {
    "ticktick": { "configured": false, "status": "not_connected_yet" },
    "google_calendar": { "configured": false, "status": "not_connected_yet" }
  }
}
```

## Frontend Deploy

Vercel:

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable:

```env
VITE_API_BASE_URL=https://your-backend.example/api
```

Netlify:

- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `frontend/dist` or `dist` depending on selected base directory
- Environment variable:

```env
VITE_API_BASE_URL=https://your-backend.example/api
```

After the frontend URL exists, update backend:

```env
FRONTEND_URL=https://your-frontend.example
PRODUCTION_FRONTEND_URL=https://your-frontend.example
CORS_ORIGINS=https://your-frontend.example
```

Redeploy backend so CORS allows the frontend.

## OAuth URLs To Paste

Use the deployed backend URL:

TickTick redirect URI:

```text
https://your-backend.example/api/integrations/ticktick/callback
```

Google redirect URI:

```text
https://your-backend.example/api/integrations/google/callback
```

These same values are shown in the app at Settings -> Deployment Status after backend deployment.

## Add OAuth After Hosting

TickTick:

1. Go to `https://developer.ticktick.com`.
2. Create an app using your deployed app/service URL.
3. Add redirect URI: `https://your-backend.example/api/integrations/ticktick/callback`.
4. Add backend env vars:

```env
TICKTICK_CLIENT_ID=your_client_id
TICKTICK_CLIENT_SECRET=your_client_secret
TICKTICK_REDIRECT_URI=https://your-backend.example/api/integrations/ticktick/callback
```

Google:

1. Create a Google Cloud OAuth client.
2. Enable Google Calendar API.
3. Add authorized redirect URI: `https://your-backend.example/api/integrations/google/callback`.
4. Add backend env vars:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://your-backend.example/api/integrations/google/callback
GOOGLE_CALENDAR_ID=primary
```

Redeploy backend after adding credentials. OAuth buttons unlock automatically when credentials are configured.

## Context AI

The floating Context AI bubble stores brief user notes in the backend and feeds them into workflow analysis for TickTick tasks and Google Calendar events. It extracts study windows, subjects, constraints, task sorting preferences, timer preferences, and tone.

The backend workflow AI now uses that context across imported data:

- TickTick tasks are scored by due date, priority, project, subject, XP, difficulty, and saved user context.
- Google Calendar events are interpreted as timeline items, study blocks, quests, or boss-fight prep.
- The Data Hub shows a next AI session, app-wide AI actions, smart defaults, data quality warnings, and a 7-day workflow map.
- The chatbot updates the backend context map after each message and the workflow refreshes from that context.

For model-backed replies, set these backend variables and redeploy:

```env
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
```

Without `OPENAI_API_KEY`, the app still works with the deterministic local parser and rule-based workflow AI. With `OPENAI_API_KEY`, the chatbot replies and workflow briefing can use the configured model. The assistant is intentionally concise because it runs inside a small chat panel.

## Lock In Screen

The Study Timer page includes **Lock in mode**, a fullscreen black focus screen. It shows the active timer when one is running; otherwise it shows a ready state with selected stats.

Configure it from Settings -> Lock In Screen:

- media URL
- media position: left, right, top, bottom, background, or hidden
- whether to show timer, stats, current task, and quote

## Environment Example Files

- Local backend: `backend/.env.local.example`
- Production backend: `backend/.env.production.example`
- Local frontend: `frontend/.env.local.example`
- Production frontend: `frontend/.env.production.example`

## Verification

```powershell
python -m compileall backend\app
cd backend
python -c "from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); print(c.get('/api/health').status_code); print(c.get('/api/dashboard').status_code)"
cd ..\frontend
npm run build
```
