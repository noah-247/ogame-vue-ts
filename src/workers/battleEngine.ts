/**
 * OGame 真实战斗引擎
 * ==================
 * 依照原版 OGame 战斗公式重写（原实现为简化版：逐型随机单发、无连击、无护盾回充、无爆炸判定）。
 *
 * 核心规则：
 * 1. 每轮开始时双方护盾完全恢复；一轮内护盾承受的伤害会累积。
 * 2. 攻击方全体先开火，之后防守方全体开火；每艘船每轮开火一次，
 *    目标在敌方轮初存活单位中均匀随机选取；本轮被击毁的单位仍开火且仍可被选中。
 * 3. 护盾吸收：攻击力 <= 护盾 → 护盾全吸收，船体无伤；
 *    攻击力 > 护盾 → 护盾吸收等量伤害，剩余伤害打到船体。
 * 4. 护盾穿透下限：攻击力 < 本轮当前护盾 1% 时，100% 跳弹，无伤害。
 * 5. 船体 = (金属+晶体造价) × 10%，科技每级 +10%。
 *    每次造成船体伤害时，若未被击毁且剩余船体 < 70% 上限，有 (1 - 剩余/上限) 概率爆炸。
 * 6. 连击 (Rapid Fire)：每次射击后，无论是否击毁，若对该目标类型有连击值 RF，
 *    以 (RF-1)/RF 概率立即再开火一次，可连锁触发。
 * 7. 经典模式 6 轮后双方仍有存活 → 平局。
 */

import { ShipType, DefenseType } from '@/types/game'
import { SHIPS, DEFENSES } from '@/config/gameConfig'
import type { Fleet } from '@/types/game'
import type { BattleSideData, BattleSimulationResult } from '@/types/worker'

/** 单个战斗单位（每艘船/每座防御设施一个实例） */
interface CombatUnit {
  type: string
  isDefense: boolean
  attack: number
  maxShield: number
  shield: number // 本轮剩余护盾
  maxHull: number
  hull: number // 当前船体
  rapidFire: Record<string, number>
  alive: boolean
}

const techBonus = (base: number, level: number = 0): number =>
  Math.floor(base * (1 + level * 0.1))

/** 船体上限 = (金属 + 晶体造价) × 10% × 装甲科技加成（OGame 原公式） */
const hullFor = (metal: number, crystal: number, armorTech: number): number =>
  Math.floor((metal + crystal) * 0.1 * (1 + armorTech * 0.1))

/**
 * 把舰队/防御展开为单个战斗单位数组
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

/** 随机数生成器类型，必须返回 [0, 1)（默认 Math.random；测试可注入种子 RNG 以保证确定性） */
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
 * 单次射击结算，返回目标是否被击毁
 */
function resolveShot(shooter: CombatUnit, target: CombatUnit, rng: Rng): boolean {
  if (!target.alive) return false
  const power = shooter.attack

  if (power < target.shield * 0.01) return false

  if (power > target.shield) {
    // 护盾吸收等量伤害，剩余打船体
    const hullDamage = power - target.shield
    target.shield = 0
    target.hull -= hullDamage

    if (target.hull <= 0) {
      target.alive = false
      return true
    }

    // 爆炸判定：船体低于 70% 时，每次受击有 (1 - hull/maxHull) 概率爆炸
    if (target.hull < target.maxHull * 0.7) {
      if (rng() < 1 - target.hull / target.maxHull) {
        target.alive = false
        return true
      }
    }
  } else {
    // 护盾完全吸收（本轮内累积）
    target.shield -= power
  }

  return false
}

/**
 * 一艘船开火（含连击连锁）：在敌方轮初存活单位中随机选目标（含本轮已击毁单位），
 * 每次射击后有连击值时以 (RF-1)/RF 概率再射一次
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
 * 一方全体开火
 */
function sideVolley(firing: CombatUnit[], enemies: CombatUnit[], losses: RoundLosses, rng: Rng): void {
  for (const shooter of shuffle([...firing], rng)) {
    const destroyed = fireWithRapidFire(shooter, enemies, rng)
    for (const unit of destroyed) recordLoss(losses, unit)
  }
}

/**
 * 模拟完整战斗（与原 worker 接口保持一致）
 * @param rng 随机数生成器，默认 Math.random；传入种子 RNG 可得到确定性结果（便于测试）
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

    // 每轮开始护盾完全恢复（OGame 原规则）
    for (const u of attackerUnits) if (u.alive) u.shield = u.maxShield
    for (const u of defenderUnits) if (u.alive) u.shield = u.maxShield

    // 攻击方先全体开火，再防守方
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

  // 防御设施 70% 概率修复（保留原游戏规则）
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

  // 统计剩余
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

  // 判定胜负
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
    // 战斗到底模式：按剩余船体总和判定，属于本项目自创规则，非 OGame 原版
    const attackerHull = attackerUnits.filter(u => u.alive).reduce((s, u) => s + u.hull, 0)
    const defenderHull = defenderUnits.filter(u => u.alive).reduce((s, u) => s + u.hull, 0)
    if (attackerHull > defenderHull * 1.2) winner = 'attacker'
    else if (defenderHull > attackerHull * 1.2) winner = 'defender'
    else winner = 'draw'
  } else {
    // OGame 原版规则：6 轮后双方仍有存活 → 平局
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
