import type { Fleet, Resources } from '@/types/game'
import { ShipType, DefenseType } from '@/types/game'
import { SHIPS, DEFENSES } from '@/config/gameConfig'

// 戰鬥單位介面
interface CombatUnit {
  type: ShipType | DefenseType
  count: number
  attack: number
  shield: number
  armor: number
  rapidFire?: Record<string, number> // 快速射擊
  // 戰鬥狀態追蹤（用於護盾再生和裝甲損壞效果）
  currentShield?: number // 當前護盾值（每輪開始恢復）
  armorDamage?: number // 累積裝甲損壞（降低防禦效果）
}

// 戰鬥方
interface BattleSide {
  ships: Partial<Fleet>
  defense?: Partial<Record<DefenseType, number>>
  weaponTech?: number
  shieldTech?: number
  armorTech?: number
}

// 戰鬥輪次結果
interface RoundResult {
  attackerLosses: Partial<Fleet>
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  attackerRemainingPower: number
  defenderRemainingPower: number
}

/**
 * 計算科技加成後的數值
 */
const applyTechBonus = (baseValue: number, techLevel: number = 0, bonusPerLevel: number = 0.1): number => {
  return Math.floor(baseValue * (1 + techLevel * bonusPerLevel))
}

/**
 * 將艦隊和防禦轉換為戰鬥單位陣列
 */
const prepareCombatUnits = (side: BattleSide, isDefender: boolean = false): CombatUnit[] => {
  const units: CombatUnit[] = []

  // 處理艦船
  if (side.ships) {
    for (const [shipType, count] of Object.entries(side.ships)) {
      if (count > 0) {
        const config = SHIPS[shipType as ShipType]
        units.push({
          type: shipType as ShipType,
          count: count,
          attack: applyTechBonus(config.attack, side.weaponTech),
          shield: applyTechBonus(config.shield, side.shieldTech),
          armor: applyTechBonus(config.armor, side.armorTech),
          rapidFire: config.rapidFire as Record<string, number> | undefined
        })
      }
    }
  }

  // 處理防禦設施（僅防守方）
  if (isDefender && side.defense) {
    for (const [defenseType, count] of Object.entries(side.defense)) {
      if (count > 0) {
        const config = DEFENSES[defenseType as DefenseType]
        units.push({
          type: defenseType as DefenseType,
          count: count,
          attack: applyTechBonus(config.attack, side.weaponTech),
          shield: applyTechBonus(config.shield, side.shieldTech),
          armor: applyTechBonus(config.armor, side.armorTech)
          // 防禦設施沒有rapidFire
        })
      }
    }
  }

  return units
}

/**
 * 戰鬥效果配置
 */
const COMBAT_EFFECTS = {
  // 護盾彈回閾值：攻擊力低於護盾此比例時大機率彈回
  SHIELD_BOUNCE_THRESHOLD: 0.01,
  // 護盾彈回時仍有此機率穿透
  SHIELD_BOUNCE_PENETRATION_CHANCE: 0.01,
  // 每輪護盾再生比例（恢復最大護盾的百分比）
  SHIELD_REGEN_RATE: 0.7,
  // 裝甲損壞累積效果：每次受到未被護盾完全吸收的傷害，累積裝甲損壞
  ARMOR_DAMAGE_RATE: 0.05,
  // 裝甲損壞上限（最多降低防禦效果的百分比）
  MAX_ARMOR_DAMAGE: 0.3,
  // 重型武器對護盾穿透機率（攻擊力>5000的武器）
  HEAVY_WEAPON_SHIELD_PENETRATION: 0.15,
  // 重型武器閾值
  HEAVY_WEAPON_THRESHOLD: 5000
}

/**
 * 計算一個單位對另一個單位造成的傷害
 * 增強版：包含護盾彈回、重型武器穿透、裝甲損壞累積
 */
