/**
 * 自动成长副官 · 目标清单引擎（方案 A 核心）
 *
 * 设计依据：~/workspace/ogame-report/自动成长副官-完整报告.md
 * （Codex 设计报告 + Opus 5.5 review，帕吉已拍板「照推荐组合开工」）
 *
 * 核心语义（方案 A「目标等级清单」）：
 * - 玩家（或蓝图预设）为每颗星球设定「建筑 → 目标等级」清单；副官负责
 *   目标持久化（B3）、递归前置展开（B4）、槽位排程、能源最坏顺序验证（B1）、
 *   资源预留、工时门槛与滞后降级（B8）。
 * - 「目标」是持续到完成的意图（B3）；「工作」是单级升级（current+1），
 *   通过既有等待队列 + 正式队列执行；副官排入的等待项带 source 标记（B11）。
 * - 研究授权在帝国层级（B6），不由各星球副官互抢研究槽。
 * - 每 tick 从实际等级重推目标进度（B12）。
 *
 * 副官永远不直接改建筑等级、不另写成本/工时/前置公式，
 * 一律沿用 buildingLogic / researchLogic / resourceLogic 的既有函数。
 */
import type {
  AutopilotMode,
  AutopilotPlanetConfig,
  AutopilotResearchTarget,
  AutopilotReserve,
  AutopilotTarget,
  BuildQueueItem,
  EmpireResearchAutopilot,
  Planet,
  Player,
  Resources,
  WaitingQueueItem
} from '@/types/game'
import { BuildingType, TechnologyType } from '@/types/game'
import { BUILDINGS, TECHNOLOGIES } from '@/config/gameConfig'
import * as buildingLogic from './buildingLogic'
import * as researchLogic from './researchLogic'
import * as resourceLogic from './resourceLogic'
import * as waitingQueueLogic from './waitingQueueLogic'
import * as publicLogic from './publicLogic'

// ---------------------------------------------------------------------------
// 常量与默认配置
// ---------------------------------------------------------------------------

/** 自主模式单级工时上限默认值：2 小时（秒） */
export const DEFAULT_WORK_HOUR_THRESHOLD = 7200
/** 滞后恢复阈值默认值：1.5 小时（秒）；低于此值才提示可恢复自主（B8） */
export const DEFAULT_RESUME_THRESHOLD = 5400
/** 工时门槛可选档位（秒）：2h / 4h / 8h */
export const WORK_HOUR_THRESHOLD_OPTIONS = [7200, 14400, 28800] as const
/** B5：空间预留默认值（格） */
export const DEFAULT_MIN_FREE_SPACE = 10

let autopilotIdCounter = 0
const nextAutopilotId = (prefix: string, now: number): string =>
  `${prefix}_${now}_${++autopilotIdCounter}`

export const createDefaultReserve = (): AutopilotReserve => ({ metal: 0, crystal: 0, deuterium: 0 })

export const createDefaultPlanetAutopilot = (): AutopilotPlanetConfig => ({
  enabled: false,
  mode: 'auto',
  paused: false,
  targets: [],
  reserve: createDefaultReserve(),
  workHourThreshold: DEFAULT_WORK_HOUR_THRESHOLD,
  resumeThreshold: DEFAULT_RESUME_THRESHOLD,
  allowPrereqAutoBuild: true,
  minFreeSpace: DEFAULT_MIN_FREE_SPACE
})

export const createDefaultEmpireResearchAutopilot = (): EmpireResearchAutopilot => ({
  enabled: false,
  mode: 'auto',
  paused: false,
  targets: [],
  reserve: createDefaultReserve(),
  workHourThreshold: DEFAULT_WORK_HOUR_THRESHOLD,
  resumeThreshold: DEFAULT_RESUME_THRESHOLD
})

export const createAutopilotTarget = (
  buildingType: BuildingType,
  targetLevel: number,
  priority: number,
  now: number = Date.now()
): AutopilotTarget => ({
  id: nextAutopilotId('apt', now),
  buildingType,
  targetLevel,
  priority
})

export const createAutopilotResearchTarget = (
  technology: TechnologyType,
  targetLevel: number,
  priority: number,
  now: number = Date.now()
): AutopilotResearchTarget => ({
  id: nextAutopilotId('apr', now),
  technology,
  targetLevel,
  priority
})

// ---------------------------------------------------------------------------
// 引擎上下文（由调用方从军官/游戏状态组装，保持引擎纯函数可测）
// ---------------------------------------------------------------------------

export interface AutopilotContext {
  /** 建筑速度加成百分比（军官等） */
  buildSpeedBonus: number
  /** 军官提供的额外建造槽 */
  additionalBuildQueue: number
  /** 能源产出加成百分比 */
  energyProductionBonus: number
  /** 能源加成最早到期时间（毫秒，缺省=稳定；MAJ-7） */
  energyBonusExpiresAt?: number
  /** 仓储加成百分比 */
  storageCapacityBonus: number
  /** 研究速度加成百分比 */
  researchSpeedBonus: number
}

export const createDefaultContext = (): AutopilotContext => ({
  buildSpeedBonus: 0,
  additionalBuildQueue: 0,
  energyProductionBonus: 0,
  storageCapacityBonus: 0,
  researchSpeedBonus: 0
})

// ---------------------------------------------------------------------------
// 步骤模型
// ---------------------------------------------------------------------------

export type AutopilotStepKind = 'target' | 'prereq' | 'energy' | 'warehouse'

export interface AutopilotBlocker {
  kind: 'technology' | 'building' | 'prereqDisabled'
  /** 缺失的前置类型 */
  itemType: BuildingType | TechnologyType
  /** 需要的等级 */
  level: number
  /** 人类可读原因 */
  reason: string
}

export interface AutopilotStep {
  buildingType: BuildingType
  /** 本次要建到的等级 = 当前+1（B3：等待项只执行+1，目标由规划层持有） */
  nextLevel: number
  /** 归属目标 id（energy/warehouse 步骤为 ''） */
  targetId: string
  /** 继承目标的优先级；能源/仓库救援为最高（-1） */
  priority: number
  kind: AutopilotStepKind
  cost: Resources
  /** 预估单级工时（秒） */
  buildTime: number
  /** 完工后能源产出增量（太阳能/聚变升级为正） */
  prodDelta: number
  /** 完工后能源消耗增量（矿场/设施升级为正） */
  consDelta: number
  /** 不可自动执行时的阻塞原因 */
  blockedBy?: AutopilotBlocker
}

