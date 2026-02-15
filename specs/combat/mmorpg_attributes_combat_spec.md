# Game Specification

**Project:** Rising Ages  
**Classes:** Fighter, Guardian, Mage, Priest, Ranger

This document describes the implemented attribute system, combat mechanics, and item schema as they exist in the codebase.

---

# 1. Core Attributes

All characters share five base attributes. Attributes scale from:
- Base class values
- Level progression (+1 primary, +0.5 secondary per level)
- Gear stats

## 1.1 Strength (STR)

**Primary function:** Melee damage scaling  
**Effects:** Physical Power, Armor Penetration (minor)

## 1.2 Dexterity (DEX)

**Primary function:** Ranged precision and critical scaling  
**Effects:** Ranged Power, Critical Chance, Accuracy (minor)

## 1.3 Intelligence (INT)

**Primary function:** Offensive magic scaling  
**Effects:** Magic Power, Max Mana, Mana Regeneration (minor)

## 1.4 Vitality (VIT)

**Primary function:** Survivability  
**Effects:** Max Health, Health Regeneration  
**Note:** VIT does not increase Physical Defense. Defense is primarily gear-based.

## 1.5 Spirit (SPI)

**Primary function:** Healing and sustain  
**Effects:** Healing Power, Mana Regeneration

---

# 2. Base Attributes Per Class

| Class    | STR | DEX | INT | VIT | SPI |
|----------|-----|-----|-----|-----|-----|
| Fighter  | 12  | 8   | 4   | 10  | 4   |
| Guardian | 8   | 5   | 4   | 14  | 6   |
| Mage     | 3   | 6   | 14  | 6   | 10  |
| Priest   | 4   | 6   | 10  | 8   | 14  |
| Ranger   | 6   | 14  | 4   | 8   | 5   |

**Per-level gain:** +1 primary attribute, +0.5 secondary attribute

| Class    | Primary | Secondary |
|----------|---------|-----------|
| Fighter  | STR     | DEX       |
| Guardian | VIT     | SPI       |
| Mage     | INT     | SPI       |
| Priest   | SPI     | INT       |
| Ranger   | DEX     | STR       |

---

# 3. Class Attribute Multipliers

Effective Attribute = Raw Attribute × Class Multiplier

| Class    | STR  | DEX  | INT  | VIT  | SPI  |
|----------|------|------|------|------|------|
| Fighter  | 1.0  | 0.4  | 0.2  | 0.6  | 0.2  |
| Guardian | 0.5  | 0.2  | 0.2  | 1.2  | 0.4  |
| Mage     | 0.1  | 0.2  | 1.1  | 0.3  | 0.7  |
| Priest   | 0.2  | 0.2  | 0.6  | 0.5  | 1.2  |
| Ranger   | 0.4  | 1.1  | 0.2  | 0.4  | 0.2  |

---

# 4. Derived Combat Stats

Derived stats are computed automatically. Players do not allocate them directly.

## 4.1 Max Health

```
Base Health = 50 + (5 × Level)
Guardian Bonus: +10 Base Health
Max Health = Base Health + (VIT × 12)
```

## 4.2 Max Mana

Mana classes only (Mage, Priest):

```
Base Mana = 30 + (3 × Level)
Max Mana = Base Mana + (INT × 10)
```

## 4.3 Health Regeneration

```
Health Regen/sec = 0.05 × VIT
```

## 4.4 Mana Regeneration

```
Base Regen: Mage = 2, Priest = 1.5, others = 0
Mana Regen/sec = Base Regen + (INT × 0.03) + (SPI × 0.15)
```

## 4.5 Power Stats

| Stat           | Formula        |
|----------------|----------------|
| Physical Power | STR × 2         |
| Ranged Power   | DEX × 2         |
| Magic Power    | INT × 2.5       |
| Healing Power  | SPI × 2         |
| Priest bonus   | Healing Power × 1.1 |

## 4.6 Defense

```
Base Defense: Guardian = 2 × Level, others = 0.5 × Level
Physical Defense = Base Defense + Armor from gear
Magic Resistance = Base Defense + Resistance from gear
```

## 4.7 Critical Chance

```
Crit Chance = DEX × 0.05%
Ranger bonus: ×1.2 (before cap)
Hard cap: 40%
```

## 4.8 Armor Penetration

```
Armor Pen = STR × 0.05%
Hard cap: 30%
```

## 4.9 Accuracy & Evasion

```
Accuracy = 100 + (DEX × 2) + gear accuracy
Evasion = gear evasion
```

---

# 5. Hit Chance

```
Hit Chance = Accuracy / (Accuracy + Evasion)
Clamped: 5% minimum, 95% maximum
When both are 0: 95% hit chance
```

---

# 6. Damage Calculation

## 6.1 Outgoing Damage

```
Damage = baseValue + (Relevant Power × coefficient)
```

- **baseValue**: Per-ability constant (no level scaling).
- **coefficient**: Per-ability scaling factor for the relevant power stat.
- **Relevant Power**: Melee → Physical Power, Ranged → Ranged Power, Magic → Magic Power.

Critical hit: 2× damage (rolled separately).

## 6.2 Outgoing Healing

```
Heal = baseValue + (Healing Power × coefficient)
```

Healing abilities use Healing Power (derived from Spirit; Priest gets ×1.1 bonus).

## 6.3 Incoming Damage

```
Final Damage = Raw Damage × (100 / (100 + Defense))
```

Defense uses diminishing returns. Weakened debuff multiplies raw damage before defense.

---

# 7. Class Passives

## Fighter

Balanced melee damage scaling (no special passive).

## Guardian

- Base Defense = 2 × Level (vs 0.5 for others)
- Base Health +10 bonus

## Mage — Arcane Flow

- Base mana regen: 2
- Mana refund on kill: Firebolt 20% of cost, Frost Nova 15% of cost per mob killed

## Priest — Divine Channeling

- Base mana regen: 1.5
- Healing Power × 1.1

## Ranger

- Critical Chance × 1.2 (before 40% cap)

---

# 8. Equipment Slots

Implemented slots: **weapon**, **offhand**, **head**, **chest**, **legs**, **feet**

---

# 9. Item Stats

Gear can provide: STR, DEX, INT, VIT, SPI, Armor, Magic Resist, Accuracy, Evasion

## 9.1 Weapon Stats (Implemented)

| Kind                  | Stats      |
|-----------------------|------------|
| weapon_training_sword | +2 STR     |
| weapon_training_bow   | +2 DEX     |
| weapon_training_staff | +2 INT     |
| weapon_apprentice_wand| +3 INT, +1 SPI |

---

# 10. Class Resources

| Class    | Type   | Max | Notes                          |
|----------|--------|-----|--------------------------------|
| Fighter  | Rage   | 100 | +8 on hit, +4 on damage, decay out of combat |
| Guardian | Stamina| 100 | Regen out/in combat            |
| Ranger   | Focus  | 100 | Regen moving/standing          |
| Priest   | Mana   | 120 | Regen out/in combat            |
| Mage     | Mana   | 100 | Regen (derived maxMana)         |

---

# 11. Protocol Sync

Player private state includes precomputed `attributes` (raw STR/DEX/INT/VIT/SPI) and `derivedStats` for client display. Client may use these when present or compute locally from classId, level, equipment.

---

# 12. Design Principles

1. Defense primarily gear-driven.
2. Sustain weaker than burst.
3. Hard caps prevent scaling abuse (crit 40%, armor pen 30%, hit chance 5–95%).
4. No attribute mandatory for all classes.
5. Class identity reinforced through multipliers and passives.