const calculateDamage = (
  attacker: CombatUnit,
  defender: CombatUnit
): { destroyed: number; damagedShield: number; armorDamageDealt: number } => {
  const attackPower = attacker.attack
  // 使用當前護盾值（如果有），否則使用最大護盾
  const defenderCurrentShield = defender.currentShield ?? defender.shield
  // 考慮裝甲損壞後的有效裝甲
  const armorDamageMultiplier = 1 - (defender.armorDamage ?? 0)
  const effectiveArmor = defender.armor * armorDamageMultiplier

  let destroyed = 0
  let damagedShield = 0
  let armorDamageDealt = 0

  // 重型武器穿透：高攻擊力武器有機率部分無視護盾
  let shieldPenetration = 0
  if (attackPower >= COMBAT_EFFECTS.HEAVY_WEAPON_THRESHOLD) {
    if (Math.random() < COMBAT_EFFECTS.HEAVY_WEAPON_SHIELD_PENETRATION) {
      // 穿透30%-50%的護盾
      shieldPenetration = 0.3 + Math.random() * 0.2
    }
  }

  // 計算實際護盾值（考慮穿透）
  const effectiveShield = defenderCurrentShield * (1 - shieldPenetration)

  // 如果攻擊力小於護盾的1%，有很大機率無法擊穿護盾（護盾彈回機制）
  if (attackPower < effectiveShield * COMBAT_EFFECTS.SHIELD_BOUNCE_THRESHOLD) {
    if (Math.random() > COMBAT_EFFECTS.SHIELD_BOUNCE_PENETRATION_CHANCE) {
      return { destroyed: 0, damagedShield: 0, armorDamageDealt: 0 }
    }
  }

  // 計算傷害
  let remainingDamage = attackPower

  // 先消耗護盾
  if (remainingDamage > effectiveShield) {
    remainingDamage -= effectiveShield
    damagedShield = effectiveShield
    // 更新單位的當前護盾
    defender.currentShield = Math.max(0, defenderCurrentShield - damagedShield)
  } else {
    damagedShield = remainingDamage
    defender.currentShield = Math.max(0, defenderCurrentShield - damagedShield)
    return { destroyed: 0, damagedShield, armorDamageDealt: 0 }
  }

  // 穿透護盾後對裝甲造成損壞累積
  if (remainingDamage > 0) {
    armorDamageDealt = Math.min(COMBAT_EFFECTS.ARMOR_DAMAGE_RATE, COMBAT_EFFECTS.MAX_ARMOR_DAMAGE - (defender.armorDamage ?? 0))
    defender.armorDamage = Math.min(COMBAT_EFFECTS.MAX_ARMOR_DAMAGE, (defender.armorDamage ?? 0) + armorDamageDealt)
  }

  // 再消耗裝甲
  if (remainingDamage > effectiveArmor) {
    destroyed = 1
  } else {
    // 有機率摧毀（基於傷害與有效裝甲的比例）
    const destroyChance = remainingDamage / effectiveArmor
    if (Math.random() < destroyChance) {
      destroyed = 1
    }
  }

  return { destroyed, damagedShield, armorDamageDealt }
}

/**
 * 執行單個攻擊單位的射擊（包含快速射擊機制）
 * OGame規則：如果攻擊者對目標有rapidFire值N，攻擊後有(N-1)/N的機率再次攻擊
 * @param attacker 攻擊單位
 * @param targets 目標單位陣列
 * @param losses 損失記錄物件
 * @param isShipLoss 是否是艦船損失（用於區分艦船和防禦）
 */
