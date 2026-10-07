# faeez-live

## Git workflow — user-owned (important)

- **Never run `git commit` and never run `git push`.** Not even with a message the user
  approves in advance.
- Make file edits only, then stop. Every change stays in the working tree so it appears
  in the user's source control panel.
- The user reviews the diff, writes the commit message, commits, and pushes.
- If a commit or push is genuinely required, ask first and wait for an explicit answer.

## Commands

```bash
# full stack
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml up -d --build

# tests (media-engine.test.js has ~24 pre-existing failures unrelated to current work)
npx jest tests/unit/foundation.test.js tests/integration/api-integration.test.js \
  tests/integration/ws-contract.test.js --forceExit
```

App: `http://localhost:8081` (edge) · API: `http://localhost:4000`.

Test accounts all use password `Test1234!`:
`superadmin@movement.ng`, `admin@movement.ng`, `cam1@movement.ng`, `cam2@movement.ng`,
`viewer@movement.ng`. Access tokens expire after 15 minutes — re-login before browser
verification.

## Gotchas

- **`infra_web_build` volume shadows rebuilt frontend bundles.** It is mounted by both
  `web` and `nginx`, so a rebuilt image still serves the old bundle. After rebuilding the
  frontend: `docker compose ... rm -sf web nginx`, `docker volume rm infra_web_build`,
  then `docker compose ... up -d web nginx`. Never `down -v` — that would drop the
  PostgreSQL data.
- **Studio → Mixer navigation must use React Router links.** A full page load destroys the
  module-scoped broadcaster in `apps/web/src/lib/broadcast.js` and kills the ingest.
- **CameraOp lives at `/camera`**, not `/admin/camera-op`.
- Headless Chrome must be launched with `--use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream` or the camera preview never becomes ready and Go Live
  silently fails.

## Intentional decisions — do not "clean up"

- `GET /api/auth/health` stays. Every service has a `/health` route; health checks
  legitimately have no internal callers.
- `apps/media-server/src/webhooks/index.js` stays. It is a deliberate scaffold (health
  route only), mounted at `/webhooks`.
- The chat client-side `deleted` flag stays named `deleted` while the DB column is
  `is_deleted`. `chat.message_deleted` sends only `message_id`, so `is_deleted` never
  crosses the wire — there is no mismatch to fix.
- Leave the **RTMP Ingest URL** label, platform presets, and test-connection wording alone.
  Automatic RTMP restream on Go Live is required behavior.

## Repo state

The machine has rebooted unexpectedly mid-write and corrupted `.git` once (zero-byte
object files). A zero-byte object is a poison cache: Git skips writing any object whose
file already exists, so hashes landing on those paths can never be re-created. If
`git fsck` reports empty objects, delete the 0-byte files, rebuild the index with
`rm -f .git/index && git read-tree HEAD`, and re-verify.