export interface AutopilotTickResult<TTarget = AutopilotTarget> {
  /** 本 tick 新排入等待队列的步数 */
  enqueued: number
  /** 是否发生了自主→执行降级 */
  downgraded: boolean
  /** 完成的目标（达到目标等级） */
  completedTargets: TTarget[]
  /** 本 tick 遇到的阻塞原因（去重后） */
  blockers: AutopilotBlocker[]
  /** 人类可读的决策摘要 */
  decision: string
}

const emptyResult = (decision: string): AutopilotTickResult => ({
  enqueued: 0,
  downgraded: false,
  completedTargets: [],
  blockers: [],
  decision
})

// ---------------------------------------------------------------------------
// B12：从实际等级重推目标进度
// ---------------------------------------------------------------------------

/**
 * 对照星球实际等级，移除已达标的目标，返回完成清单。
 * 玩家拆除导致等级回落时，目标保持未完成（下次 tick 会重新规划）。
 */
export const reconcileTargets = (
  config: AutopilotPlanetConfig,
  planet: Planet
): AutopilotTarget[] => {
  const completed: AutopilotTarget[] = []
  config.targets = config.targets.filter(target => {
    const current = planet.buildings[target.buildingType] || 0
    // BLK-4 防御：非法目标等级（NaN/非正数）不判完成，留待 UI 修正
    if (!Number.isFinite(target.targetLevel) || target.targetLevel <= 0) return true
    if (current >= target.targetLevel) {
      completed.push(target)
      return false
    }
    return true
  })
  return completed
}

export const reconcileResearchTargets = (
  config: EmpireResearchAutopilot,
  technologies: Partial<Record<TechnologyType, number>>
): AutopilotResearchTarget[] => {
  const completed: AutopilotResearchTarget[] = []
  config.targets = config.targets.filter(target => {
    const current = technologies[target.technology] || 0
    // BLK-4 防御：非法目标等级不判完成，留待 UI 修正
    if (!Number.isFinite(target.targetLevel) || target.targetLevel <= 0) return true
    if (current >= target.targetLevel) {
      completed.push(target)
      return false
    }
    return true
  })
  return completed
}

// ---------------------------------------------------------------------------
// B4：递归前置展开
// ---------------------------------------------------------------------------

type RequirementMap = Partial<Record<BuildingType | TechnologyType, number>>

/** 合并基础 requirements + 所有 ≤ level 的 levelRequirements 门槛 */
const collectRequirements = (
  kind: 'building' | 'technology',
  key: BuildingType | TechnologyType,
  level: number
): RequirementMap => {
  const config = kind === 'building' ? BUILDINGS[key as BuildingType] : TECHNOLOGIES[key as TechnologyType]
  const merged: RequirementMap = { ...(config.requirements as RequirementMap | undefined) }
  const levelRequirements = config.levelRequirements as Record<number, RequirementMap> | undefined
  if (levelRequirements) {
    for (const threshold of Object.keys(levelRequirements).map(Number).filter(t => t <= level).sort((a, b) => a - b)) {
      Object.assign(merged, levelRequirements[threshold])
    }
  }
  return merged
}

const isBuildingKey = (key: string): key is BuildingType =>
  (Object.values(BuildingType) as string[]).includes(key)

export interface PrereqChainStep {
  buildingType: BuildingType
  /** 需要补到的等级（从当前+1 逐级列出，调用方取首个即下一步） */
  level: number
  /** 缺失的科技前置（副官不能自动研究，需帝国研究授权或玩家手动） */
  blockedByTech?: { technology: TechnologyType; level: number }
}

/**
 * 递归展开「把 buildingType 建到 requiredLevel」的完整前置链（B4）。
 * 返回按建造顺序排列的步骤（含自身各级的步骤，前置在前）。
 * - 科技前置不展开为建造步骤，标记为 blockedByTech（由帝国研究副官/玩家处理）。
 * - 月球跳过 planetOnly 前置（沿用 checkBuildingRequirements 的既有规则）。
 * - 环保护：同一建筑只展开到历史最高需求等级。
 */
export const expandPrerequisiteChain = (
  planet: Planet,
  technologies: Partial<Record<TechnologyType, number>>,
  buildingType: BuildingType,
  requiredLevel: number
): PrereqChainStep[] => {
  const steps: PrereqChainStep[] = []
  const seen = new Map<BuildingType, number>() // buildingType -> 已展开到的最高等级
  const emitted = new Set<string>() // `${type}:${level}` 去重

  const emit = (type: BuildingType, level: number, blockedByTech?: { technology: TechnologyType; level: number }) => {
    const key = `${type}:${level}`
    if (emitted.has(key)) return
    emitted.add(key)
    steps.push({ buildingType: type, level, blockedByTech })
  }

  const need = (type: BuildingType, level: number, depth: number): void => {
    // Minor-6：深度截断时告警，避免链静默缺段
    if (depth > 24) {
      console.warn(`[autopilot] prerequisite chain truncated at depth 24 for ${type}:${level}`)
      return
    }
    if (level <= 0) return
    const current = planet.buildings[type] || 0
    if (current >= level) return
    const alreadyPlanned = seen.get(type) || 0
    const fromLevel = Math.max(current, alreadyPlanned)
    if (fromLevel >= level) return
    seen.set(type, level)

    const config = BUILDINGS[type]
    for (let nextLevel = fromLevel + 1; nextLevel <= level; nextLevel++) {
      // maxLevel 保护
      if (config.maxLevel !== undefined && nextLevel > config.maxLevel) break
      const reqs = collectRequirements('building', type, nextLevel)
      let blockedByTech: { technology: TechnologyType; level: number } | undefined
      for (const [reqKey, reqLevel] of Object.entries(reqs)) {
        const needed = reqLevel as number
        if (isBuildingKey(reqKey)) {
          const reqBuilding = reqKey as BuildingType
          const reqConfig = BUILDINGS[reqBuilding]
          // 月球跳过星球专属前置（与 checkBuildingRequirements 一致）
          if (planet.isMoon && reqConfig?.planetOnly) continue
          need(reqBuilding, needed, depth + 1)
        } else {
          const tech = reqKey as TechnologyType
          if ((technologies[tech] || 0) < needed && !blockedByTech) {
            blockedByTech = { technology: tech, level: needed }
          }
        }
      }
      emit(type, nextLevel, blockedByTech)
    }
  }

  need(buildingType, requiredLevel, 0)
  return steps
}

