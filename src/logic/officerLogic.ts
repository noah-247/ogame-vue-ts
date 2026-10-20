import { getGameNow } from './gameTime'
import type { Officer, Resources } from '@/types/game'
import { OfficerType } from '@/types/game'
import { OFFICERS } from '@/config/gameConfig'

/**
 * 獲取軍官成本
 */
export const getOfficerCost = (officerType: OfficerType): Resources => {
  const config = OFFICERS[officerType]
  return config.cost
}

/**
 * 檢查軍官是否啟用
 */
export const isOfficerActive = (officer: Officer, now: number): boolean => {
  return officer.active && (!officer.expiresAt || officer.expiresAt > now)
}

/**
 * 建立啟用的軍官
 */
export const createActiveOfficer = (officerType: OfficerType, duration: number): Officer => {
  const now = getGameNow()
  return {
    type: officerType,
    active: true,
    hiredAt: now,
    expiresAt: now + duration * 24 * 60 * 60 * 1000 // duration天后過期
  }
}

/**
 * 建立未啟用的軍官
 */
export const createInactiveOfficer = (officerType: OfficerType): Officer => {
  return {
    type: officerType,
    active: false
  }
}

/**
 * 續約軍官
 */
export const renewOfficerExpiration = (officer: Officer, duration: number, now: number): Officer => {
  const expiresAt = officer.expiresAt && officer.expiresAt > now ? officer.expiresAt : now
  return {
    ...officer,
    active: true,
    expiresAt: expiresAt + duration * 24 * 60 * 60 * 1000
  }
}

/**
 * 計算所有啟用軍官的加成
 */
export const calculateActiveBonuses = (officers: Record<OfficerType, Officer>, now: number) => {
  const bonuses = {
    buildingSpeedBonus: 0,
    researchSpeedBonus: 0,
    resourceProductionBonus: 0,
    darkMatterProductionBonus: 0,
    energyProductionBonus: 0,
    fleetSpeedBonus: 0,
    fuelConsumptionReduction: 0,
    defenseBonus: 0,
    additionalBuildQueue: 0,
    additionalFleetSlots: 0,
    storageCapacityBonus: 0
  }

  Object.values(officers).forEach(officer => {
    if (isOfficerActive(officer, now)) {
      const config = OFFICERS[officer.type]
      Object.entries(config.benefits).forEach(([key, value]) => {
        if (value !== undefined) {
          bonuses[key as keyof typeof bonuses] += value
        }
      })
    }
  })

  return bonuses
}

/**
 * MAJ-7：當前提供能源產出加成的軍官中最早的到期時間（毫秒）。
 * 沒有「會到期」的能源軍官時返回 undefined，視為加成穩定。
 * （到期後加成只是部分下降也按整體歸零處理：保守方向，只會更謹慎，不會更危險。）
 */
export const getEnergyBonusExpiresAt = (
  officers: Record<OfficerType, Officer>,
  now: number
): number | undefined => {
  let earliest: number | undefined
  for (const officer of Object.values(officers)) {
    if (!isOfficerActive(officer, now)) continue
    const benefits = OFFICERS[officer.type]?.benefits
    const epb = benefits?.energyProductionBonus
    if (!(epb !== undefined && epb > 0)) continue
    if (officer.expiresAt === undefined) continue
    if (earliest === undefined || officer.expiresAt < earliest) earliest = officer.expiresAt
  }
  return earliest
}

export const getStorageBonusExpiresAt = (
  officers: Record<OfficerType, Officer>, now: number
): number | undefined => {
  const expirations = Object.values(officers)
    .filter(officer => isOfficerActive(officer, now) && (OFFICERS[officer.type]?.benefits.storageCapacityBonus ?? 0) > 0)
    .flatMap(officer => officer.expiresAt === undefined ? [] : [officer.expiresAt])
  return expirations.length > 0 ? Math.min(...expirations) : undefined
}

/**
 * 檢查並停用過期的軍官
 */
export const checkAndDeactivateExpiredOfficers = (officers: Record<OfficerType, Officer>, now: number): void => {
  Object.values(officers).forEach(officer => {
    if (officer.active && officer.expiresAt && officer.expiresAt <= now) {
      officer.active = false
    }
  })
}
