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
  - Config: `vitest.config.js` (node env, `server/test/setup.js`, explicit include/exclude, fork pool, no shuffle for determinism).
  - Use `npm run test:unit -- --run path/to/file.test.js` to run a single file.

- `npm run test:e2e`
  - Runs the full E2E suite via `@playwright/test` (tests in `e2e/tests/*.spec.js`).
  - One worker so each scenario gets a dedicated server; retries once in CI.
  - Covers: main flow (account, world, vendor trade, combat, XP, death/respawn), tutorial, trade, duel, and admin map v2.
  - Each scenario still writes failure artifacts to `output/e2e/` or `output/e2e-admin/` on failure.

- `npm run test:e2e:legacy`
  - Runs the original main flow only via `node e2e/playwright-e2e.js` (same as previous `test:e2e` behavior).

- `npm run test:e2e:tutorial` / `test:e2e:trade` / `test:e2e:duel` / `npm run test:e2e:admin`
  - Run a single E2E scenario via the legacy Node scripts (useful for debugging one flow).

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

- `DATABASE_URL_E2E`
  - Required for E2E: used to reset the E2E database before gameplay scenarios (main, tutorial, trade, duel). Not used by admin map v2 (it uses temp map files).
- `E2E_ATTEMPTS` (default `1`)
  - Used by legacy `e2e/playwright-e2e.js`. `1` means no retry masking; values `>1` enable retries for local debugging only.
- `E2E_SERVER_START_TIMEOUT_MS` (default `20000`)
  - Used by shared `e2e/helpers.js` server boot wait for both gameplay and admin E2E.
- `E2E_PORT` (default `3001`)
  - Port for the E2E server. Admin map v2 uses `3907` when run via `npm run test:e2e:admin` or in the Playwright admin test.

## Local Workflow

1. Implement small change.
2. Run `npm test` (typecheck + unit tests).
3. If UI/gameplay changed, run `npm run test:e2e`.
4. If admin surfaces changed, run `npm run test:e2e:admin`.
5. If E2E fails, inspect latest files in `output/e2e/` or `output/e2e-admin/` and patch deterministic causes before retrying.

## CI Mapping

- **CI workflow (`.github/workflows/ci.yml`)**
  - Runs on `push` and `pull_request`.
  - Provisions Postgres, resets the test database, and runs `npm test` (typecheck + unit tests).
- **E2E workflow (`.github/workflows/e2e.yml`)**
  - Triggered manually via `workflow_dispatch` from GitHub.
  - Provisions Postgres, resets the E2E database, and runs `npm run test:e2e` (Playwright runs all scenarios including admin).

## Stability Gate (No-Flake)

Run the full E2E suite 10 times in a row with a unique port per run:

```bash
for i in {1..10}; do
  E2E_PORT=$((4200 + i)) npm run -s test:e2e || exit 1
done
```