/** 帝国研究前置递归展开（只展开科技链；建筑前置标记为阻塞） */
export const expandResearchPrerequisiteChain = (
  technologies: Partial<Record<TechnologyType, number>>,
  planetBuildings: Partial<Record<BuildingType, number>>,
  technology: TechnologyType,
  requiredLevel: number
): Array<{ technology: TechnologyType; level: number; blockedByBuilding?: { building: BuildingType; level: number } }> => {
  const steps: Array<{ technology: TechnologyType; level: number; blockedByBuilding?: { building: BuildingType; level: number } }> = []
  const seen = new Map<TechnologyType, number>()
  const emitted = new Set<string>()

  const need = (tech: TechnologyType, level: number, depth: number): void => {
    if (depth > 24 || level <= 0) return
    const current = technologies[tech] || 0
    if (current >= level) return
    const alreadyPlanned = seen.get(tech) || 0
    const fromLevel = Math.max(current, alreadyPlanned)
    if (fromLevel >= level) return
    seen.set(tech, level)

    const config = TECHNOLOGIES[tech]
    for (let nextLevel = fromLevel + 1; nextLevel <= level; nextLevel++) {
      if (config.maxLevel !== undefined && nextLevel > config.maxLevel) break
      const reqs = collectRequirements('technology', tech, nextLevel)
      let blockedByBuilding: { building: BuildingType; level: number } | undefined
      for (const [reqKey, reqLevel] of Object.entries(reqs)) {
        const needed = reqLevel as number
        if (isBuildingKey(reqKey)) {
          const building = reqKey as BuildingType
          if ((planetBuildings[building] || 0) < needed && !blockedByBuilding) {
            blockedByBuilding = { building, level: needed }
          }
        } else {
          need(reqKey as TechnologyType, needed, depth + 1)
        }
      }
      const key = `${tech}:${nextLevel}`
      if (!emitted.has(key)) {
        emitted.add(key)
        steps.push({ technology: tech, level: nextLevel, blockedByBuilding })
      }
    }
  }

  need(technology, requiredLevel, 0)
  return steps
}

// ---------------------------------------------------------------------------
// 能源：最坏完工顺序验证（B1）
// ---------------------------------------------------------------------------

export interface EnergyCheckResult {
  safe: boolean
  /** 最坏顺序下的最小能量余量（产出-消耗） */
  margin: number
  production: number
  consumption: number
}

const pendingEnergyDelta = (
  planet: Planet,
  item: Pick<BuildQueueItem, 'type' | 'itemType' | 'targetLevel'>,
  energyProductionBonus = 0
): { prodDelta: number; consDelta: number } => {
  const buildingType = item.itemType as BuildingType
  if (!isBuildingKey(item.itemType as string)) return { prodDelta: 0, consDelta: 0 }
  const config = BUILDINGS[buildingType]
  if (!config) return { prodDelta: 0, consDelta: 0 }
  const current = planet.buildings[buildingType] || 0
  const target = item.targetLevel ?? (item.type === 'demolish' ? Math.max(0, current - 1) : current + 1)
  const previous = item.type === 'demolish' ? target + 1 : Math.max(0, target - 1)
  const beforePlanet = { ...planet, buildings: { ...planet.buildings, [buildingType]: previous } } as Planet
  const hypothetical = { ...planet.buildings, [buildingType]: target }
  const probe = { ...planet, buildings: hypothetical } as Planet
  // 用完整公式算差值，避免手写分项公式漂移（Minor-1）
  const bonuses = { energyProductionBonus }
  const before = {
    prod: resourceLogic.calculateEnergyProduction(beforePlanet, bonuses),
    cons: resourceLogic.calculateEnergyConsumption(beforePlanet)
  }
  const after = {
    prod: resourceLogic.calculateEnergyProduction(probe, bonuses),
    cons: resourceLogic.calculateEnergyConsumption(probe)
  }
  return { prodDelta: after.prod - before.prod, consDelta: after.cons - before.cons }
}

/**
 * B1 能源验证：用「最坏完工顺序」检查待完工项。
 *
 * 原理：每个待完工项只改变 (prod, cons)。对手要让余量最小，
 * 会先完成所有「增耗/减产」的项、最后才完成「增产」的项。
 * 因此最坏顺序下的最小余量 = P0 - C0 - Σ增耗 - Σ减产，
 * 与具体顺序无关，一次 O(n) 即可精确判定。
 */
export const checkEnergySafeWorstOrder = (
  planet: Planet,
  energyProductionBonus: number,
  extraItems: Array<Pick<BuildQueueItem, 'type' | 'itemType' | 'targetLevel'>> = []
): EnergyCheckResult => {
  const bonuses = { energyProductionBonus }
  const production = resourceLogic.calculateEnergyProduction(planet, bonuses)
  const consumption = resourceLogic.calculateEnergyConsumption(planet)
  let consGain = 0
  let prodLoss = 0
  const pending = new Set<Pick<BuildQueueItem, 'type' | 'itemType' | 'targetLevel'>>([
    ...planet.buildQueue.filter(i => i.type === 'building' || i.type === 'demolish'),
    ...(planet.waitingBuildQueue || []).filter(i => i.type === 'building' || i.type === 'demolish'),
    ...extraItems
  ])
  for (const item of pending) {
    const { prodDelta, consDelta } = pendingEnergyDelta(planet, item, energyProductionBonus)
    if (consDelta > 0) consGain += consDelta
    if (prodDelta < 0) prodLoss += -prodDelta
  }
  const margin = production - consumption - consGain - prodLoss
  return { safe: margin >= 0, margin, production, consumption }
}

// ---------------------------------------------------------------------------
// 步骤规划：目标 → 前置链 → 单级步骤
// ---------------------------------------------------------------------------

/** 为一步计算成本/工时/能源增量 */
const toStep = (
  planet: Planet,
  buildingType: BuildingType,
  nextLevel: number,
  targetId: string,
  priority: number,
  kind: AutopilotStepKind,
  ctx: AutopilotContext,
  blockedBy?: AutopilotBlocker
): AutopilotStep => {
  const robotics = planet.buildings[BuildingType.RoboticsFactory] || 0
  const nanite = planet.buildings[BuildingType.NaniteFactory] || 0
  const buildTime = buildingLogic.calculateBuildingTime(buildingType, nextLevel, ctx.buildSpeedBonus, robotics, nanite)
  const { prodDelta, consDelta } = pendingEnergyDelta(planet, { type: 'building', itemType: buildingType, targetLevel: nextLevel }, ctx.energyProductionBonus)
  return {
    buildingType,
    nextLevel,
    targetId,
    priority,
    kind,
    cost: buildingLogic.calculateBuildingCost(buildingType, nextLevel),
    buildTime,
    prodDelta,
    consDelta,
    blockedBy
  }
}

/**
 * 为单个目标生成有序步骤：递归前置在前，目标自身的下一步在后。
 * allowPrereqAutoBuild=false 时，前置缺失 → 整个目标标记阻塞，不自动补。
 */
