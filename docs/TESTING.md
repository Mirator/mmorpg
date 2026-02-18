# Testing

## Test Suites

- `npm test`
  - Runs `npm run check:tscheck:coverage`, then `npm run typecheck`, then `npm run test:unit`.
  - Typecheck covers server, client, and tools (`admin/`, `scripts/`, `e2e/`).
  - Typechecking is incremental and JS-only: stricter checks apply to files that opt in via `// @ts-check` and JSDoc.
  - Runs Vitest unit/integration coverage for shared protocol, gameplay logic, auth/routes, and client-side helpers.
  - Includes targeted regressions for:
    - `abilityFailed` callback wiring (`client/connection.test.js`)
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
  - Verifies vendor interactions on both:
    - deterministic desktop viewport (`1280x720`)
    - small viewport fallback (`560x840`)

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

## Local Workflow

1. Implement small change.
2. Run `npm test` (typecheck + unit tests).
3. If UI/gameplay changed, run `npm run test:e2e`.
4. If E2E fails, inspect latest files in `output/e2e/` and patch deterministic causes before retrying.
