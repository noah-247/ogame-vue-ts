import { useGameStore } from '@/stores/gameStore'
import * as publicLogic from '@/logic/publicLogic'
import type { BuildingType, TechnologyType } from '@/types/game'

/**
 * 判斷實體（建築／艦船／防禦／科技）是否已解鎖。
 *
 * 與 CardUnlockOverlay 內部邏輯保持一致，抽出共用：
 * ArtworkImage 在鎖定時也要跟著模糊，否則會出現「遮罩只糊文字、立繪圖清清楚楚」的破綻。
 */
export function isEntityUnlocked(
  requirements: Partial<Record<BuildingType | TechnologyType, number>> | undefined,
  currentLevel?: number
): boolean {
  const gameStore = useGameStore()
  // 已經建造過（level > 0）視為已解鎖，不顯示遮罩
  if (currentLevel !== undefined && currentLevel > 0) return true
  if (!requirements || !gameStore.currentPlanet) return true
  return publicLogic.checkRequirements(gameStore.currentPlanet, gameStore.player.technologies, requirements)
}
