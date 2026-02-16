# Documentation Index

`docs/` is the canonical documentation root for this repository.

## Primary Sections

- [Architecture](./ARCHITECTURE.md)
- [Testing](./TESTING.md)
- [Game Design](./game-design/GDD.md)
- [Area Design](./area-design/README.md)
- [Combat](./combat/spec_combat.md), [Abilities](./combat/spec_abilities.md), [Experience](./combat/spec_experience.md)
- [Economy and Crafting](./economy/spec_economy.md)
- [World Entities](./world/spec_world_entities.md)
- [UI Log](./ui/spec_log.md)
- [Assets / 3D Models](./assets/spec_models.md)
- [Network Protocol](./network/spec_protocol.md)
- [Party and Chat](./social/spec_party_and_chat.md)
- [Auth and Persistence](./platform/spec_auth_persistence.md)
- [Documentation Review (2026-02-16)](./documentation_review_2026-02-16.md)

## Operational and Historical Docs

These remain intentionally outside `docs/`:

- [Repository README](../README.md)
- [Progress Notes](../progress.md)
- [Security Review Report](../security_best_practices_report.md)

## Migration Map (`specs/` -> `docs/`)

| Old Path | New Path | Notes |
|---|---|---|
| `specs/area-design/README.md` | `docs/area-design/README.md` | moved |
| `specs/area-design/starter_zone_hearthring.md` | `docs/area-design/starter_zone_hearthring.md` | moved |
| `specs/assets/spec_models.md` | `docs/assets/spec_models.md` | moved |
| `specs/combat/spec_combat.md` | `docs/combat/spec_combat.md` | moved; canonical combat attributes spec |
| `specs/combat/mmorpg_attributes_combat_spec.md` | `docs/combat/spec_combat.md` | deduplicated into canonical combat spec |
| `specs/combat/spec_abilities.md` | `docs/combat/spec_abilities.md` | moved |
| `specs/combat/spec_experience.md` | `docs/combat/spec_experience.md` | moved |
| `specs/economy/spec_economy.md` | `docs/economy/spec_economy.md` | moved |
| `specs/game-design/GDD.md` | `docs/game-design/GDD.md` | moved |
| `specs/ui/spec_log.md` | `docs/ui/spec_log.md` | moved |
| `specs/world/spec_world_entities.md` | `docs/world/spec_world_entities.md` | moved |

## Authoritative Sources by Domain

- Combat attributes and formulas: `docs/combat/spec_combat.md`
- Class abilities and unlocks: `docs/combat/spec_abilities.md`
- Progression and XP: `docs/combat/spec_experience.md`
- Economy, vendor, crafting: `docs/economy/spec_economy.md`
- World/map/entity schema: `docs/world/spec_world_entities.md`
- Wire protocol and message contracts: `docs/network/spec_protocol.md`
- Party/chat behavior and XP interactions: `docs/social/spec_party_and_chat.md`
- Auth/session/player-state lifecycle and persistence: `docs/platform/spec_auth_persistence.md`
