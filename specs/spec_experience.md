# Experience Specification (v2)

## Level 1--30 Progression System

This document defines the XP, leveling, and party experience rules.

Target: \~60 hours solo (grinding-only) to reach level 30 under average
\~1 kill/min sustained pace.

------------------------------------------------------------------------

# 1. Level Range

  Constant    Value
  ----------- -------
  Min Level   1
  Max Level   30
  MAX_LEVEL   30

Players start at level 1 with 0 XP.

At level 30: xpToNext(30) = 0

------------------------------------------------------------------------

# 2. XP Required Per Level

XP uses a smooth quadratic curve.

Formula:

xpToNext(lvl) = round(XP_K × lvl²)\
for lvl = 1..29

xpToNext(30) = 0

Recommended constant:

XP_K = 190

Example values:

  Level   XP to Next
  ------- ------------
  1       190
  10      19,000
  20      76,000
  29      159,790

Total XP from level 1 → 30 ≈ 1.625 million.

------------------------------------------------------------------------

# 3. Mob XP Calculation

## 3.1 Base XP

baseXp = floor(MOB_XP_A × mobLevel)

Recommended constant:

MOB_XP_A = 23

Examples (same-level kill):

  Mob Level   Base XP
  ----------- ---------
  10          230
  20          460
  29          667

------------------------------------------------------------------------

## 3.2 Level Difference Multiplier

diff = mobLevel - playerLevel

mult = clamp(0.25, 1.75, 1 + 0.12 × diff)

xp = floor(baseXp × mult)

Optional extreme guard:

if diff \<= -10 → mult = 0

This provides smooth scaling without hard XP cliffs.

------------------------------------------------------------------------

# 4. Solo Progression Target

With:

XP_K = 190\
MOB_XP_A = 23\
Fighting same-level mobs\
\~1 kill per minute average

Expected time to level 30 ≈ 60 hours.

Adjust tuning by modifying: - XP_K (slows/speeds total progression) -
MOB_XP_A (changes XP per kill)

------------------------------------------------------------------------

# 5. Party XP System

## 5.1 Eligibility

A player receives party XP if:

-   In party
-   Within XP range (e.g., 35 meters)
-   AND either:
    -   Dealt ≥ 10% of mob max HP
    -   OR provided valid support (heal/shield/buff during combat)

------------------------------------------------------------------------

## 5.2 Party Bonus Multiplier

partyBonus(n) = 1 + 0.35 × (n - 1)

  Party Size   Bonus
  ------------ -------
  1            1.00×
  2            1.35×
  3            1.70×
  4            2.05×
  5            2.40×

totalXpPool = baseXp × mult × partyBonus(n)

------------------------------------------------------------------------

## 5.3 XP Distribution

Each eligible member receives XP based on contribution weight:

weight_i = damageShare_i + 0.5 × supportShare_i

xpShare_i = totalXpPool × (weight_i / sumWeights)

This prevents last-hit abuse and rewards real contribution.

------------------------------------------------------------------------

## 5.4 Anti-Boosting Dampener

partyAvgLevel = average(levels of eligible members)\
gap = partyAvgLevel - playerLevel

damp = clamp(0.10, 1.00, 1 - 0.08 × max(0, gap - 3))

xpFinal_i = xpShare_i × damp

Effect: - No penalty within \~3 levels of party average - Reduced XP if
heavily under-leveled - Prevents powerleveling exploits

------------------------------------------------------------------------

# 6. Design Goals

1.  Smooth XP curve without phase jumps
2.  No hard XP cliffs
3.  Party play faster than solo, but controlled
4.  No killing-blow abuse
5.  No trivial boosting
6.  Easy retuning via two constants (XP_K, MOB_XP_A)

------------------------------------------------------------------------