export const planTargetSteps = (
  planet: Planet,
  technologies: Partial<Record<TechnologyType, number>>,
  target: AutopilotTarget,
  ctx: AutopilotContext,
  allowPrereqAutoBuild: boolean
): AutopilotStep[] => {
  const current = planet.buildings[target.buildingType] || 0
  if (current >= target.targetLevel) return []
  const chain = expandPrerequisiteChain(planet, technologies, target.buildingType, target.targetLevel)
  const steps: AutopilotStep[] = []
  for (const link of chain) {
    const linkCurrent = planet.buildings[link.buildingType] || 0
    // 只取每条链的下一步（current+1）；更远的等级等本级完成后再规划
    if (link.level !== linkCurrent + 1) continue
    const isTargetStep = link.buildingType === target.buildingType
    const kind: AutopilotStepKind = isTargetStep ? 'target' : 'prereq'
    if (!isTargetStep && !allowPrereqAutoBuild) {
      steps.push(toStep(planet, link.buildingType, link.level, target.id, target.priority, kind, ctx, {
        kind: 'prereqDisabled',
        itemType: link.buildingType,
        level: link.level,
        reason: 'autopilot.blockedPrereqDisabled'
      }))
      continue
    }
    const blockedBy: AutopilotBlocker | undefined = link.blockedByTech
      ? { kind: 'technology', itemType: link.blockedByTech.technology, level: link.blockedByTech.level, reason: 'autopilot.blockedByTech' }
      : undefined
    // 月球不兼容检查
    const config = BUILDINGS[link.buildingType]
    const moonBlocked: AutopilotBlocker | undefined =
      planet.isMoon && config.planetOnly
        ? { kind: 'building', itemType: link.buildingType, level: link.level, reason: 'autopilot.blockedMoonIncompatible' }
        : undefined
    steps.push(toStep(planet, link.buildingType, link.level, target.id, target.priority, kind, ctx, blockedBy ?? moonBlocked))
  }
  return steps
}

