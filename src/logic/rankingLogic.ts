/**
 * 排行榜邏輯模組
 * 計算玩家和NPC的各類積分，並生成排行榜
 */
import type { Player, NPC, Planet, RankingEntry, RankingCategory } from '@/types/game'
import { BuildingType, TechnologyType, ShipType, DefenseType } from '@/types/game'
import { BUILDINGS, TECHNOLOGIES, SHIPS, DEFENSES } from '@/config/gameConfig'

/**
 * 計算建築積分
 * 基於累計投入的資源計算（與側邊欄保持一致）
 */
export const calculateBuildingScore = (planets: Planet[]): number => {
  let totalCost = 0

  for (const planet of planets) {
    for (const buildingType of Object.values(BuildingType)) {
      const level = planet.buildings[buildingType] || 0
      if (level <= 0) continue

      const config = BUILDINGS[buildingType]
      if (!config) continue

      // 計算從1級到當前等級的累計成本（每級單獨取整，與 publicLogic 一致）
      for (let lvl = 1; lvl <= level; lvl++) {
        const multiplier = Math.pow(config.costMultiplier, lvl - 1)
        const metal = Math.floor(config.baseCost.metal * multiplier)
        const crystal = Math.floor(config.baseCost.crystal * multiplier)
        const deuterium = Math.floor(config.baseCost.deuterium * multiplier)
        totalCost += metal + crystal + deuterium
      }
    }
  }

  return Math.floor(totalCost / 1000)
}

/**
 * 計算研究積分
 * 基於累計投入的資源計算（與側邊欄保持一致，不計入暗物質）
 */
export const calculateResearchScore = (technologies: Record<TechnologyType, number>): number => {
  let totalCost = 0

  for (const techType of Object.values(TechnologyType)) {
    const level = technologies[techType] || 0
    if (level <= 0) continue

    const config = TECHNOLOGIES[techType]
    if (!config) continue

    // 計算從1級到當前等級的累計成本（每級單獨取整，與 publicLogic 一致）
    for (let lvl = 1; lvl <= level; lvl++) {
      const multiplier = Math.pow(config.costMultiplier, lvl - 1)
      const metal = Math.floor(config.baseCost.metal * multiplier)
      const crystal = Math.floor(config.baseCost.crystal * multiplier)
      const deuterium = Math.floor(config.baseCost.deuterium * multiplier)
      // 不計入暗物質，與側邊欄保持一致
      totalCost += metal + crystal + deuterium
    }
  }

  return Math.floor(totalCost / 1000)
}

/**
 * 計算艦隊積分
 * 基於當前擁有的艦船計算（與側邊欄保持一致，不含飛行中艦隊，不計入暗物質）
 */
export const calculateFleetScore = (planets: Planet[]): number => {
  let totalCost = 0

  // 只計算停靠在星球上的艦隊（與側邊欄保持一致）
  for (const planet of planets) {
    for (const shipType of Object.values(ShipType)) {
      const count = planet.fleet[shipType] || 0
      if (count <= 0) continue

      const config = SHIPS[shipType]
      if (!config) continue

      // 不計入暗物質，與側邊欄保持一致
      const cost = (config.cost.metal + config.cost.crystal + config.cost.deuterium) * count
      totalCost += cost
    }
  }

  return Math.floor(totalCost / 1000)
}

/**
 * 計算防禦積分
 * 基於當前擁有的防禦設施計算（與側邊欄保持一致，不計入暗物質）
 */
export const calculateDefenseScore = (planets: Planet[]): number => {
  let totalCost = 0

  for (const planet of planets) {
    for (const defenseType of Object.values(DefenseType)) {
      const count = planet.defense[defenseType] || 0
      if (count <= 0) continue

      const config = DEFENSES[defenseType]
      if (!config) continue

      // 不計入暗物質，與側邊欄保持一致
      const cost = (config.cost.metal + config.cost.crystal + config.cost.deuterium) * count
      totalCost += cost
    }
  }

  return Math.floor(totalCost / 1000)
}

/**
 * 計算玩家的所有積分
 */
export const calculatePlayerScores = (player: Player): RankingEntry['scores'] => {
  const building = calculateBuildingScore(player.planets)
  const research = calculateResearchScore(player.technologies)
  const fleet = calculateFleetScore(player.planets)
  const defense = calculateDefenseScore(player.planets)
  const total = building + research + fleet + defense

  return { total, building, research, fleet, defense }
}

/**
 * 計算NPC的所有積分
 */
export const calculateNPCScores = (npc: NPC): RankingEntry['scores'] => {
  const building = calculateBuildingScore(npc.planets)
  const research = calculateResearchScore(npc.technologies)
  const fleet = calculateFleetScore(npc.planets)
  const defense = calculateDefenseScore(npc.planets)
  const total = building + research + fleet + defense

  return { total, building, research, fleet, defense }
}

/**
 * 生成排行榜條目
 */
export const createRankingEntry = (
  id: string,
  name: string,
  isPlayer: boolean,
  scores: RankingEntry['scores'],
  planetCount: number
): RankingEntry => {
  return { id, name, isPlayer, scores, planetCount }
}

/**
 * 獲取完整的排行榜
 * @param player 玩家資料
 * @param npcs NPC列表
 * @param category 排行榜類別
 * @returns 按指定類別積分排序的排行榜
 */
export const getRanking = (player: Player, npcs: NPC[], category: RankingCategory): RankingEntry[] => {
  const entries: RankingEntry[] = []

  // 新增玩家
  const playerScores = calculatePlayerScores(player)
  entries.push(createRankingEntry(player.id, player.name || '玩家', true, playerScores, player.planets.length))

  // 新增所有NPC
  for (const npc of npcs) {
    if (npc.planets.length === 0) continue // 跳過沒有星球的NPC
    const npcScores = calculateNPCScores(npc)
    entries.push(createRankingEntry(npc.id, npc.name, false, npcScores, npc.planets.length))
  }

  // 按指定類別的積分降序排序
  entries.sort((a, b) => b.scores[category] - a.scores[category])

  return entries
}

/**
 * 獲取玩家在指定類別的排名
 * @param player 玩家資料
 * @param npcs NPC列表
 * @param category 排行榜類別
 * @returns 玩家排名（從1開始）
 */
export const getPlayerRank = (player: Player, npcs: NPC[], category: RankingCategory): number => {
  const ranking = getRanking(player, npcs, category)
  const playerIndex = ranking.findIndex(entry => entry.isPlayer)
  return playerIndex + 1
}

/**
 * 獲取排行榜統計資訊
 */
export const getRankingStats = (
  player: Player,
  npcs: NPC[]
): {
  totalPlayers: number
  playerRanks: Record<RankingCategory, number>
} => {
  const totalPlayers = 1 + npcs.filter(npc => npc.planets.length > 0).length
  const categories: RankingCategory[] = ['total', 'building', 'research', 'fleet', 'defense']

  const playerRanks = {} as Record<RankingCategory, number>
  for (const category of categories) {
    playerRanks[category] = getPlayerRank(player, npcs, category)
  }

  return { totalPlayers, playerRanks }
}
