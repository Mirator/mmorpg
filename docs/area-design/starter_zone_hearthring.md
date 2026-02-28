# Starter Zone - The Hearthring (Levels 1-5)

Design goal: teach core mechanics through world layout first, with optional vendor-contract guidance layered on top.

The starter experience now spans the full map (`x/z in [-200, 200]`) using a 3x3 district layout. Progression is preserved by district composition and encounter pressure, not by adding new systems.

---

## Gameplay Teaching Order

| Stage | Player learns |
|---|---|
| 1 | Movement + interact |
| 2 | Harvest + economy loop |
| 3 | Solo combat rhythm |
| 4 | Positioning + pull discipline |
| 5 | Risk management + cooperation |

---

## World Layout (3x3 Districts)

Tile centers:

- NW `(-133, 133)` - Stream and Platforming
- N `(0, 133)` - Meadow Gathering
- NE `(133, 133)` - Light Thicket
- W `(-133, 0)` - Shallow Ruins
- C `(0, 0)` - Sanctuary Hub
- E `(133, 0)` - Watchtower Hill
- SW `(-133, -133)` - Trader Outpost
- S `(0, -133)` - Abandoned Farms
- SE `(133, -133)` - Forest Wall

The hub remains at center for immediate onboarding and recovery.

---

## Connectivity (H-Corridor)

Two clear traversal lanes connect major districts:

- Vertical lane: N <-> C <-> S
- Horizontal lane: W <-> C <-> E

These lanes are kept visually and physically readable so players can always re-orient, recover, and branch into higher-risk districts without dead ends.

---

## District Roles

### C - Sanctuary Hub

Purpose: safe onboarding and economy anchor.

- Spawn, vendors, training dummies, fast loop resources.
- Teaches movement, interact, inventory, sell loop, and first contract pickup/turn-in.

### N, NW, SW - Low-Risk Expansion

Purpose: repeat early lessons in broader space.

- Harvest-heavy districts with passive life and sparse single threats.
- Teaches route planning, harvesting under light pressure, and safe disengage habits.

### S, W, NE - Mid-Risk Practice

Purpose: transition into deliberate combat.

- More dense packs, line-of-sight pressure, and tighter movement spaces.
- Teaches target selection, pull control, and kiting discipline.

### E, SE - High-Risk Starter Edge

Purpose: capstone challenge for level 4-5 characters.

- Mixed packs with stronger melee pressure and limited bull anchors.
- Teaches ability timing, retreat decisions, and ad-hoc cooperation.

---

## Density Targets (Current Implementation)

- Resource nodes: `54`
- Mob spawns: `40`
- Structures: `53`
- Obstacles: `34`
- Vendors: `4` (hub + outpost)

This fills the full map while keeping encounter readability and starter-scale performance.

---

## Starter Safety Rules

- Mob levels remain starter-focused (`1..5`).
- High-end outliers are excluded from starter composition (`demon`, `yeti`).
- No aggressive non-dummy mobs are placed within radius `28` of the hub center.

---

## Core Principle

The world teaches by repetition with pressure scaling:

1. Interact in safety
2. Harvest under low pressure
3. Fight predictable threats
4. Manage positioning in constrained spaces
5. Handle mixed-threat pulls with better timing

Contracts can reinforce this path, but players can still explore freely or follow future quest-style guidance.

The intended feeling remains: safe -> curious -> tense -> challenging.
