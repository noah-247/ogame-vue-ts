/**
 * OGame 真實戰鬥引擎
 * ==================
 * 依照原版 OGame 戰鬥公式重寫（原實現為簡化版：逐型隨機單發、無連擊、無護盾回充、無爆炸判定）。
 *
 * 核心規則：
 * 1. 每輪開始時雙方護盾完全恢復；一輪內護盾承受的傷害會累積。
 * 2. 攻擊方全體先開火，之後防守方全體開火；每艘船每輪開火一次，
 *    目標在敵方輪初存活單位中均勻隨機選取；本輪被擊毀的單位仍開火且仍可被選中。
 * 3. 護盾吸收：攻擊力 <= 護盾 → 護盾全吸收，船體無傷；
 *    攻擊力 > 護盾 → 護盾吸收等量傷害，剩餘傷害打到船體。
 * 4. 護盾穿透下限：攻擊力 < 本輪當前護盾 1% 時，100% 跳彈，無傷害。
 * 5. 船體 = (金屬+晶體造價) × 10%，科技每級 +10%。
 *    每次造成船體傷害時，若未被擊毀且剩餘船體 < 70% 上限，有 (1 - 剩餘/上限) 機率爆炸。
 * 6. 連擊 (Rapid Fire)：每次射擊後，無論是否擊毀，若對該目標型別有連擊值 RF，
 *    以 (RF-1)/RF 機率立即再開火一次，可連鎖觸發。
 * 7. 經典模式 6 輪後雙方仍有存活 → 平局。
 */

import { ShipType, DefenseType } from '@/types/game'
import { SHIPS, DEFENSES } from '@/config/gameConfig'
import type { Fleet } from '@/types/game'
import type { BattleSideData, BattleSimulationResult } from '@/types/worker'

/** 單個戰鬥單位（每艘船/每座防禦設施一個例項） */
interface CombatUnit {
  type: string
  isDefense: boolean
  attack: number
  maxShield: number
  shield: number // 本輪剩餘護盾
  maxHull: number
  hull: number // 當前船體
  rapidFire: Record<string, number>
  alive: boolean
}

const techBonus = (base: number, level: number = 0): number =>
  Math.floor(base * (1 + level * 0.1))

/** 船體上限 = (金屬 + 晶體造價) × 10% × 裝甲科技加成（OGame 原公式） */
const hullFor = (metal: number, crystal: number, armorTech: number): number =>
  Math.floor((metal + crystal) * 0.1 * (1 + armorTech * 0.1))

/**
 * 把艦隊/防禦展開為單個戰鬥單位陣列
 */
function buildUnits(side: BattleSideData, isDefender: boolean): CombatUnit[] {
  const units: CombatUnit[] = []
  const weaponTech = side.weaponTech ?? 0
  const shieldTech = side.shieldTech ?? 0
  const armorTech = side.armorTech ?? 0

  if (side.ships) {
    for (const [shipType, count] of Object.entries(side.ships)) {
      if (!count || count <= 0) continue
      const config = SHIPS[shipType as ShipType]
      if (!config) continue
      const maxHull = hullFor(config.cost.metal, config.cost.crystal, armorTech)
      const maxShield = techBonus(config.shield, shieldTech)
      const attack = techBonus(config.attack, weaponTech)
      for (let i = 0; i < count; i++) {
        units.push({
          type: shipType,
          isDefense: false,
          attack,
          maxShield,
          shield: maxShield,
          maxHull,
          hull: maxHull,
          rapidFire: config.rapidFire ?? {},
          alive: true
        })
      }
    }
  }

  if (isDefender && side.defense) {
    for (const [defenseType, count] of Object.entries(side.defense)) {
      if (!count || count <= 0) continue
      if (defenseType === DefenseType.AntiBallisticMissile || defenseType === DefenseType.InterplanetaryMissile) continue
      const config = DEFENSES[defenseType as DefenseType]
      if (!config) continue
      const maxHull = hullFor(config.cost.metal, config.cost.crystal, armorTech)
      const maxShield = techBonus(config.shield, shieldTech)
      const attack = techBonus(config.attack, weaponTech)
      for (let i = 0; i < count; i++) {
        units.push({
          type: defenseType,
          isDefense: true,
          attack,
          maxShield,
          shield: maxShield,
          maxHull,
          hull: maxHull,
          rapidFire: {},
          alive: true
        })
      }
    }
  }

  return units
}

