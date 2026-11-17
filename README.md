# Ampera mobile (poc-mobile)

Flutter app for **regular users** of the Ampera delivery platform. Super admin accounts are refused at
sign-in and stay on the web app.

**In the app:** sign in, register, password-reset request, change password; home and project list
(search, status filter); new project via intake; the project's next-step card (resume, cancel,
answer, review); stage pipeline; read-only requirements, architecture (as lists), plan, budget and
scaffold files; answering open questions; approve or request changes; chat with the Orchestrator
and each stage agent, by text or in Voice Mode.

**Web only:** architecture canvas and change sets, specification wizard, plan/budget editing,
revision history, preferences, rate card, scaffold download, admin.

## Run it

```bash
make install
make env        # then set API_URL / WEB_URL to your laptop's LAN IP (not localhost)
make run        # flutter run on the connected phone or emulator
make apk        # release APK pointed at this laptop's current Wi-Fi IP
```

The backend must be running (API + worker, see `poc-backend/README.md`). Android allows plain HTTP to
a LAN IP; iOS allows it for local-network addresses only.

## Layout

```
lib/
  main.dart            app shell, session gate
  core/api.dart        HTTP client, session (secure storage), Loader (fetch + 4 s polling)
  core/format.dart     labels, money/date formatting, agent copy
  ui/kit.dart          brand tokens and shared widgets
  screens/             auth, tabs, new project, project, stage, artifacts, chat, voice
  voice/               Gemini Live client, delivery runner, device audio
```

API responses are used as plain JSON maps (no model classes); field names follow the backend schemas.

## How it talks to the backend

- `POST /auth/token` and `/auth/token/register` return a session token in the body (no cookie). It is
  stored with `flutter_secure_storage` and sent as `Authorization: Bearer …`.
- Every request sends `X-Client: mobile`; the backend's CSRF origin check lets cookieless requests
  with that header through (`poc-backend/app/core/origin.py`).
- No live stream: workflow, delivery, chat and artifacts poll every 4 s while an agent is working,
  and everything refetches after an action and when the app returns to the foreground.

## Voice Mode

The waveform button (project screen, or an empty chat composer) opens Voice Mode
(`lib/screens/voice.dart`). Gemini Live is only the ears and voice: the backend mints a single-use
ephemeral token (`POST /projects/{id}/voice/session`), the app opens the Live WebSocket directly
(`lib/voice/live_client.dart`), and every request is sent to the stage agent through the normal
conversations API by the `send_to_agent` tool; the agent's reply is read back and lands in the thread.
Approve, request changes and cancel only run after the user says (or taps) "confirm".

Mic capture uses `record` (voice-communication source, echo cancellation, speakerphone), playback
streams PCM through `flutter_pcm_sound`, and `audio_session` pauses the session for calls and
unplugged headphones.

## Checks

```bash
make check      # flutter analyze + flutter test
```