/** 所有目标的步骤合并：按目标优先级排序，同优先级工时最长的先排（关键路径） */
export const planAllSteps = (
  planet: Planet,
  technologies: Partial<Record<TechnologyType, number>>,
  config: AutopilotPlanetConfig,
  ctx: AutopilotContext
): AutopilotStep[] => {
  const ordered = [...config.targets].sort((a, b) => a.priority - b.priority || a.targetLevel - b.targetLevel)
  const merged: AutopilotStep[] = []
  const seen = new Set<string>()
  for (const target of ordered) {
    for (const step of planTargetSteps(planet, technologies, target, ctx, config.allowPrereqAutoBuild)) {
      const key = `${step.buildingType}:${step.nextLevel}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(step)
    }
  }
  // 同一 priority 内按工时降序（关键路径最长先排），不同 priority 保持目标顺序
  const byPriority = new Map<number, AutopilotStep[]>()
  for (const step of merged) {
    const list = byPriority.get(step.priority) ?? []
    list.push(step)
    byPriority.set(step.priority, list)
  }
  return [...byPriority.keys()]
    .sort((a, b) => a - b)
    .flatMap(priority => byPriority.get(priority)!.sort((a, b) => b.buildTime - a.buildTime))
}

// ---------------------------------------------------------------------------
// 能源救援 / 仓库救援
// ---------------------------------------------------------------------------

const ENERGY_PRODUCERS = [BuildingType.SolarPlant, BuildingType.FusionReactor] as const
const WAREHOUSES: Record<'metal' | 'crystal' | 'deuterium', BuildingType> = {
  metal: BuildingType.MetalStorage,
  crystal: BuildingType.CrystalStorage,
  deuterium: BuildingType.DeuteriumTank
}

/** 规划能源救援步骤：选产出增量最大的可行能源建筑下一步 */
export const planEnergyRescue = (
  planet: Planet,
  technologies: Partial<Record<TechnologyType, number>>,
  ctx: AutopilotContext
): AutopilotStep | null => {
  let best: AutopilotStep | null = null
  for (const producer of ENERGY_PRODUCERS) {
    const current = planet.buildings[producer] || 0
    const config = BUILDINGS[producer]
    if (config.maxLevel !== undefined && current + 1 > config.maxLevel) continue
    if (planet.isMoon && config.planetOnly) continue
    if (!buildingLogic.checkBuildingRequirements(producer, planet, technologies, current + 1)) continue
    if (!buildingLogic.checkSpaceAvailable(planet, producer)) continue
    const step = toStep(planet, producer, current + 1, '', -1, 'energy', ctx)
    if (step.prodDelta <= 0) continue
    if (!best || step.prodDelta > best.prodDelta) best = step
  }
  return best
}

/**
 * 规划仓库救援：若某步费用超过当前容量，返回对应仓库的下一步。
 * 仓库等级目标 = 刚好装下该笔费用的最小等级。
 */
export const planWarehouseRescue = (
  planet: Planet,
  cost: Resources,
  storageCapacityBonus: number,
  ctx: AutopilotContext
): AutopilotStep | null => {
  const capacity = resourceLogic.calculateResourceCapacity(planet, storageCapacityBonus)
  for (const key of ['metal', 'crystal', 'deuterium'] as const) {
    if (cost[key] <= capacity[key]) continue
    const warehouse = WAREHOUSES[key]
    const current = planet.buildings[warehouse] || 0
    const config = BUILDINGS[warehouse]
    if (config.maxLevel !== undefined && current + 1 > config.maxLevel) return null
    // 找装下费用的最小仓库等级（上限 +12 级，避免无穷循环）
    for (let level = current + 1; level <= current + 12; level++) {
      const probe = { ...planet, buildings: { ...planet.buildings, [warehouse]: level } } as Planet
      const cap = resourceLogic.calculateResourceCapacity(probe, storageCapacityBonus)
      if (cap[key] >= cost[key]) {
        if (!buildingLogic.checkBuildingRequirements(warehouse, planet, {}, level)) return null
        if (!buildingLogic.checkSpaceAvailable(planet, warehouse)) return null
        return toStep(planet, warehouse, current + 1, '', -1, 'warehouse', ctx)
      }
    }
    return null
  }
  return null
}

/** 检查科技在目标等级的前置（含等级门槛；既有 checkTechnologyRequirements 只查基础前置） */
export const checkResearchLevelRequirements = (
  techType: TechnologyType,
  buildings: Partial<Record<BuildingType, number>>,
  technologies: Partial<Record<TechnologyType, number>>,
  nextLevel: number
): boolean => {
  const reqs = collectRequirements('technology', techType, nextLevel)
  for (const [key, reqLevel] of Object.entries(reqs)) {
    const needed = reqLevel as number
    if (isBuildingKey(key)) {
      if ((buildings[key as BuildingType] || 0) < needed) return false
    } else if ((technologies[key as TechnologyType] || 0) < needed) {
      return false
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// 主 tick：单星球
// ---------------------------------------------------------------------------

/** 该建筑是否已有在途工作（正式队列）或等待项（任何来源：玩家优先） */
const isBuildingBusy = (planet: Planet, buildingType: BuildingType): boolean => {
  if (planet.buildQueue.some(i => (i.type === 'building' || i.type === 'demolish') && i.itemType === buildingType)) return true
  if (planet.waitingBuildQueue.some(i => (i.type === 'building' || i.type === 'demolish') && i.itemType === buildingType)) return true
  return false
}

const hasResourcesAfterReserve = (available: Resources, reserve: AutopilotReserve, cost: Resources): boolean =>
  available.metal - reserve.metal >= cost.metal &&
  available.crystal - reserve.crystal >= cost.crystal &&
  available.deuterium - reserve.deuterium >= cost.deuterium &&
  available.darkMatter >= cost.darkMatter

/**
 * MAJ-1：清理过期的副官等待项。
 * 副官排入等待后，若玩家手动先把该建筑建到目标等级（或更高），等待项转正时会判
 * levelAlreadyReached 且不移除，永久卡住队列、虚增 B7 槽位计数、挡住该建筑后续规划。
 * 每 tick 在重推目标后执行，只移除已过期（targetLevel <= 当前等级）的副官建筑等待项。
 */
export const pruneAutopilotWaiting = (planet: Planet): number => {
  const before = planet.waitingBuildQueue.length
  planet.waitingBuildQueue = planet.waitingBuildQueue.filter(item => {
    if (item.source !== 'autopilot' || item.type !== 'building') return true
    const cur = planet.buildings[item.itemType as BuildingType] || 0
    return (item.targetLevel ?? cur + 1) > cur
  })
  return before - planet.waitingBuildQueue.length
}

/**
 * MAJ-6：撤回副官的建筑等待项（接管/删除目标时调用）。
 * 不传 targetId 则撤回该星球全部副官建筑等待项；传 targetId 只撤回归属该目标的项。
 * 已开工（正式队列）的项不受影响。
 */
export const withdrawAutopilotWaiting = (planet: Planet, targetId?: string): number => {
  const before = planet.waitingBuildQueue.length
  planet.waitingBuildQueue = planet.waitingBuildQueue.filter(item => {
    if (item.source !== 'autopilot' || item.type !== 'building') return true
    if (targetId !== undefined && item.targetId !== targetId) return true
    return false
  })
  return before - planet.waitingBuildQueue.length
}

/** MAJ-1（研究）：清理过期的副官研究等待项 */
export const pruneAutopilotResearchWaiting = (player: Player): number => {
  const before = player.waitingResearchQueue.length
  player.waitingResearchQueue = player.waitingResearchQueue.filter(item => {
    if (item.source !== 'autopilot' || item.type !== 'technology') return true
    const cur = player.technologies[item.itemType as TechnologyType] || 0
    return (item.targetLevel ?? cur + 1) > cur
  })
  return before - player.waitingResearchQueue.length
}

/** MAJ-6（研究）：撤回副官的研究等待项 */
export const withdrawAutopilotResearchWaiting = (player: Player, targetId?: string): number => {
  const before = player.waitingResearchQueue.length
  player.waitingResearchQueue = player.waitingResearchQueue.filter(item => {
    if (item.source !== 'autopilot' || item.type !== 'technology') return true
    if (targetId !== undefined && item.targetId !== targetId) return true
    return false
  })
  return before - player.waitingResearchQueue.length
}

const subtractCost = (resources: Resources, cost: Resources): Resources => ({
  metal: resources.metal - cost.metal,
  crystal: resources.crystal - cost.crystal,
  deuterium: resources.deuterium - cost.deuterium,
  darkMatter: resources.darkMatter - cost.darkMatter,
  energy: resources.energy
})

const pushBlocker = (blockers: AutopilotBlocker[], blocker: AutopilotBlocker): void => {
  if (!blockers.some(b => b.kind === blocker.kind && b.itemType === blocker.itemType && b.level === blocker.level)) {
    blockers.push(blocker)
  }
}

/**
 * 单星球副官 tick。在线每秒调用（由 App.vue 的 updateGameAt 驱动），
 * 快转时同样经过 updateGameAt。离线返回时只做资源结算（B2），副官不追补。
 */
export const tickAutopilotPlanet = (
  player: Player,
  planet: Planet,
  now: number,
  ctx: AutopilotContext
): AutopilotTickResult => {
  const config = planet.autopilot
  if (!config || !config.enabled || config.paused) {
    // Minor-4：停用/暂停时清理滞后恢复标记，避免 UI 显示过期状态
    if (config) config.canResumeAuto = false
    return emptyResult('autopilot.decisionDisabled')
  }

  // B12：每 tick 从实际等级重推目标进度
  const completedTargets = reconcileTargets(config, planet)

  // MAJ-1：清理过期的副官等待项（玩家手动先建好导致 targetLevel <= 当前等级），
  // 避免 levelAlreadyReached 的死项永久占槽
  pruneAutopilotWaiting(planet)

  const technologies = player.technologies
  const steps = planAllSteps(planet, technologies, config, ctx)
  const blockers: AutopilotBlocker[] = []
  let enqueued = 0
  let downgraded = false

  // B7：副官永远给玩家留一个建造槽
  // MAJ-2：只计建筑槽位项（building/demolish），舰船/防御/拆船不占建筑槽
  const capacity = publicLogic.getMaxBuildQueue(planet, ctx.additionalBuildQueue)
  const isBuildSlotItem = (i: { type: string }): boolean => i.type === 'building' || i.type === 'demolish'
  const autopilotPending = (): number =>
    planet.buildQueue.filter(isBuildSlotItem).length +
    planet.waitingBuildQueue.filter(i => i.source === 'autopilot' && isBuildSlotItem(i)).length
  const maxAutopilotPending = Math.max(0, capacity - 1)

  // 规划用资源快照：逐笔模拟扣款，避免等待队列超发（等待项开工时才真扣款）
  let planningResources: Resources = { ...planet.resources }

  const enqueueStep = (step: AutopilotStep): boolean => {
    if (isBuildingBusy(planet, step.buildingType)) return false
    if (autopilotPending() >= maxAutopilotPending) {
      pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedNoSlot' })
      return false
    }
    const check = waitingQueueLogic.canAddToBuildWaitingQueue(planet, {
      id: '', type: 'building', itemType: step.buildingType, targetLevel: step.nextLevel,
      priority: step.priority, addedTime: now, planetId: planet.id, source: 'autopilot'
    } as WaitingQueueItem, player.officers)
    if (!check.canAdd) {
      pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedWaitingFull' })
      return false
    }
    // B5：空间预留
    const usedSpace = buildingLogic.calculateUsedSpace(planet)
    const spaceUsage = BUILDINGS[step.buildingType].spaceUsage
    if (usedSpace + spaceUsage > planet.maxSpace - config.minFreeSpace) {
      pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedNoSpace' })
      return false
    }
    const item: WaitingQueueItem = {
      id: nextAutopilotId('apw', now),
      type: 'building',
      itemType: step.buildingType,
      targetLevel: step.nextLevel,
      priority: step.priority,
      addedTime: now,
      planetId: planet.id,
      source: 'autopilot', // B11
      targetId: step.targetId || undefined // MAJ-1/MAJ-6：目标归属，用于精准撤回
    }
    waitingQueueLogic.addToBuildWaitingQueue(planet, item)
    planningResources = subtractCost(planningResources, step.cost)
    enqueued++
    return true
  }

  /** 尝试排入一步：依次做阻塞检查 → 工时门槛 → 资源/仓库/能源检查 */
  const tryEnqueue = (step: AutopilotStep): 'enqueued' | 'blocked' | 'downgraded' => {
    if (step.blockedBy) {
      pushBlocker(blockers, step.blockedBy)
      return 'blocked'
    }
    if (isBuildingBusy(planet, step.buildingType)) return 'blocked'
    // 前置满足检查（含等级门槛）：不满足则本 tick 跳过，等前置链先完成
    if (!buildingLogic.checkBuildingRequirements(step.buildingType, planet, technologies, step.nextLevel)) {
      pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedPrereq' })
      return 'blocked'
    }
    // 自主模式工时门槛（B8）：超限 → 降级为执行模式，停止自主挑步。
    // MAJ-4：只对「真要排入」的步骤做降级判定；被科技/前置挡住、或玩家手动在建的长工时步骤不触发降级。
    if (config.mode === 'auto' && step.buildTime > config.workHourThreshold) {
      config.mode = 'execute'
      config.downgradeReason = 'autopilot.downgradeWorkTime'
      config.canResumeAuto = false
      downgraded = true
      return 'downgraded'
    }
    // 仓库救援：费用超过容量先扩仓库
    const warehouseStep = planWarehouseRescue(planet, step.cost, ctx.storageCapacityBonus, ctx)
    if (warehouseStep) {
      // BLK-3：仓库本身已在途（等待/在建）时不再重复排入，否则同一 targetLevel 的
      // 重复项转正后判 levelAlreadyReached 且不移除，永久卡住等待队列
      if (isBuildingBusy(planet, warehouseStep.buildingType)) {
        pushBlocker(blockers, { kind: 'building', itemType: warehouseStep.buildingType, level: warehouseStep.nextLevel, reason: 'autopilot.blockedWaitingWarehouse' })
        return 'blocked'
      }
      if (config.mode === 'auto' && warehouseStep.buildTime > config.workHourThreshold) {
        config.mode = 'execute'
        config.downgradeReason = 'autopilot.downgradeWorkTime'
        config.canResumeAuto = false
        downgraded = true
        return 'downgraded'
      }
      if (!hasResourcesAfterReserve(planningResources, config.reserve, warehouseStep.cost)) {
        pushBlocker(blockers, { kind: 'building', itemType: warehouseStep.buildingType, level: warehouseStep.nextLevel, reason: 'autopilot.blockedNoResource' })
        return 'blocked'
      }
      return enqueueStep(warehouseStep) ? 'enqueued' : 'blocked'
    }
    // 资源检查（含预留）
    if (!hasResourcesAfterReserve(planningResources, config.reserve, step.cost)) {
      pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedNoResource' })
      return 'blocked'
    }
    // B1：最坏完工顺序能源验证（含本步）
    // MAJ-7：若能源加成军官在待完工项最晚完工前到期，验证按无加成计算（保守）
    const energyHorizon = Math.max(
      now,
      ...planet.buildQueue
        .filter(i => i.type === 'building' || i.type === 'demolish')
        .map(i => i.endTime || 0)
    )
    const energyBonus =
      ctx.energyBonusExpiresAt !== undefined && ctx.energyBonusExpiresAt < energyHorizon
        ? 0
        : ctx.energyProductionBonus
    const energyCheck = checkEnergySafeWorstOrder(planet, energyBonus, [{ type: 'building', itemType: step.buildingType, targetLevel: step.nextLevel }])
    if (!energyCheck.safe) {
      const rescue = planEnergyRescue(planet, technologies, ctx)
      // Minor-2：救援步骤同样受自主模式工时门槛约束；排入失败不再记「已救援」
      if (rescue &&
          !(config.mode === 'auto' && rescue.buildTime > config.workHourThreshold) &&
          hasResourcesAfterReserve(planningResources, config.reserve, rescue.cost) &&
          enqueueStep(rescue)) {
        pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedEnergyRescue' })
      } else {
        pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedEnergy' })
      }
      return 'blocked'
    }
    return enqueueStep(step) ? 'enqueued' : 'blocked'
  }

  let decision = ''
  for (const step of steps) {
    const outcome = tryEnqueue(step)
    if (outcome === 'downgraded') {
      decision = 'autopilot.decisionDowngraded'
      break
    }
    // blocked/enqueued 都继续尝试后续步骤（低优先级不饿死，但受预留约束）
  }

  // B8 滞后恢复判定：执行模式下，若所有剩余步骤工时 < resumeThreshold，提示可恢复
  // MAJ-4：排除在建/等待中的步骤（玩家手动在建的长工时项不应挡住恢复）；
  // 若目标未完成但无可规划步骤（全在途），恢复自主同样安全
  if (config.mode === 'execute') {
    const remaining = planAllSteps(planet, technologies, config, ctx)
      .filter(s => !s.blockedBy && !isBuildingBusy(planet, s.buildingType))
    config.canResumeAuto = config.targets.length > 0 && remaining.every(s => s.buildTime < config.resumeThreshold)
  } else {
    config.canResumeAuto = false
  }

  config.lastPlannedAt = now
  if (!decision) {
    if (enqueued > 0) decision = 'autopilot.decisionEnqueued'
    else if (completedTargets.length > 0) decision = 'autopilot.decisionCompleted'
    else if (blockers.length > 0) decision = 'autopilot.decisionBlocked'
    else decision = 'autopilot.decisionIdle'
  }
  config.lastDecision = decision

  return { enqueued, downgraded, completedTargets, blockers, decision }
}

/** 玩家确认后从执行模式恢复自主模式（B6/B8：恢复必须玩家确认；星球与帝国研究共用） */
export const resumeAutoMode = (
  config: Pick<AutopilotPlanetConfig, 'mode' | 'canResumeAuto' | 'downgradeReason' | 'lastDecision'>
): boolean => {
  if (config.mode !== 'execute' || !config.canResumeAuto) return false
  config.mode = 'auto'
  config.downgradeReason = undefined
  config.canResumeAuto = false
  config.lastDecision = 'autopilot.decisionResumed'
  return true
}

/** 切换自主/执行模式（玩家手动） */
export const setAutopilotMode = (config: AutopilotPlanetConfig, mode: AutopilotMode): void => {
  config.mode = mode
  if (mode === 'auto') {
    config.downgradeReason = undefined
    config.canResumeAuto = false
  }
}

// ---------------------------------------------------------------------------
// 帝国层级研究 tick（B6）
// ---------------------------------------------------------------------------

export interface ResearchStep {
  technology: TechnologyType
  nextLevel: number
  targetId: string
  priority: number
  cost: Resources
  researchTime: number
  blockedByBuilding?: { building: BuildingType; level: number }
}

/** 选择研究用星球：沿用既有规则——第一颗有研究室的星球 */
export const selectResearchPlanet = (player: Player): Planet | undefined =>
  player.planets.find(p => (p.buildings[BuildingType.ResearchLab] || 0) > 0)

export const planResearchSteps = (
  player: Player,
  config: EmpireResearchAutopilot,
  ctx: AutopilotContext
): ResearchStep[] => {
  const labPlanet = selectResearchPlanet(player)
  const labLevel = labPlanet ? labPlanet.buildings[BuildingType.ResearchLab] || 0 : 0
  const energyTech = player.technologies[TechnologyType.EnergyTechnology] || 0
  const university = labPlanet ? labPlanet.buildings[BuildingType.University] || 0 : 0
  const ordered = [...config.targets].sort((a, b) => a.priority - b.priority)
  const steps: ResearchStep[] = []
  const seen = new Set<string>()
  for (const target of ordered) {
    const current = player.technologies[target.technology] || 0
    if (current >= target.targetLevel) continue
    const chain = expandResearchPrerequisiteChain(player.technologies, labPlanet?.buildings ?? {}, target.technology, target.targetLevel)
    for (const link of chain) {
      const linkCurrent = player.technologies[link.technology] || 0
      if (link.level !== linkCurrent + 1) continue
      const key = `${link.technology}:${link.level}`
      if (seen.has(key)) continue
      seen.add(key)
      const techConfig = TECHNOLOGIES[link.technology]
      if (techConfig.maxLevel !== undefined && link.level > techConfig.maxLevel) continue
      steps.push({
        technology: link.technology,
        nextLevel: link.level,
        targetId: target.id,
        priority: target.priority,
        cost: researchLogic.calculateTechnologyCost(link.technology, link.level),
        researchTime: researchLogic.calculateTechnologyTime(link.technology, linkCurrent, ctx.researchSpeedBonus, labLevel, energyTech, 1, university),
        blockedByBuilding: link.blockedByBuilding
      })
    }
  }
  return steps.sort((a, b) => a.priority - b.priority || b.researchTime - a.researchTime)
}

export interface EmpireResearchTickResult extends AutopilotTickResult<AutopilotResearchTarget> {}

/**
 * 帝国研究副官 tick：研究授权在帝国层级（B6），各星球副官永不排研究。
 * 占用研究等待队列，但永远给玩家留一个研究槽。
 */
export const tickEmpireResearch = (
  player: Player,
  now: number,
  ctx: AutopilotContext
): EmpireResearchTickResult => {
  const config = player.empireResearchAutopilot
  if (!config || !config.enabled || config.paused) {
    // Minor-4：停用/暂停时清理滞后恢复标记，避免 UI 显示过期状态
    if (config) config.canResumeAuto = false
    return { ...emptyResult('autopilot.decisionDisabled'), completedTargets: [] }
  }
  if (!selectResearchPlanet(player)) {
    return {
      ...emptyResult('autopilot.decisionBlocked'),
      completedTargets: [],
      blockers: [{ kind: 'building', itemType: BuildingType.ResearchLab, level: 1, reason: 'autopilot.blockedNoLab' }]
    }
  }

  const completedTargets = reconcileResearchTargets(config, player.technologies)

  // MAJ-1：清理过期的副官研究等待项
  pruneAutopilotResearchWaiting(player)

  const steps = planResearchSteps(player, config, ctx)
  const blockers: AutopilotBlocker[] = []
  let enqueued = 0
  let downgraded = false

  const capacity = publicLogic.getMaxResearchQueue(player.technologies)
  const autopilotPending = (): number =>
    player.researchQueue.length + player.waitingResearchQueue.filter(i => i.source === 'autopilot').length
  const maxAutopilotPending = Math.max(0, capacity - 1)

  // 帝国研究预留从玩家...研究没有星球资源概念：预留约束研究排队时的资源占用。
  // 简化：检查第一颗有研究室星球的资源（既有研究等待项同样在此星球扣款）。
  const labPlanet = selectResearchPlanet(player)!
  let planningResources: Resources = { ...labPlanet.resources }

  /** 该科技是否已有在途研究（研究队列/等待队列，任何来源） */
  const isResearchBusy = (technology: TechnologyType): boolean =>
    player.researchQueue.some(i => i.type === 'technology' && i.itemType === technology) ||
    player.waitingResearchQueue.some(i => i.type === 'technology' && i.itemType === technology)

  let decision = ''
  for (const step of steps) {
    if (autopilotPending() >= maxAutopilotPending) {
      pushBlocker(blockers, { kind: 'technology', itemType: step.technology, level: step.nextLevel, reason: 'autopilot.blockedNoSlot' })
      break
    }
    if (step.blockedByBuilding) {
      pushBlocker(blockers, {
        kind: 'building',
        itemType: step.blockedByBuilding.building,
        level: step.blockedByBuilding.level,
        reason: 'autopilot.blockedByBuilding'
      })
      continue
    }
    // 去重：同一科技已在研究队列/等待队列（任何来源）则跳过
    if (isResearchBusy(step.technology)) continue
    // 前置满足检查（含等级门槛）
    if (!checkResearchLevelRequirements(step.technology, labPlanet.buildings, player.technologies, step.nextLevel)) {
      pushBlocker(blockers, { kind: 'technology', itemType: step.technology, level: step.nextLevel, reason: 'autopilot.blockedPrereq' })
      continue
    }
    // 自主模式工时门槛（B8）：研究同样适用，超限降级为执行模式。
    // MAJ-4：只对「真要排入」的步骤做降级判定，被挡住/在建的长工时步骤不触发。
    if (config.mode === 'auto' && step.researchTime > config.workHourThreshold) {
      config.mode = 'execute'
      config.downgradeReason = 'autopilot.downgradeWorkTime'
      config.canResumeAuto = false
      downgraded = true
      decision = 'autopilot.decisionDowngraded'
      break
    }
    // 资源检查（含预留），在研究星球的资源快照上模拟扣款
    if (!hasResourcesAfterReserve(planningResources, config.reserve, step.cost)) {
      pushBlocker(blockers, { kind: 'technology', itemType: step.technology, level: step.nextLevel, reason: 'autopilot.blockedNoResource' })
      continue
    }
    const check = waitingQueueLogic.canAddToResearchWaitingQueue(player, {
      id: '', type: 'technology', itemType: step.technology, targetLevel: step.nextLevel,
      priority: step.priority, addedTime: now, source: 'autopilot'
    } as WaitingQueueItem)
    if (!check.canAdd) {
      pushBlocker(blockers, { kind: 'technology', itemType: step.technology, level: step.nextLevel, reason: 'autopilot.blockedWaitingFull' })
      continue
    }
    const item: WaitingQueueItem = {
      id: nextAutopilotId('aprw', now),
      type: 'technology',
      itemType: step.technology,
      targetLevel: step.nextLevel,
      priority: step.priority,
      addedTime: now,
      source: 'autopilot', // B11
      targetId: step.targetId || undefined // MAJ-1/MAJ-6：目标归属
    }
    waitingQueueLogic.addToResearchWaitingQueue(player, item)
    planningResources = subtractCost(planningResources, step.cost)
    enqueued++
  }

  // B8 滞后恢复判定
  // MAJ-4：排除在建/等待中的步骤，玩家手动在建的长工时研究不应挡住恢复
  if (config.mode === 'execute') {
    const remaining = planResearchSteps(player, config, ctx)
      .filter(s => !s.blockedByBuilding && !isResearchBusy(s.technology))
    config.canResumeAuto = config.targets.length > 0 && remaining.every(s => s.researchTime < config.resumeThreshold)
  } else {
    config.canResumeAuto = false
  }

  config.lastPlannedAt = now
  if (!decision) {
    if (enqueued > 0) decision = 'autopilot.decisionEnqueued'
    else if (completedTargets.length > 0) decision = 'autopilot.decisionCompleted'
    else if (blockers.length > 0) decision = 'autopilot.decisionBlocked'
    else decision = 'autopilot.decisionIdle'
  }
  config.lastDecision = decision
  return { enqueued, downgraded, completedTargets, blockers, decision }
}

// ---------------------------------------------------------------------------
// 蓝图预设（M1 首版两套；蓝图 = 目标清单的预设组合，方案 A）
// 开局骨架按 Opus 修正：太阳能 1 → 三矿各 1（三槽并行）→ 重氢优先 2→3～4 →
// 三矿到 2 后重氢一够立刻工厂 1、2 → 关键路径最长先排。
// ---------------------------------------------------------------------------

export interface AutopilotBlueprintTarget {
  buildingType: BuildingType
  targetLevel: number
  priority: number
}

export interface AutopilotBlueprint {
  id: string
  nameKey: string
  descKey: string
  targets: AutopilotBlueprintTarget[]
}

export const AUTOPILOT_BLUEPRINTS: AutopilotBlueprint[] = [
  {
    id: 'economy',
    nameKey: 'autopilot.blueprints.economy.name',
    descKey: 'autopilot.blueprints.economy.desc',
    targets: [
      { buildingType: BuildingType.SolarPlant, targetLevel: 6, priority: 0 },
      { buildingType: BuildingType.MetalMine, targetLevel: 12, priority: 1 },
      { buildingType: BuildingType.CrystalMine, targetLevel: 10, priority: 2 },
      { buildingType: BuildingType.DeuteriumSynthesizer, targetLevel: 6, priority: 3 },
      { buildingType: BuildingType.RoboticsFactory, targetLevel: 4, priority: 4 },
      { buildingType: BuildingType.MetalStorage, targetLevel: 3, priority: 5 },
      { buildingType: BuildingType.CrystalStorage, targetLevel: 3, priority: 5 },
      { buildingType: BuildingType.DeuteriumTank, targetLevel: 2, priority: 5 }
    ]
  },
  {
    id: 'balanced',
    nameKey: 'autopilot.blueprints.balanced.name',
    descKey: 'autopilot.blueprints.balanced.desc',
    targets: [
      { buildingType: BuildingType.SolarPlant, targetLevel: 6, priority: 0 },
      { buildingType: BuildingType.MetalMine, targetLevel: 12, priority: 1 },
      { buildingType: BuildingType.CrystalMine, targetLevel: 10, priority: 2 },
      { buildingType: BuildingType.DeuteriumSynthesizer, targetLevel: 8, priority: 3 },
      { buildingType: BuildingType.ResearchLab, targetLevel: 5, priority: 4 },
      { buildingType: BuildingType.RoboticsFactory, targetLevel: 4, priority: 5 },
      { buildingType: BuildingType.MetalStorage, targetLevel: 3, priority: 6 },
      { buildingType: BuildingType.CrystalStorage, targetLevel: 3, priority: 6 },
      { buildingType: BuildingType.DeuteriumTank, targetLevel: 2, priority: 6 }
    ]
  }
]

export const getAutopilotBlueprint = (id: string): AutopilotBlueprint | undefined =>
  AUTOPILOT_BLUEPRINTS.find(b => b.id === id)

/**
 * 应用蓝图：用预设替换当前目标清单（已完成/已开工的工作不受影响，
 * 下次 tick 从实际等级重推）。同时启用副官。
 * filter 可选：Minor-8，月球上过滤 planetOnly 建筑等场景。
 */
export const applyBlueprintToPlanet = (
  config: AutopilotPlanetConfig,
  blueprintId: string,
  now: number = Date.now(),
  filter?: (t: AutopilotBlueprintTarget) => boolean
): boolean => {
  const blueprint = getAutopilotBlueprint(blueprintId)
  if (!blueprint) return false
  const targets = filter ? blueprint.targets.filter(filter) : blueprint.targets
  config.targets = targets.map(t => createAutopilotTarget(t.buildingType, t.targetLevel, t.priority, now))
  config.enabled = true
  config.paused = false
  config.lastDecision = 'autopilot.decisionBlueprintApplied'
  return true
}
