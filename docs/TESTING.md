# Testing

## Test Suites

- `npm test`
  - Runs `npm run check:tscheck:coverage`, then `npm run typecheck`, then `npm run test:unit`.
  - Typecheck covers server, client, and tools (`admin/`, `scripts/`, `e2e/`).
  - Typechecking is incremental and JS-only: stricter checks apply to files that opt in via `// @ts-check` and JSDoc.
  - Runs Vitest unit/integration coverage for shared protocol, gameplay logic, auth/routes, and client-side helpers.
  - Includes targeted regressions for:
    - `abilityFailed` callback wiring (`client/connection.test.js`)
    - connection stage callback ordering (`client/connection.test.js`)
    - menu validation/class metadata (`client/menu.test.js`)
    - Chat/vendor style scope integrity (`client/styleIntegrity.test.js`)
    - Auth + character lifecycle endpoints (`server/http.integration.test.js`)

- `npm run typecheck`
  - Runs `typecheck:server`, `typecheck:client`, and `typecheck:tools`.
  - Current profile keeps `strict: true` with temporary legacy bridges in configs (`noImplicitAny: false` in all runtime configs, `strictNullChecks: false` in client/tools) while JSDoc typing is tightened incrementally.

- `npm run check:tscheck:coverage`
  - Fails if targeted first-party non-test JS files are missing `// @ts-check`.

- `npm run test:unit`
  - Runs Vitest only (without typecheck pre-step).

- `npm run test:e2e`
  - Runs Playwright end-to-end scenario in `e2e/playwright-e2e.js`.
  - Covers account flow, world interactions, inventory/equipment, vendor trade, targeting/combat, XP, and death/respawn HUD behavior. Player-to-player trade and PvP duels are implemented but not yet covered by E2E scenarios.
  - UI flow coverage includes:
    - menu progress states (`account -> character -> enter`)
    - smart continue CTA on return-to-character-screen flow
    - staged loading semantics (determinate + indeterminate)
    - keyboard-driven auth/create submit path
  - Verifies vendor interactions on both:
    - deterministic desktop viewport (`1280x720`)
    - small viewport fallback (`560x840`)

- `npm run test:e2e:admin`
  - Runs admin Playwright scenario in `e2e/playwright-admin-map-v2.js`.
  - Covers unlock/session restore, map editor CRUD, mode edits, save/reload, locks, patch lifecycle, collab, playtest, and lock/logout behavior.

## Prerequisites

1. Postgres databases created (`mmorpg_dev`, `mmorpg_test`, `mmorpg_e2e`).
2. `.env` configured (see `.env.example`), including `DATABASE_URL_E2E`.
3. Playwright browser installed:

```bash
npx playwright install chromium
```

## E2E Failure Artifacts

On E2E failure, `e2e/playwright-e2e.js` writes diagnostics to `output/e2e/`:

- `*.screenshot.png`: full-page screenshot at failure point.
- `*.render-state.json`: latest `render_game_to_text` output.
- `*.vendor-metrics.json`: viewport + vendor panel/tab/close button bounds.
- `*.error.txt`: stage label, message, and stack trace.

On admin E2E failure, `e2e/playwright-admin-map-v2.js` writes diagnostics to `output/e2e-admin/`:

- `*.screenshot.png`: full-page screenshot at failure point.
- `*.meta.json`: lightweight page metadata (url/status/save status).
- `*.error.txt`: stage label, message, and stack trace.

## E2E Runtime Flags

- `E2E_ATTEMPTS` (default `1`)
  - Used by `e2e/playwright-e2e.js`.
  - `1` means no retry masking; values `>1` enable retries for local debugging only.
- `E2E_SERVER_START_TIMEOUT_MS` (default `20000`)
  - Used by shared `e2e/helpers.js` server boot wait for both gameplay/admin E2E scripts.
- `E2E_PORT`
  - Overrides test port for either suite; use unique values for repeated-run stability gates.

## Local Workflow

1. Implement small change.
2. Run `npm test` (typecheck + unit tests).
3. If UI/gameplay changed, run `npm run test:e2e`.
4. If admin surfaces changed, run `npm run test:e2e:admin`.
5. If E2E fails, inspect latest files in `output/e2e/` or `output/e2e-admin/` and patch deterministic causes before retrying.

## Stability Gate (No-Flake)

Run both suites 10 times in a row with unique ports and no gameplay retries:

```bash
for i in {1..10}; do
  E2E_ATTEMPTS=1 E2E_PORT=$((4200 + i)) npm run -s test:e2e || exit 1
done

for i in {1..10}; do
  E2E_PORT=$((4300 + i)) npm run -s test:e2e:admin || exit 1
done
```
