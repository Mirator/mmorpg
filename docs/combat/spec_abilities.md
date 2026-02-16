# Abilities Specification (v2)

## Structured Combat & Ability System (Level 1--30)

This document defines the full ability system with: - Coefficient-based
scaling - Global Cooldown (GCD) - Crowd Control diminishing returns -
Party XP support tagging - PvP modifier hooks - Standardized ability
schema - Full unlock roadmap (2,3,6,10,15,20,25,30)

------------------------------------------------------------------------

# 1. Core Combat Rules

## 1.1 Global Cooldown

GLOBAL_COOLDOWN_MS = 900

All abilities trigger the global cooldown unless explicitly marked: -
exemptFromGCD: true

------------------------------------------------------------------------

# 2. Ability Scaling Model

Damage Formula: Damage = baseValue + (RelevantPower × coefficient)

Healing Formula: Heal = baseValue + (HealingPower × coefficient)

Critical Hits: Base multiplier: 2.0×

------------------------------------------------------------------------

# 3. PvP Modifier Hooks

Optional per ability: - pvpDamageMultiplier (default 1.0) -
pvpHealMultiplier (default 1.0) - pvpCCDurationMultiplier (default 1.0)

------------------------------------------------------------------------

# 4. Crowd Control Diminishing Returns

Per CC category (stun/root/slow), per target, 10s window:

1st: 100% 2nd: 50% 3rd: 25% 4th: immune

------------------------------------------------------------------------

# 5. Standard Ability Schema

ID: Class: UnlockLevel: Type: TargetType: Range: BaseValue: Coefficient:
ResourceCost: CooldownMs: GCD: Effects: PvPModifiers: Tags:

------------------------------------------------------------------------

# 6. Party Contribution & XP Support Tagging

Abilities may define: supportTag: true

Contribution weight: weight = damageShare + 0.5 × supportShare

------------------------------------------------------------------------

# 7. Unlock Pattern

Abilities unlock at levels: 2, 3, 6, 10, 15, 20, 25, 30

------------------------------------------------------------------------

# 8. Class Ability Lists

===================================== FIGHTER
=====================================

Level 2 -- Power Strike Type: melee BaseValue: 20 Coefficient: 0.8
ResourceCost: 40 Rage CooldownMs: 5000 GCD: true Tags: \[burst\]

Level 3 -- Cleave Type: melee aoe BaseValue: 15 Coefficient: 0.5
ResourceCost: 50 Rage CooldownMs: 8000

Level 6 -- Berserk Self buff +25% damage (PvP +15%) Duration: 6s

Level 10 -- Whirlwind AoE 360° BaseValue: 18 Coefficient: 0.6

Level 15 -- Execute BaseValue: 10 Coefficient: 1.2 Bonus vs \<30% HP

Level 20 -- Blood Rage Consume all Rage → scaling damage bonus

Level 25 -- Interrupting Strike Interrupt, 2s lockout

Level 30 -- Avatar of War +30% Physical Power (PvP +20%), 10s

===================================== GUARDIAN
=====================================

Level 2 -- Shield Slam Coefficient: 0.4 Stun 800ms

Level 3 -- Defensive Stance DamageTakenMultiplier: 0.7 (PvP 0.8)

Level 6 -- Taunt Force mob target 3s

Level 10 -- Shield Wall 50% DR 3s (PvP 30%)

Level 15 -- Fortify +20% max HP 8s

Level 20 -- Ground Slam AoE slow 40% 3s (PvP 25%)

Level 25 -- Guardian's Rebuke Interrupt

Level 30 -- Unbreakable CC immune 4s (PvP 2s)

===================================== RANGER
=====================================

Level 2 -- Aimed Shot BaseValue: 25 Coefficient: 1.0 Cast 600ms

Level 3 -- Roll Back Dash 3m exemptFromGCD: true

Level 6 -- Poison Arrow DoT 6s

Level 10 -- Rapid Fire Channel 3 shots

Level 15 -- Snare Trap Root 2s (PvP 1s)

Level 20 -- Mark Target +10% damage from Ranger

Level 25 -- Disengage Shot Knockback 2m

Level 30 -- Eagle Eye +20% crit (PvP +10%), 8s

===================================== PRIEST
=====================================

Level 2 -- Heal Coefficient: 0.9 supportTag: true

Level 3 -- Smite Coefficient: 0.7

Level 6 -- Renew HoT 8s supportTag: true

Level 10 -- Cleanse Remove debuff

Level 15 -- Divine Shield Absorb shield supportTag: true

Level 20 -- Prayer of Light AoE heal (PvP -20%)

Level 25 -- Silence Interrupt 2s

Level 30 -- Salvation Revive ally (PvE only)

===================================== MAGE
=====================================

Level 2 -- Firebolt Coefficient: 0.9 (PvP 0.8)

Level 3 -- Frost Nova Slow 50% (PvP 30%)

Level 6 -- Arcane Missiles Channel 3 ticks

Level 10 -- Flame Wave Cone AoE

Level 15 -- Ice Barrier Self shield

Level 20 -- Blink Teleport 4m exemptFromGCD: true

Level 25 -- Counterspell Interrupt 2s

Level 30 -- Meteor Large AoE burst (PvP 0.7)

------------------------------------------------------------------------