/** 隨機數生成器型別，必須返回 [0, 1)（預設 Math.random；測試可注入種子 RNG 以保證確定性） */
export type Rng = () => number

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(rng() * (i + 1)), i)
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/**
 * 單次射擊結算，返回目標是否被擊毀
 */
function resolveShot(shooter: CombatUnit, target: CombatUnit, rng: Rng): boolean {
  if (!target.alive) return false
  const power = shooter.attack

  if (power < target.shield * 0.01) return false

  if (power > target.shield) {
    // 護盾吸收等量傷害，剩餘打船體
    const hullDamage = power - target.shield
    target.shield = 0
    target.hull -= hullDamage

    if (target.hull <= 0) {
      target.alive = false
      return true
    }

    // 爆炸判定：船體低於 70% 時，每次受擊有 (1 - hull/maxHull) 機率爆炸
    if (target.hull < target.maxHull * 0.7) {
      if (rng() < 1 - target.hull / target.maxHull) {
        target.alive = false
        return true
      }
    }
  } else {
    // 護盾完全吸收（本輪內累積）
    target.shield -= power
  }

  return false
}

/**
 * 一艘船開火（含連擊連鎖）：在敵方輪初存活單位中隨機選目標（含本輪已擊毀單位），
 * 每次射擊後有連擊值時以 (RF-1)/RF 機率再射一次
 */
function fireWithRapidFire(shooter: CombatUnit, enemies: CombatUnit[], rng: Rng): CombatUnit[] {
  const destroyed: CombatUnit[] = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (enemies.length === 0) break
    const target = enemies[Math.min(Math.floor(rng() * enemies.length), enemies.length - 1)]!
    const killed = resolveShot(shooter, target, rng)
    if (killed) {
      destroyed.push(target)
    }
    const rf = shooter.rapidFire[target.type]
    if (rf && rf > 1 && rng() < (rf - 1) / rf) {
      continue
    }
    break
  }

  return destroyed
}

interface RoundLosses {
  ships: Partial<Fleet>
  defense: Partial<Record<DefenseType, number>>
}

function emptyLosses(): RoundLosses {
  return { ships: {}, defense: {} }
}

function recordLoss(losses: RoundLosses, unit: CombatUnit): void {
  if (unit.isDefense) {
    const t = unit.type as DefenseType
    losses.defense[t] = (losses.defense[t] ?? 0) + 1
  } else {
    const t = unit.type as ShipType
    losses.ships[t] = (losses.ships[t] ?? 0) + 1
  }
}

/**
 * 一方全體開火
 */
function sideVolley(firing: CombatUnit[], enemies: CombatUnit[], losses: RoundLosses, rng: Rng): void {
  for (const shooter of shuffle([...firing], rng)) {
    const destroyed = fireWithRapidFire(shooter, enemies, rng)
    for (const unit of destroyed) recordLoss(losses, unit)
  }
}

/**
 * 模擬完整戰鬥（與原 worker 介面保持一致）
 * @param rng 隨機數生成器，預設 Math.random；傳入種子 RNG 可得到確定性結果（便於測試）
 */
