## Contributing

Thank you for contributing to this MMORPG prototype. This document explains the core tooling and testing flows and how they relate to CI.

### Prerequisites

- **Node.js**: Use the version configured in CI (Node 20) or higher.
- **Postgres**: Local Postgres instance with databases:
  - `mmorpg_dev`
  - `mmorpg_test`
  - `mmorpg_e2e`
- **Environment variables**:
  - Copy `.env.example` to `.env` and fill in values.
  - Ensure database URLs are configured for dev, test, and E2E (including `DATABASE_URL_E2E`).
- **Playwright (for E2E)**:
  - Install browsers once locally:

```bash
npx playwright install chromium
```

### Fast feedback loop

For day‑to‑day development, prefer the fast typecheck + unit test loop:

- **Typecheck + unit tests**:
  - `npm test`
  - Runs:
    - `npm run check:tscheck:coverage`
    - `npm run typecheck`
    - `npm run test:unit`
- **Typecheck only**:
  - `npm run typecheck`
  - Useful when iterating on type/JSDoc changes without running tests.
- **Unit tests only**:
  - `npm run test:unit`

These are the same checks that run in CI on each push/PR.

### End‑to‑end (E2E) flows

Use E2E suites to validate full gameplay and admin flows:

- **Main gameplay E2E**:
  - `npm run test:e2e`
- **Admin E2E**:
  - `npm run test:e2e:admin`

See `docs/TESTING.md` for detailed coverage descriptions, runtime flags, and failure artifacts.

Before running E2E locally, make sure:

- `mmorpg_e2e` database exists (or run `npm run db:reset:e2e` to create/reset it).
- `DATABASE_URL_E2E` is set in your environment or `.env`.

### Database utilities

Helpful DB commands:

- **Reset test database**:
  - `npm run db:reset:test`
- **Reset E2E database**:
  - `npm run db:reset:e2e`
- **Apply dev migrations**:
  - `npm run db:migrate:dev`

These are safe to run locally; they are also used by CI to prepare databases.

### CI expectations

GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`**:
  - Runs on `push` and `pull_request`.
  - Sets up Postgres, installs dependencies, resets the test database, and runs `npm test`.
  - This is the required green check for merging changes.
- **`e2e.yml`**:
  - Triggered manually via `workflow_dispatch`.
  - Sets up Postgres, installs Playwright, resets the E2E database, then runs:
    - `npm run test:e2e`
    - `npm run test:e2e:admin`

When changing gameplay, UI, or admin surfaces, run the relevant E2E suites locally and/or trigger the `E2E` workflow before merging significant changes.

