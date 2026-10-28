# Ampera mobile (poc-mobile)

Expo (SDK 58) + Expo Router app for **regular users** of the Ampera delivery platform. Super admin
accounts are refused at sign-in and stay on the web app.

**In the app:** sign in, register, password-reset request, change password; home and project list
(search, status filter); new project via intake; the project's next-step card (resume, cancel,
answer, review); stage pipeline; read-only requirements, architecture (as lists), plan, budget and
scaffold files; answering open questions; approve or request changes; chat with the Orchestrator
and each stage agent.

**Web only:** architecture canvas and change sets, specification wizard, plan/budget editing,
revision history, preferences, rate card, scaffold download, admin.

## Run it

```bash
npm install
cp .env.example .env.local   # set the backend/web URLs as your phone sees them (LAN IP, not localhost)
npx expo run:android         # or run:ios — a development build
```

Use a development build, not Expo Go: Switzer and Fragment Mono are embedded by the `expo-font`
config plugin, so Expo Go falls back to the system font.

The backend must be running (API + worker, see `poc-backend/README.md`). Android debug builds allow
plain HTTP to a LAN IP; release builds need HTTPS.

## How it talks to the backend

- `POST /auth/token` and `/auth/token/register` return a session token in the body (no cookie). It is
  stored in `expo-secure-store` and sent as `Authorization: Bearer …`.
- Every request sends `X-Client: mobile`; the backend's CSRF origin check lets cookieless requests
  with that header through (`poc-backend/app/core/origin.py`).
- No live stream: workflow, delivery, chat and artifacts poll every 4 s while an agent is working,
  and refetch when the app returns to the foreground.

## Checks

```bash
npm run typecheck && npx eslint src && npm test && npx expo-doctor
```

Schemas in `src/schemas/` are copied from `poc-frontend/src/lib/schemas/`; keep them in sync when
the API changes.
