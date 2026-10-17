import { BuildingType } from '@/types/game'
import type { Planet } from '@/types/game'
import { BUILDINGS } from '@/config/gameConfig'
import { calculateBuildingTime } from './buildingLogic'
import { applyBlueprintToPlanet, createDefaultPlanetAutopilot, withdrawAutopilotWaiting } from './autopilotLogic'
import type { AutopilotBlueprintTarget, AutopilotContext } from './autopilotLogic'

export const shouldStartInMonitoring = (planet: Planet, context: AutopilotContext): boolean => {
  const config = planet.autopilot
  if (!config) return false
  const unfinished = config.targets.filter(target =>
    Number.isFinite(target.targetLevel) && target.targetLevel > (planet.buildings[target.buildingType] || 0))
  const candidates = unfinished.length
    ? unfinished.map(target => target.buildingType)
    : [BuildingType.MetalMine, BuildingType.CrystalMine, BuildingType.DeuteriumSynthesizer]
      .filter(building => (planet.buildings[building] || 0) > 0)
  const durations = [...new Set(candidates)].filter(building => {
    const definition = BUILDINGS[building]
    const level = planet.buildings[building] || 0
    return definition && !(planet.isMoon && definition.planetOnly) &&
      (definition.maxLevel === undefined || level < definition.maxLevel)
  }).map(building => calculateBuildingTime(building, (planet.buildings[building] || 0) + 1,
    context.buildSpeedBonus, planet.buildings[BuildingType.RoboticsFactory] || 0,
    planet.buildings[BuildingType.NaniteFactory] || 0))
  return durations.length > 0 && durations.filter(seconds => seconds > config.workHourThreshold).length > durations.length / 2
}

export const enablePlanetAutopilot = (planet: Planet, context: AutopilotContext, now: number): void => {
  const config = planet.autopilot ?? (planet.autopilot = createDefaultPlanetAutopilot())
  const firstEnable = config.firstEnabledAt === undefined && !config.enabled && config.lastPlannedAt === undefined
  if (firstEnable && shouldStartInMonitoring(planet, context)) {
    config.mode = 'monitor'
    config.downgradeReason = undefined
    config.canResumeAuto = false
    config.lastDecision = 'autopilot.decisionMonitoring'
    withdrawAutopilotWaiting(planet)
  }
  config.firstEnabledAt ??= now
  config.enabled = true
  config.paused = false
}

export const applyBlueprintAndEnablePlanet = (
  planet: Planet, blueprintId: string, context: AutopilotContext, now: number,
  filter?: (target: AutopilotBlueprintTarget) => boolean
): boolean => {
  const config = planet.autopilot ?? (planet.autopilot = createDefaultPlanetAutopilot())
  const wasEnabled = config.enabled
  if (!applyBlueprintToPlanet(config, blueprintId, now, filter)) return false
  config.enabled = wasEnabled
  enablePlanetAutopilot(planet, context, now)
  return true
}
