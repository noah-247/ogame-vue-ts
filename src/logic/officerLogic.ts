import { getGameNow } from './gameTime'
import type { Officer, Resources } from '@/types/game'
import { OfficerType } from '@/types/game'
import { OFFICERS } from '@/config/gameConfig'

/**
 * 获取军官成本
 */
export const getOfficerCost = (officerType: OfficerType): Resources => {
  const config = OFFICERS[officerType]
  return config.cost
}

/**
 * 检查军官是否激活
 */
export const isOfficerActive = (officer: Officer, now: number): boolean => {
  return officer.active && (!officer.expiresAt || officer.expiresAt > now)
}

/**
 * 创建激活的军官
 */
export const createActiveOfficer = (officerType: OfficerType, duration: number): Officer => {
  const now = getGameNow()
  return {
    type: officerType,
    active: true,
    hiredAt: now,
    expiresAt: now + duration * 24 * 60 * 60 * 1000 // duration天后过期
  }
}

/**
 * 创建未激活的军官
 */
export const createInactiveOfficer = (officerType: OfficerType): Officer => {
  return {
    type: officerType,
    active: false
  }
}

/**
 * 续约军官
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
 * 计算所有激活军官的加成
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
 * MAJ-7：当前提供能源产出加成的军官中最早的到期时间（毫秒）。
 * 没有「会到期」的能源军官时返回 undefined，视为加成稳定。
 * （到期后加成只是部分下降也按整体归零处理：保守方向，只会更谨慎，不会更危险。）
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
 * 检查并停用过期的军官
 */
export const checkAndDeactivateExpiredOfficers = (officers: Record<OfficerType, Officer>, now: number): void => {
  Object.values(officers).forEach(officer => {
    if (officer.active && officer.expiresAt && officer.expiresAt <= now) {
      officer.active = false
    }
  })
}