const executeAttack = (
  attacker: CombatUnit,
  targets: CombatUnit[],
  shipLosses: Partial<Fleet>,
  defenseLosses: Partial<Record<DefenseType, number>>
): void => {
  if (targets.length === 0) return

  // 隨機選擇一個目標
  const targetIndex = Math.floor(Math.random() * targets.length)
  const target = targets[targetIndex]
  if (!target) return

  const { destroyed } = calculateDamage(attacker, target)

  if (destroyed > 0) {
    target.count -= destroyed

    // 記錄損失
    if (Object.values(ShipType).includes(target.type as ShipType)) {
      const shipType = target.type as ShipType
      shipLosses[shipType] = (shipLosses[shipType] || 0) + destroyed
    } else {
      const defenseType = target.type as DefenseType
      defenseLosses[defenseType] = (defenseLosses[defenseType] || 0) + destroyed
    }

    // 如果目標被全部摧毀，從列表中移除
    if (target.count <= 0) {
      targets.splice(targetIndex, 1)
    }
  }

  // 快速射擊機制：如果攻擊者對目標型別有rapidFire，有機率繼續攻擊
  if (attacker.rapidFire && targets.length > 0) {
    const rapidFireValue = attacker.rapidFire[target.type]
    if (rapidFireValue && rapidFireValue > 1) {
      // 繼續攻擊的機率 = (N-1)/N
      const continueChance = (rapidFireValue - 1) / rapidFireValue
      if (Math.random() < continueChance) {
        // 遞迴執行下一次攻擊
        executeAttack(attacker, targets, shipLosses, defenseLosses)
      }
    }
  }
}

/**
 * 執行一輪戰鬥
 */
const executeRound = (attackerUnits: CombatUnit[], defenderUnits: CombatUnit[]): RoundResult => {
  const attackerLosses: Partial<Fleet> = {}
  const defenderShipLosses: Partial<Fleet> = {}
  const defenderDefenseLosses: Partial<Record<DefenseType, number>> = {}

  // 攻擊方向防守方射擊（帶快速射擊）
  for (const attacker of attackerUnits) {
    for (let i = 0; i < attacker.count; i++) {
      if (defenderUnits.length === 0) break
      executeAttack(attacker, defenderUnits, defenderShipLosses, defenderDefenseLosses)
    }
  }

  // 防守方向攻擊方射擊（防禦設施沒有rapidFire，使用簡化邏輯）
  for (const defender of defenderUnits) {
    for (let i = 0; i < defender.count; i++) {
      if (attackerUnits.length === 0) break

      const targetIndex = Math.floor(Math.random() * attackerUnits.length)
      const target = attackerUnits[targetIndex]

      if (!target) continue

      const { destroyed } = calculateDamage(defender, target)

      if (destroyed > 0) {
        target.count -= destroyed

        // 記錄損失
        const shipType = target.type as ShipType
        attackerLosses[shipType] = (attackerLosses[shipType] || 0) + destroyed

        // 如果目標被全部摧毀，從列表中移除
        if (target.count <= 0) {
          attackerUnits.splice(targetIndex, 1)
        }
      }
    }
  }

  // 計算剩餘戰鬥力
  const attackerPower = attackerUnits.reduce((sum, unit) => sum + unit.count * unit.attack, 0)
  const defenderPower = defenderUnits.reduce((sum, unit) => sum + unit.count * unit.attack, 0)

  return {
    attackerLosses,
    defenderLosses: {
      fleet: defenderShipLosses,
      defense: defenderDefenseLosses
    },
    attackerRemainingPower: attackerPower,
    defenderRemainingPower: defenderPower
  }
}

/**
 * 模擬完整戰鬥
 * @param attacker 攻擊方
 * @param defender 防守方
 * @param maxRounds 最大回合數（預設6回合）
 */
