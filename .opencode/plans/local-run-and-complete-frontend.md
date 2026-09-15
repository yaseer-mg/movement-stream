# Movement Stream — Local run + complete missing components

## Goal
Get the stack running locally at http://localhost:8081 and complete the missing
frontend pieces so every page works end-to-end against the (already complete)
API server. Media server is rebuilt in the background (long network build).

## Context / constraints (from agent.md)
- Raw PostgreSQL, no ORM, no TypeScript.
- Ports: API=4000, Media=3001 (edge nginx front). Baked at build via VITE_* args.
- Host owns ports 80/5432 → remapped to 8081/5437 via `infra/docker-compose.local.yml`.
- Public routes /, /watch, /events, /recordings must stay unauthenticated.
- Never expose stream_key publicly. Single stream_status row, 3 cameras.
- Seed users, all password `Test1234!` (seed.sql hashes already fixed).
- Speak only when asked (deliberately sparing).

## Phase 0 — Infrastructure (start first, runs while coding)
1. Media-server image build already running in background
   (`nohup docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml build media-server`).
2. Pin postgres to `postgres:15-alpine` in local override (already pulled; avoids slow full pull).
3. Bring up the rest now, stack live on :8081:
   `docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml up -d postgres api-server web nginx`
   (add `media-server` container once its image finishes).
4. Verify: GET /health, GET /api/events, 5 seed-user logins, homepage 200.

## Phase 1 — Frontend fixes
1. **Route guards** — new `src/components/ui/ProtectedRoute.jsx`; wire in `App.jsx`:
   loading spinner while `AuthContext.loading`; redirect to /login if logged out;
   /admin/studio requires isSuperAdmin; /admin/* (mixer/events/chat/recordings) require isAdmin.
2. **Login page** — implement `src/pages/public/Login.jsx` (currently stub):
   login + register forms wired to `AuthContext.login/register`; redirect by role
   (super_admin/admin → /admin, else /).
3. **Admin Events** — implement `src/pages/admin/Events.jsx` (currently stub):
   list, create (/admin/events/new), edit prefilled (/admin/events/:id), delete,
   featured toggle. Backend contract: title+starts_at required; statuses
   upcoming/live/ended/cancelled. Uses existing `events.service`.
4. **Admin Recordings** — implement `src/pages/admin/AdminRecordings.jsx` (currently stub):
   list (backend GET /api/recordings is admin-aware), delete, title/description
   edit + is_public toggle (PATCH). Uses existing `recordings.service`.
5. **Chat stream-id bug** — `src/store/index.js`: add `id` to stream store,
   populated from status.id; `src/pages/public/Watch.jsx:15,26,82`: pass stream.id
   to useChat/sendChatMessage/ChatPanel (not event_id); `src/pages/admin/ChatMod.jsx:50`:
   useChatMod(stream.id) instead of hardcoded 'live'.
6. **Quality selector (approved bonus)** — wire Watch.jsx quality selector to
   actually switch HLS variant via playback URL; QualitySelector → VideoPlayer
   variant resolution with HLS.js (or src swap), keeping default on auto.
7. Lint with `npm run lint` (oxlint) in apps/web; rebuild web image
   (`docker compose build web && up -d web nginx`) since Vite bakes at build time.

## Phase 2 — Media server core (separate plan + approval)
WebRTC→FFmpeg frame bridge, application/sdp body parser, wrtc install path,
real mixer program switch, continuous recording, webhooks module +
POST /api/stream/camera-event in api-server.

## Verification
Login as all 5 seed users; walk Watch/Events/Recordings/ChatMod/Studio;
confirm guards (logged-out → /login; viewer → /admin blocked);
CRUD an event; toggle recording public; viewer posts/sees chat on Watch.