export function simulateBattle(
  attacker: BattleSideData,
  defender: BattleSideData,
  maxRounds: number = 6,
  rng: Rng = Math.random
): BattleSimulationResult {
  const attackerUnits = buildUnits(attacker, false)
  const defenderUnits = buildUnits(defender, true)

  const totalAttackerLosses: Partial<Fleet> = {}
  const totalDefenderShipLosses: Partial<Fleet> = {}
  const totalDefenderDefenseLosses: Partial<Record<DefenseType, number>> = {}

  const roundDetails: BattleSimulationResult['roundDetails'] = []
  let rounds = 0

  const mergeLosses = (
    total: Partial<Fleet> | Partial<Record<DefenseType, number>>,
    delta: Partial<Fleet> | Partial<Record<DefenseType, number>>
  ) => {
    for (const [k, v] of Object.entries(delta)) {
      ;(total as Record<string, number>)[k] = ((total as Record<string, number>)[k] ?? 0) + (v ?? 0)
    }
  }

  for (let round = 0; round < maxRounds; round++) {
    const attackerFiring = attackerUnits.filter(u => u.alive)
    const defenderFiring = defenderUnits.filter(u => u.alive)
    if (attackerFiring.length === 0 || defenderFiring.length === 0) break
    rounds++

    // 每輪開始護盾完全恢復（OGame 原規則）
    for (const u of attackerUnits) if (u.alive) u.shield = u.maxShield
    for (const u of defenderUnits) if (u.alive) u.shield = u.maxShield

    // 攻擊方先全體開火，再防守方
    const attackerLosses = emptyLosses()
    const defenderLosses = emptyLosses()

    sideVolley(attackerFiring, defenderFiring, defenderLosses, rng)
    sideVolley(defenderFiring, attackerFiring, attackerLosses, rng)

    const attackerPower = attackerUnits
      .filter(u => u.alive)
      .reduce((sum, u) => sum + u.attack, 0)
    const defenderPower = defenderUnits
      .filter(u => u.alive)
      .reduce((sum, u) => sum + u.attack, 0)

    roundDetails.push({
      round: rounds,
      attackerLosses: { ...attackerLosses.ships },
      defenderLosses: {
        fleet: { ...defenderLosses.ships },
        defense: { ...defenderLosses.defense }
      },
      attackerRemainingPower: attackerPower,
      defenderRemainingPower: defenderPower
    })

    mergeLosses(totalAttackerLosses, attackerLosses.ships)
    mergeLosses(totalDefenderShipLosses, defenderLosses.ships)
    mergeLosses(totalDefenderDefenseLosses, defenderLosses.defense)
  }

  // 防禦設施 70% 機率修復（保留原遊戲規則）
  const repairedDefense: Partial<Record<DefenseType, number>> = {}
  for (const [defenseType, count] of Object.entries(totalDefenderDefenseLosses)) {
    let repaired = 0
    for (let destroyedIndex = 0; destroyedIndex < (count ?? 0); destroyedIndex++) {
      if (rng() < 0.7) repaired++
    }
    if (repaired > 0) {
      repairedDefense[defenseType as DefenseType] = repaired
      totalDefenderDefenseLosses[defenseType as DefenseType] = (count ?? 0) - repaired
    }
  }

  // 統計剩餘
  const attackerRemaining: Partial<Fleet> = {}
  for (const u of attackerUnits) {
    if (u.alive) attackerRemaining[u.type as ShipType] = (attackerRemaining[u.type as ShipType] ?? 0) + 1
  }
  const defenderShipRemaining: Partial<Fleet> = {}
  const defenderDefenseRemaining: Partial<Record<DefenseType, number>> = {}
  for (const u of defenderUnits) {
    if (!u.alive) continue
    if (u.isDefense) {
      defenderDefenseRemaining[u.type as DefenseType] =
        (defenderDefenseRemaining[u.type as DefenseType] ?? 0) + 1
    } else {
      defenderShipRemaining[u.type as ShipType] = (defenderShipRemaining[u.type as ShipType] ?? 0) + 1
    }
  }
  for (const [defenseType, count] of Object.entries(repairedDefense)) {
    defenderDefenseRemaining[defenseType as DefenseType] =
      (defenderDefenseRemaining[defenseType as DefenseType] ?? 0) + (count ?? 0)
  }

  // 判定勝負
  const attackerAlive = attackerUnits.some(u => u.alive)
  const defenderAlive = defenderUnits.some(u => u.alive)
  let winner: 'attacker' | 'defender' | 'draw'
  if (!attackerAlive && !defenderAlive) {
    winner = 'draw'
  } else if (!attackerAlive) {
    winner = 'defender'
  } else if (!defenderAlive) {
    winner = 'attacker'
  } else if (maxRounds > 6) {
    // 戰鬥到底模式：按剩餘船體總和判定，屬於本專案自創規則，非 OGame 原版
    const attackerHull = attackerUnits.filter(u => u.alive).reduce((s, u) => s + u.hull, 0)
    const defenderHull = defenderUnits.filter(u => u.alive).reduce((s, u) => s + u.hull, 0)
    if (attackerHull > defenderHull * 1.2) winner = 'attacker'
    else if (defenderHull > attackerHull * 1.2) winner = 'defender'
    else winner = 'draw'
  } else {
    // OGame 原版規則：6 輪後雙方仍有存活 → 平局
    winner = 'draw'
  }

  return {
    winner,
    rounds,
    attackerLosses: totalAttackerLosses,
    defenderLosses: {
      fleet: totalDefenderShipLosses,
      defense: totalDefenderDefenseLosses
    },
    attackerRemaining,
    defenderRemaining: {
      fleet: defenderShipRemaining,
      defense: defenderDefenseRemaining
    },
    roundDetails
  }
}
