import type { Fleet, Resources, BattleResult, Officer, TechnologyType } from '@/types/game'
import { DefenseType, OfficerType } from '@/types/game'
import { workerManager } from '@/workers/workerManager'
import { MOON_CONFIG } from '@/config/gameConfig'
import { generateId } from '@/utils/id'

/**
 * 執行戰鬥模擬
 * 使用 Web Worker 在後臺執行緒中執行計算密集型的戰鬥模擬
 */
export const simulateBattle = async (
  attackerFleet: Partial<Fleet>,
  defenderFleet: Partial<Fleet>,
  defenderDefense: Partial<Record<DefenseType, number>>,
  defenderResources: Resources,
  _attackerOfficers: Record<OfficerType, Officer>,
  _defenderOfficers: Record<OfficerType, Officer>,
  attackerTechnologies: Record<TechnologyType, number>,
  defenderTechnologies: Record<TechnologyType, number>,
  battleToFinish: boolean = false // 戰鬥到底模式
): Promise<BattleResult> => {
  // 從科技系統讀取實際科技等級
  const attackerWeaponTech = attackerTechnologies['weaponsTechnology'] || 0
  const attackerShieldTech = attackerTechnologies['shieldingTechnology'] || 0
  const attackerArmorTech = attackerTechnologies['armourTechnology'] || 0

  const defenderWeaponTech = defenderTechnologies['weaponsTechnology'] || 0
  const defenderShieldTech = defenderTechnologies['shieldingTechnology'] || 0
  const defenderArmorTech = defenderTechnologies['armourTechnology'] || 0

  // 使用 Worker 執行戰鬥模擬
  const simulationResult = await workerManager.simulateBattle({
    attacker: {
      ships: attackerFleet,
      weaponTech: attackerWeaponTech,
      shieldTech: attackerShieldTech,
      armorTech: attackerArmorTech
    },
    defender: {
      ships: defenderFleet,
      defense: defenderDefense,
      weaponTech: defenderWeaponTech,
      shieldTech: defenderShieldTech,
      armorTech: defenderArmorTech
    },
    maxRounds: battleToFinish ? 100 : 6 // 戰鬥到底模式最多100回合，經典模式6回合
  })

  // 計算掠奪（僅攻擊方勝利時）
  const plunder =
    simulationResult.winner === 'attacker'
      ? await workerManager.calculatePlunder({
          defenderResources,
          attackerFleet: simulationResult.attackerRemaining
        })
      : { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }

  // 計算殘骸場
  const debrisField = await workerManager.calculateDebris({
    attackerLosses: simulationResult.attackerLosses,
    defenderLosses: simulationResult.defenderLosses
  })

  // 計算月球生成機率（根據殘骸場總量）
  const totalDebris = debrisField.metal + debrisField.crystal
  const moonChance = Math.min(MOON_CONFIG.baseChance + Math.floor(totalDebris / MOON_CONFIG.chancePerDebris), MOON_CONFIG.maxChance) / 100 // 轉換為0-1的機率

  // 生成戰鬥報告
  const battleResult: BattleResult = {
    id: generateId('battle'),
    timestamp: Date.now(),
    attackerId: '',
    defenderId: '',
    attackerPlanetId: '',
    defenderPlanetId: '',
    attackerFleet,
    defenderFleet,
    defenderDefense,
    attackerLosses: simulationResult.attackerLosses,
    defenderLosses: simulationResult.defenderLosses,
    winner: simulationResult.winner,
    plunder,
    debrisField,
    // 新增詳細資訊
    rounds: simulationResult.rounds,
    attackerRemaining: simulationResult.attackerRemaining,
    defenderRemaining: simulationResult.defenderRemaining,
    roundDetails: simulationResult.roundDetails,
    moonChance
  }

  return battleResult
}

/**
 * 計算防禦設施修復（防禦有70%機率修復）
 */
export const repairDefense = (
  defenseBeforeBattle: Partial<Record<DefenseType, number>>,
  defenseAfterBattle: Partial<Record<DefenseType, number>>
): Partial<Record<DefenseType, number>> => {
  const repaired: Partial<Record<DefenseType, number>> = { ...defenseAfterBattle }

  Object.keys(defenseBeforeBattle).forEach(defenseType => {
    const before = defenseBeforeBattle[defenseType as DefenseType] || 0
    const after = defenseAfterBattle[defenseType as DefenseType] || 0
    const lost = before - after

    if (lost > 0) {
      // 70%修復機率
      const repairedCount = Math.floor(lost * 0.7)
      repaired[defenseType as DefenseType] = after + repairedCount
    }
  })

  return repaired
}
