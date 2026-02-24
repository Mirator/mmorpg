# Documentation Review 2026-02-24

Date: 2026-02-24  
Scope: canonical documentation drift remediation against current runtime code and config.

## Status Summary

- `updated`: 8
- `added`: 1
- `historical (unchanged by design)`: 2

## Updated / Added Files

| File path | Status | Key update |
|---|---|---|
| `README.md` | updated | Added missing admin API (`GET /admin/accounts-overview`) and env vars (`RESPAWN_MS`, `CORPSE_EXPIRY_MS`). |
| `docs/world/spec_world_entities.md` | updated | Updated map schema to `version=2`; added `structures` schema; documented collision-obstacle composition and structure editor coverage. |
| `docs/game-design/GDD.md` | updated | Corrected world-map defaults (counts/radius), map editor scope, mob max level (`35`), and death/duel behavior wording. |
| `docs/platform/spec_admin_web_pages.md` | updated | Added dashboard Accounts & Characters behavior and full `/admin/accounts-overview` contract. |
| `docs/network/spec_protocol.md` | updated | Added client `ping` and server `pong` message contracts. |
| `docs/assets/spec_models.md` | updated | Aligned environment placement text with structure-driven loading; moved `trees` to reserved/unused notes. |
| `docs/combat/spec_combat.md` | updated | Fixed duel-death penalty wording; clarified mana resource max semantics in runtime. |
| `docs/README.md` | updated | Added link to this review file. |
| `docs/documentation_review_2026-02-24.md` | added | New dated review artifact for this remediation pass. |

## Historical Docs (Intentionally Unchanged)

- `progress.md`
- `security_best_practices_report.md`

These remain historical/operational records and were not rewritten as current-state canonical specs.

## Validation Results

- Endpoint coverage check: pass (`/admin/accounts-overview` now documented in README + admin spec).
- Protocol coverage check: pass (`ping`/`pong` now documented and aligned with `shared/protocol.js` and `server/ws/handlers/ping.js`).
- Map schema check: pass (`version=2` and `structures` contract documented, aligned with `shared/mapConfig.js`).
- Gameplay facts check: pass (GDD map counts/caps aligned with `server/data/world-map.json` + progression limits).
- Drift regression checks: pass (removed stale `version must be 1` and stale map-default values).
- Link sanity check: pass (local markdown links resolved in repo-wide scan).
- Historical boundary check: pass (historical docs preserved).