export const simulateBattle = (
  attacker: BattleSide,
  defender: BattleSide,
  maxRounds: number = 6
): {
  winner: 'attacker' | 'defender' | 'draw'
  rounds: number
  attackerLosses: Partial<Fleet>
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  attackerRemaining: Partial<Fleet>
  defenderRemaining: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  roundDetails: Array<{
    round: number
    attackerLosses: Partial<Fleet>
    defenderLosses: {
      fleet: Partial<Fleet>
      defense: Partial<Record<DefenseType, number>>
    }
    attackerRemainingPower: number
    defenderRemainingPower: number
  }>
} => {
  // 準備戰鬥單位
  let attackerUnits = prepareCombatUnits(attacker, false)
  let defenderUnits = prepareCombatUnits(defender, true)

  // 初始化戰鬥狀態
  const initializeCombatState = (units: CombatUnit[]) => {
    for (const unit of units) {
      unit.currentShield = unit.shield
      unit.armorDamage = 0
    }
  }
  initializeCombatState(attackerUnits)
  initializeCombatState(defenderUnits)

  // 護盾再生函式：每輪戰鬥後恢復部分護盾
  const regenerateShields = (units: CombatUnit[]) => {
    for (const unit of units) {
      if (unit.currentShield !== undefined && unit.currentShield < unit.shield) {
        // 恢復最大護盾的70%（但不超過最大值）
        const regenAmount = unit.shield * COMBAT_EFFECTS.SHIELD_REGEN_RATE
        unit.currentShield = Math.min(unit.shield, unit.currentShield + regenAmount)
      }
    }
  }

  const totalAttackerLosses: Partial<Fleet> = {}
  const totalDefenderShipLosses: Partial<Fleet> = {}
  const totalDefenderDefenseLosses: Partial<Record<DefenseType, number>> = {}
  const roundDetails: Array<{
    round: number
    attackerLosses: Partial<Fleet>
    defenderLosses: {
      fleet: Partial<Fleet>
      defense: Partial<Record<DefenseType, number>>
    }
    attackerRemainingPower: number
    defenderRemainingPower: number
  }> = []

  let rounds = 0

  // 執行最多maxRounds輪戰鬥
  for (let round = 0; round < maxRounds; round++) {
    if (attackerUnits.length === 0 || defenderUnits.length === 0) {
      break
    }

    rounds++

    const roundResult = executeRound(attackerUnits, defenderUnits)

    // 每輪結束後護盾再生
    regenerateShields(attackerUnits)
    regenerateShields(defenderUnits)

    // 儲存當前回合詳情
    roundDetails.push({
      round: rounds,
      attackerLosses: { ...roundResult.attackerLosses },
      defenderLosses: {
        fleet: { ...roundResult.defenderLosses.fleet },
        defense: { ...roundResult.defenderLosses.defense }
      },
      attackerRemainingPower: roundResult.attackerRemainingPower,
      defenderRemainingPower: roundResult.defenderRemainingPower
    })

    // 累計損失
    for (const [shipType, count] of Object.entries(roundResult.attackerLosses)) {
      totalAttackerLosses[shipType as ShipType] = (totalAttackerLosses[shipType as ShipType] || 0) + count
    }

    for (const [shipType, count] of Object.entries(roundResult.defenderLosses.fleet)) {
      totalDefenderShipLosses[shipType as ShipType] = (totalDefenderShipLosses[shipType as ShipType] || 0) + count
    }

    for (const [defenseType, count] of Object.entries(roundResult.defenderLosses.defense)) {
      totalDefenderDefenseLosses[defenseType as DefenseType] = (totalDefenderDefenseLosses[defenseType as DefenseType] || 0) + count
    }
  }

  // 防禦設施有機率修復（70%機率）
  const repairedDefense: Partial<Record<DefenseType, number>> = {}
  for (const [defenseType, count] of Object.entries(totalDefenderDefenseLosses)) {
    const repaired = Math.floor(count * 0.7)
    if (repaired > 0) {
      repairedDefense[defenseType as DefenseType] = repaired
      totalDefenderDefenseLosses[defenseType as DefenseType] = count - repaired
    }
  }

  // 計算剩餘單位
  const attackerRemaining: Partial<Fleet> = {}
  for (const unit of attackerUnits) {
    if (unit.count > 0) {
      attackerRemaining[unit.type as ShipType] = unit.count
    }
  }

  const defenderShipRemaining: Partial<Fleet> = {}
  const defenderDefenseRemaining: Partial<Record<DefenseType, number>> = {}
  for (const unit of defenderUnits) {
    if (unit.count > 0) {
      if (Object.values(ShipType).includes(unit.type as ShipType)) {
        defenderShipRemaining[unit.type as ShipType] = unit.count
      } else {
        defenderDefenseRemaining[unit.type as DefenseType] = unit.count
      }
    }
  }

  // 新增修復的防禦設施
  for (const [defenseType, count] of Object.entries(repairedDefense)) {
    defenderDefenseRemaining[defenseType as DefenseType] = (defenderDefenseRemaining[defenseType as DefenseType] || 0) + count
  }

  // 判斷勝負
  let winner: 'attacker' | 'defender' | 'draw'
  if (attackerUnits.length === 0 && defenderUnits.length === 0) {
    winner = 'draw'
  } else if (attackerUnits.length === 0) {
    winner = 'defender'
  } else if (defenderUnits.length === 0) {
    winner = 'attacker'
  } else {
    // 達到最大回合數後雙方都有剩餘單位
    // 如果是戰鬥到底模式(maxRounds > 6)，根據剩餘戰力判定勝負
    if (maxRounds > 6) {
      // 計算剩餘戰力
      const attackerPower = attackerUnits.reduce((sum, u) => sum + u.count * u.armor, 0)
      const defenderPower = defenderUnits.reduce((sum, u) => sum + u.count * u.armor, 0)
      // 戰力差距超過20%判定勝負，否則平局
      if (attackerPower > defenderPower * 1.2) {
        winner = 'attacker'
      } else if (defenderPower > attackerPower * 1.2) {
        winner = 'defender'
      } else {
        winner = 'draw'
      }
    } else {
      // OGame原版規則：6回合後雙方都有剩餘單位時判定為平局
      winner = 'draw'
    }
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

/**
 * 計算掠奪的資源
 * 攻擊方最多可以掠奪防守方50%的資源，但受運輸船載貨量限制
 */
export const calculatePlunder = (defenderResources: Resources, attackerFleet: Partial<Fleet>): Resources => {
  // 計算總載貨量
  let totalCapacity = 0
  for (const [shipType, count] of Object.entries(attackerFleet)) {
    const config = SHIPS[shipType as ShipType]
    totalCapacity += config.cargoCapacity * count
  }

  // 計算可掠奪資源（50%）
  const availableResources = {
    metal: Math.floor(defenderResources.metal * 0.5),
    crystal: Math.floor(defenderResources.crystal * 0.5),
    deuterium: Math.floor(defenderResources.deuterium * 0.5),
    darkMatter: Math.floor(defenderResources.darkMatter * 0.5),
    energy: 0
  }

  const totalAvailable =
    availableResources.metal + availableResources.crystal + availableResources.deuterium + availableResources.darkMatter

  // 如果載貨量足夠，全部掠奪
  if (totalCapacity >= totalAvailable) {
    return availableResources
  }

  // 否則按比例分配
  const ratio = totalCapacity / totalAvailable
  return {
    metal: Math.floor(availableResources.metal * ratio),
    crystal: Math.floor(availableResources.crystal * ratio),
    deuterium: Math.floor(availableResources.deuterium * ratio),
    darkMatter: Math.floor(availableResources.darkMatter * ratio),
    energy: 0
  }
}

/**
 * 計算殘骸場
 * 被摧毀的艦船和防禦會產生30%的金屬和晶體殘骸
 */
export const calculateDebrisField = (
  attackerLosses: Partial<Fleet>,
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
): Resources => {
  let totalMetal = 0
  let totalCrystal = 0

  // 計算攻擊方損失產生的殘骸
  for (const [shipType, count] of Object.entries(attackerLosses)) {
    const config = SHIPS[shipType as ShipType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  // 計算防守方艦船損失產生的殘骸
  for (const [shipType, count] of Object.entries(defenderLosses.fleet)) {
    const config = SHIPS[shipType as ShipType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  // 計算防守方防禦損失產生的殘骸
  for (const [defenseType, count] of Object.entries(defenderLosses.defense)) {
    const config = DEFENSES[defenseType as DefenseType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  return {
    metal: Math.floor(totalMetal),
    crystal: Math.floor(totalCrystal),
    deuterium: 0,
    darkMatter: 0,
    energy: 0
  }
}
