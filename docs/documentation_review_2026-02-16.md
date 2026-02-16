# Documentation Review 2026-02-16

Date: 2026-02-16
Scope: repo-wide markdown review, docs-root consolidation (`specs/` -> `docs/`), stale-content remediation, and missing major spec additions.

## Status Summary

- `kept`: 8
- `updated`: 11
- `merged`: 2
- `superseded`: 1

## File-by-File Review

| File path | Status | Key findings | Follow-up needed |
|---|---|---|---|
| `README.md` | updated | Docs section now points to canonical index at `docs/README.md`. | None |
| `client/assets/consumables/README.md` | kept | Asset conversion workflow still valid and scoped. | None |
| `docs/ARCHITECTURE.md` | kept | Accurately reflects current HTTP/WS/game-loop/persistence composition. | None |
| `docs/README.md` | updated | Added canonical docs index, migration map, authoritative-source notes. | Keep updated when new spec files are added. |
| `docs/TESTING.md` | kept | Current unit + E2E workflow and artifact docs align with test runner behavior. | None |
| `docs/area-design/README.md` | merged | Moved from former `specs/area-design/README.md`; content retained. | None |
| `docs/area-design/starter_zone_hearthring.md` | merged | Moved from former `specs/area-design/starter_zone_hearthring.md`; content retained. | None |
| `docs/assets/spec_models.md` | updated | Mob model/preload wording updated; includes `dummy` model mapping. | None |
| `docs/combat/spec_combat.md` | kept | Retained as canonical combat/attributes spec. | None |
| `docs/combat/mmorpg_attributes_combat_spec.md` | superseded | Duplicate of `docs/combat/spec_combat.md` with negligible diff; removed. | None |
| `docs/combat/spec_abilities.md` | kept | Ability definitions remain aligned at high level with current system. | Optional cleanup: normalize formatting style in a separate pass. |
| `docs/combat/spec_experience.md` | kept | XP/party contribution formulas align with implemented model. | Optional cleanup: normalize formatting style in a separate pass. |
| `docs/economy/spec_economy.md` | updated | Vendor selling table corrected to include all sellable resource kinds (`wood`, `flower`). | None |
| `docs/game-design/GDD.md` | updated | Removed stale “buy tab not implemented” claim; added implemented buying behavior and protocol subset refresh. | Keep protocol appendix high-level and defer wire details to `docs/network/spec_protocol.md`. |
| `docs/network/spec_protocol.md` | updated | Added comprehensive protocol contract (HTTP auth + WS ticket, client/server messages, seq/rate-limit, AOI delta removal fields, `abilityFailed.reason`). | None |
| `docs/social/spec_party_and_chat.md` | updated | Added implemented party lifecycle, invite constraints, AOI visibility effect, party XP linkage, and chat routing rules. | None |
| `docs/platform/spec_auth_persistence.md` | updated | Added auth/session/persistence lifecycle spec including ownership checks, migration/hydration, dirty/persist loop, shutdown flush. | None |
| `docs/ui/spec_log.md` | updated | Removed “future party system” wording; clarified channel writability and client/server buffer behavior. | None |
| `docs/world/spec_world_entities.md` | updated | Map editor mob dropdown list corrected to include `dummy`. | None |
| `docs/documentation_review_2026-02-16.md` | updated | Review artifact created for this pass and linked from docs index. | Update on next date-stamped review pass. |
| `progress.md` | kept | Historical progress notes remain valid and intentionally outside docs root. | None |
| `security_best_practices_report.md` | kept | Security report remains current for review date and stays as historical operational doc. | Re-run security review when auth/session model changes materially. |

## Consolidation Notes

- Canonical docs root is now `docs/`.
- Former `specs/` tree was merged into `docs/`, then removed.
- No compatibility shim for old `specs/` paths is kept.

## Validation Results

- Structure validation: passed (`specs/` removed; expected docs files present under `docs/`)
- Markdown link integrity check: passed (repo-wide local-link scan across `*.md`)
- Stale `specs/` reference scan: passed; remaining hits are intentional historical mentions in migration/review docs only
- Spot-check against implementation (`shared/protocol.js`, `server/ws.js`, `server/ws/handlers/*`, `server/logic/combat.js`, `server/logic/party.js`, `server/http.js`, `server/persistence.js`): passed for documented behaviors in updated/new specs
