/**
 * 自動成長副官 · 目標清單引擎（方案 A 核心）
 *
 * 設計依據：~/workspace/ogame-report/自動成長副官-完整報告.md
 * （Codex 設計報告 + Opus 5.5 review，帕吉已拍板「照推薦組合開工」）
 *
 * 核心語義（方案 A「目標等級清單」）：
 * - 玩家（或藍圖預設）為每顆星球設定「建築 → 目標等級」清單；副官負責
 *   目標持久化（B3）、遞迴前置展開（B4）、槽位排程、能源最壞順序驗證（B1）、
 *   資源預留、工時門檻與滯後降級（B8）。
 * - 「目標」是持續到完成的意圖（B3）；「工作」是單級升級（current+1），
 *   透過既有等待佇列 + 正式佇列執行；副官排入的等待項帶 source 標記（B11）。
 * - 研究授權在帝國層級（B6），不由各星球副官互搶研究槽。
 * - 每 tick 從實際等級重推目標進度（B12）。
 *
 * 副官永遠不直接改建築等級、不另寫成本/工時/前置公式，
 * 一律沿用 buildingLogic / researchLogic / resourceLogic 的既有函式。
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
import { canAutopilotWork } from './autopilotBilling'

// ---------------------------------------------------------------------------
// 常量與預設配置
// ---------------------------------------------------------------------------

/** 自主模式單級工時上限預設值：2 小時（秒） */
export const DEFAULT_WORK_HOUR_THRESHOLD = 7200
/** 滯後恢復閾值預設值：1.5 小時（秒）；低於此值才提示可恢復自主（B8） */
export const DEFAULT_RESUME_THRESHOLD = 5400
/** 工時門檻可選檔位（秒）：2h / 4h / 8h */
export const WORK_HOUR_THRESHOLD_OPTIONS = [7200, 14400, 28800] as const
/** B5：空間預留預設值（格） */
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
// 引擎上下文（由呼叫方從軍官/遊戲狀態組裝，保持引擎純函式可測）
// ---------------------------------------------------------------------------

export interface AutopilotContext {
  /** 建築速度加成百分比（軍官等） */
  buildSpeedBonus: number
  /** 軍官提供的額外建造槽 */
  additionalBuildQueue: number
  /** 能源產出加成百分比 */
  energyProductionBonus: number
  /** 能源加成最早到期時間（毫秒，預設=穩定；MAJ-7） */
  energyBonusExpiresAt?: number
  /** 倉儲加成百分比 */
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
// 步驟模型
// ---------------------------------------------------------------------------

export type AutopilotStepKind = 'target' | 'prereq' | 'energy' | 'warehouse'

export interface AutopilotBlocker {
  kind: 'technology' | 'building' | 'prereqDisabled'
  /** 缺失的前置型別 */
  itemType: BuildingType | TechnologyType
  /** 需要的等級 */
  level: number
  /** 人類可讀原因 */
  reason: string
}

export interface AutopilotStep {
  buildingType: BuildingType
  /** 本次要建到的等級 = 當前+1（B3：等待項只執行+1，目標由規劃層持有） */
  nextLevel: number
  /** 歸屬目標 id（energy/warehouse 步驟為 ''） */
  targetId: string
  /** 繼承目標的優先順序；能源/倉庫救援為最高（-1） */
  priority: number
  kind: AutopilotStepKind
  cost: Resources
  /** 預估單級工時（秒） */
  buildTime: number
  /** 完工後能源產出增量（太陽能/聚變升級為正） */
  prodDelta: number
  /** 完工後能源消耗增量（礦場/設施升級為正） */
  consDelta: number
  /** 不可自動執行時的阻塞原因 */
  blockedBy?: AutopilotBlocker
}

export interface AutopilotTickResult<TTarget = AutopilotTarget> {
  /** 本 tick 新排入等待佇列的步數 */
  enqueued: number
  /** 是否發生了自主→執行降級 */
  downgraded: boolean
  /** 本 tick 新達標的目標（達標即保留在清單中，不再刪除，見 Minor-9/E） */
  completedTargets: TTarget[]
  /** 本 tick 遇到的阻塞原因（去重後） */
  blockers: AutopilotBlocker[]
  /** 人類可讀的決策摘要 */
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
// B12：從實際等級重推目標進度
// ---------------------------------------------------------------------------

/**
 * 對照星球實際等級重推目標進度（Minor-9/E：目標=期望狀態，持久儲存）。
 * 達標不刪除目標（達標=無工作可做）；玩家在達標前或達標後拆除到目標以下，
 * 目標都會變回未完成，下次 tick 重新規劃（行為一致）。
 * 返回本 tick 新達標的目標（已達標的不再重複報告，避免決策摘要每 tick 刷屏）。
 */
export const reconcileTargets = (
  config: AutopilotPlanetConfig,
  planet: Planet
): AutopilotTarget[] => {
  const newlyCompleted: AutopilotTarget[] = []
  for (const target of config.targets) {
    const current = planet.buildings[target.buildingType] || 0
    // BLK-4 防禦：非法目標等級（NaN/非正數）不判完成，留待 UI 修正
    if (!Number.isFinite(target.targetLevel) || target.targetLevel <= 0) continue
    const wasCompleted = target.completed === true
    target.completed = current >= target.targetLevel
    if (target.completed && !wasCompleted) newlyCompleted.push(target)
  }
  return newlyCompleted
}

export const reconcileResearchTargets = (
  config: EmpireResearchAutopilot,
  technologies: Partial<Record<TechnologyType, number>>
): AutopilotResearchTarget[] => {
  const newlyCompleted: AutopilotResearchTarget[] = []
  for (const target of config.targets) {
    const current = technologies[target.technology] || 0
    // BLK-4 防禦：非法目標等級不判完成，留待 UI 修正
    if (!Number.isFinite(target.targetLevel) || target.targetLevel <= 0) continue
    const wasCompleted = target.completed === true
    target.completed = current >= target.targetLevel
    if (target.completed && !wasCompleted) newlyCompleted.push(target)
  }
  return newlyCompleted
}

// ---------------------------------------------------------------------------
// B4：遞迴前置展開
// ---------------------------------------------------------------------------

type RequirementMap = Partial<Record<BuildingType | TechnologyType, number>>

/** 合併基礎 requirements + 所有 ≤ level 的 levelRequirements 門檻 */
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
  /** 需要補到的等級（從當前+1 逐級列出，呼叫方取首個即下一步） */
  level: number
  /** 缺失的科技前置（副官不能自動研究，需帝國研究授權或玩家手動） */
  blockedByTech?: { technology: TechnologyType; level: number }
}

/**
 * 遞迴展開「把 buildingType 建到 requiredLevel」的完整前置鏈（B4）。
 * 返回按建造順序排列的步驟（含自身各級的步驟，前置在前）。
 * - 科技前置不展開為建造步驟，標記為 blockedByTech（由帝國研究副官/玩家處理）。
 * - 月球跳過 planetOnly 前置（沿用 checkBuildingRequirements 的既有規則）。
 * - 環保護：同一建築只展開到歷史最高需求等級。
 */
export const expandPrerequisiteChain = (
  planet: Planet,
  technologies: Partial<Record<TechnologyType, number>>,
  buildingType: BuildingType,
  requiredLevel: number
): PrereqChainStep[] => {
  const steps: PrereqChainStep[] = []
  const seen = new Map<BuildingType, number>() // buildingType -> 已展開到的最高等級
  const emitted = new Set<string>() // `${type}:${level}` 去重

  const emit = (type: BuildingType, level: number, blockedByTech?: { technology: TechnologyType; level: number }) => {
    const key = `${type}:${level}`
    if (emitted.has(key)) return
    emitted.add(key)
    steps.push({ buildingType: type, level, blockedByTech })
  }

  const need = (type: BuildingType, level: number, depth: number): void => {
    // Minor-6：深度截斷時告警，避免鏈靜默缺段
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
      // maxLevel 保護
      if (config.maxLevel !== undefined && nextLevel > config.maxLevel) break
      const reqs = collectRequirements('building', type, nextLevel)
      let blockedByTech: { technology: TechnologyType; level: number } | undefined
      for (const [reqKey, reqLevel] of Object.entries(reqs)) {
        const needed = reqLevel as number
        if (isBuildingKey(reqKey)) {
          const reqBuilding = reqKey as BuildingType
          const reqConfig = BUILDINGS[reqBuilding]
          // 月球跳過星球專屬前置（與 checkBuildingRequirements 一致）
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

/** 帝國研究前置遞迴展開（只展開科技鏈；建築前置標記為阻塞） */
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
// 能源：最壞完工順序驗證（B1）
// ---------------------------------------------------------------------------

export interface EnergyCheckResult {
  safe: boolean
  /** 最壞順序下的最小能量餘量（產出-消耗） */
  margin: number
  production: number
  consumption: number
}

export const pendingEnergyDelta = (
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
  // 用完整公式算差值，避免手寫分項公式漂移（Minor-1）
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
 * B1 能源驗證：用「最壞完工順序」檢查待完工項。
 *
 * 原理：每個待完工項只改變 (prod, cons)。對手要讓餘量最小，
 * 會先完成所有「增耗/減產」的項、最後才完成「增產」的項。
 * 因此最壞順序下的最小余量 = P0 - C0 - Σ增耗 - Σ減產，
 * 與具體順序無關，一次 O(n) 即可精確判定。
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
// 步驟規劃：目標 → 前置鏈 → 單級步驟
// ---------------------------------------------------------------------------

/** 為一步計算成本/工時/能源增量 */
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
 * 為單個目標生成有序步驟：遞迴前置在前，目標自身的下一步在後。
 * allowPrereqAutoBuild=false 時，前置缺失 → 整個目標標記阻塞，不自動補。
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
    // 只取每條鏈的下一步（current+1）；更遠的等級等本級完成後再規劃
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
    // 月球不相容檢查
    const config = BUILDINGS[link.buildingType]
    const moonBlocked: AutopilotBlocker | undefined =
      planet.isMoon && config.planetOnly
        ? { kind: 'building', itemType: link.buildingType, level: link.level, reason: 'autopilot.blockedMoonIncompatible' }
        : undefined
    steps.push(toStep(planet, link.buildingType, link.level, target.id, target.priority, kind, ctx, blockedBy ?? moonBlocked))
  }
  return steps
}

/** 所有目標的步驟合併：按目標優先順序排序，同優先順序工時最長的先排（關鍵路徑） */
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
  // 同一 priority 內按工時降序（關鍵路徑最長先排），不同 priority 保持目標順序
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
// 能源救援 / 倉庫救援
// ---------------------------------------------------------------------------

const ENERGY_PRODUCERS = [BuildingType.SolarPlant, BuildingType.FusionReactor] as const
const WAREHOUSES: Record<'metal' | 'crystal' | 'deuterium', BuildingType> = {
  metal: BuildingType.MetalStorage,
  crystal: BuildingType.CrystalStorage,
  deuterium: BuildingType.DeuteriumTank
}

/** 規劃能源救援步驟：選產出增量最大的可行能源建築下一步 */
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
 * 規劃倉庫救援：若某步費用超過當前容量，返回對應倉庫的下一步。
 * 倉庫等級目標 = 剛好裝下該筆費用的最小等級。
 *
 * Minor-7：倉庫達到上限也裝不下時（12 級都裝不下 / 已到 maxLevel），
 * 不再返回 null 讓呼叫方誤判為 blockedNoResource，而是給出明確的阻塞原因。
 */
export interface WarehouseRescuePlan {
  /** 可執行的倉庫救援步驟；null = 無需救援，或需要救援但無法執行 */
  step: AutopilotStep | null
  /** step 為 null 且確實需要救援時，說明無法救援的明確原因 */
  blocked?: AutopilotBlocker
}

export const planWarehouseRescue = (
  planet: Planet,
  cost: Resources,
  storageCapacityBonus: number,
  ctx: AutopilotContext
): WarehouseRescuePlan => {
  const capacity = resourceLogic.calculateResourceCapacity(planet, storageCapacityBonus)
  for (const key of ['metal', 'crystal', 'deuterium'] as const) {
    if (cost[key] <= capacity[key]) continue
    const warehouse = WAREHOUSES[key]
    const current = planet.buildings[warehouse] || 0
    const config = BUILDINGS[warehouse]
    if (config.maxLevel !== undefined && current + 1 > config.maxLevel) {
      return {
        step: null,
        blocked: { kind: 'building', itemType: warehouse, level: config.maxLevel, reason: 'autopilot.blockedWarehouseCap' }
      }
    }
    // 找裝下費用的最小倉庫等級（上限 +12 級，避免無窮迴圈）
    for (let level = current + 1; level <= current + 12; level++) {
      const probe = { ...planet, buildings: { ...planet.buildings, [warehouse]: level } } as Planet
      const cap = resourceLogic.calculateResourceCapacity(probe, storageCapacityBonus)
      if (cap[key] >= cost[key]) {
        if (!buildingLogic.checkBuildingRequirements(warehouse, planet, {}, level)) {
          return {
            step: null,
            blocked: { kind: 'building', itemType: warehouse, level, reason: 'autopilot.blockedPrereq' }
          }
        }
        if (!buildingLogic.checkSpaceAvailable(planet, warehouse)) {
          return {
            step: null,
            blocked: { kind: 'building', itemType: warehouse, level, reason: 'autopilot.blockedNoSpace' }
          }
        }
        return { step: toStep(planet, warehouse, current + 1, '', -1, 'warehouse', ctx) }
      }
    }
    // 12 級都裝不下：明確報告倉庫上限阻塞（Minor-7）
    return {
      step: null,
      blocked: { kind: 'building', itemType: warehouse, level: current + 12, reason: 'autopilot.blockedWarehouseCap' }
    }
  }
  return { step: null }
}

/** 檢查科技在目標等級的前置（含等級門檻；既有 checkTechnologyRequirements 只查基礎前置） */
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
// 主 tick：單星球
// ---------------------------------------------------------------------------

/** 該建築是否已有在途工作（正式佇列）或等待項（任何來源：玩家優先） */
const isBuildingBusy = (planet: Planet, buildingType: BuildingType): boolean => {
  if (planet.buildQueue.some(i => (i.type === 'building' || i.type === 'demolish') && i.itemType === buildingType)) return true
  if (planet.waitingBuildQueue.some(i => (i.type === 'building' || i.type === 'demolish') && i.itemType === buildingType)) return true
  return false
}

/** 副官建築/研究/等待佇列的通用資源檢查已統一走 hasResourcesAfterSoftReserve（MAJ-8 改版後此函式無呼叫方，已移除，見 git 歷史） */

/**
 * MAJ-1：清理過期的副官等待項。
 * 副官排入等待後，若玩家手動先把該建築建到目標等級（或更高），等待項轉正時會判
 * levelAlreadyReached 且不移除，永久卡住佇列、虛增 B7 槽位計數、擋住該建築後續規劃。
 * 每 tick 在重推目標後執行，只移除已過期（targetLevel <= 當前等級）的副官建築等待項。
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
 * MAJ-6：撤回副官的建築等待項（接管/刪除目標時呼叫）。
 * 不傳 targetId 則撤回該星球全部副官建築等待項；傳 targetId 只撤回歸屬該目標的項。
 * 已開工（正式佇列）的項不受影響。
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

/** MAJ-1（研究）：清理過期的副官研究等待項 */
export const pruneAutopilotResearchWaiting = (player: Player): number => {
  const before = player.waitingResearchQueue.length
  player.waitingResearchQueue = player.waitingResearchQueue.filter(item => {
    if (item.source !== 'autopilot' || item.type !== 'technology') return true
    const cur = player.technologies[item.itemType as TechnologyType] || 0
    return (item.targetLevel ?? cur + 1) > cur
  })
  return before - player.waitingResearchQueue.length
}

/** MAJ-6（研究）：撤回副官的研究等待項 */
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
 * MAJ-8 軟預留改版（死鎖修復）：高優先順序步驟被資源擋住時，不再從 planningResources
 * 直接扣掉其成本（會誤殺收入型建築：收入建築自己的成本檢查會撞上被扣成負數的快照，
 * 而它正是賺回資源去蓋高優先順序建築的收入來源 → 自己卡自己，零收入下等於死鎖）。
 * 改用獨立的軟預留累加器，只累加「扣掉顯式 reserve 後還差多少」的缺口，不累加全額。
 */
const zeroSoftReserve = (): Resources => ({ metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 })

/** 把缺口按資源種類累加進軟預留（只累加缺口，避免超額預留） */
const addSoftReserveGap = (soft: Resources, planning: Resources, reserve: AutopilotReserve, cost: Resources): void => {
  soft.metal += Math.max(0, cost.metal - (planning.metal - reserve.metal))
  soft.crystal += Math.max(0, cost.crystal - (planning.crystal - reserve.crystal))
  soft.deuterium += Math.max(0, cost.deuterium - (planning.deuterium - reserve.deuterium))
}

/** 資源生產建築 → 其生產的資源種類（太陽能電站不產金屬/晶體/重氫，不在其中） */
const INCOME_RESOURCE: Partial<Record<BuildingType, 'metal' | 'crystal' | 'deuterium'>> = {
  [BuildingType.MetalMine]: 'metal',
  [BuildingType.CrystalMine]: 'crystal',
  [BuildingType.DeuteriumSynthesizer]: 'deuterium'
}

/**
 * 資源檢查（含顯式 reserve 和 MAJ-8 軟預留）。
 * incomeBypass 傳入時只豁免該種資源的軟預留部分，顯式 config.reserve 永不豁免。
 */
const hasResourcesAfterSoftReserve = (
  available: Resources,
  reserve: AutopilotReserve,
  soft: Resources,
  cost: Resources,
  incomeBypass?: 'metal' | 'crystal' | 'deuterium'
): boolean => {
  const kinds: Array<'metal' | 'crystal' | 'deuterium'> = ['metal', 'crystal', 'deuterium']
  for (const k of kinds) {
    const softPart = incomeBypass === k && soft[k] > 0 ? 0 : soft[k]
    if (available[k] - reserve[k] - softPart < cost[k]) return false
  }
  return available.darkMatter >= cost.darkMatter
}

/**
 * 求當前步驟的軟預留豁免：僅當它是收入型建築、且該資源確實存在軟預留缺口
 * （soft > 0）時返回豁免種類，否則 undefined。倉庫/研究/太陽能電站恆為 undefined。
 */
const softReserveBypassFor = (
  soft: Resources,
  buildingType: BuildingType
): 'metal' | 'crystal' | 'deuterium' | undefined => {
  const kind = INCOME_RESOURCE[buildingType]
  return kind && soft[kind] > 0 ? kind : undefined
}

/**
 * 單星球副官 tick。線上每秒呼叫（由 App.vue 的 updateGameAt 驅動），
 * 快轉時同樣經過 updateGameAt。離線返回時只做資源結算（B2），副官不追補。
 */
export const tickAutopilotPlanet = (
  player: Player,
  planet: Planet,
  now: number,
  ctx: AutopilotContext
): AutopilotTickResult => {
  const config = planet.autopilot
  if (!config || !config.enabled) {
    // Minor-4：停用/暫停時清理滯後恢復標記，避免 UI 顯示過期狀態
    if (config) config.canResumeAuto = false
    return emptyResult('autopilot.decisionDisabled')
  }

  // B12：每 tick 從實際等級重推目標進度
  const completedTargets = reconcileTargets(config, planet)

  if (config.mode === 'monitor') {
    withdrawAutopilotWaiting(planet)
    config.canResumeAuto = false
    config.lastDecision = 'autopilot.decisionMonitoring'
    return { ...emptyResult('autopilot.decisionMonitoring'), completedTargets }
  }

  // v3 計費守衛（§4.1）：無有效合約（無合約/非 active/免費監控檔）時不產生任何新工作。
  // 監控模式在上方已提前返回（免費監控不受守衛限制，只撤回等待項、不產生新工作）。
  if (!canAutopilotWork(player.autopilotContract)) {
    config.canResumeAuto = false
    return { ...emptyResult('autopilot.decisionDisabled'), completedTargets }
  }
  if (config.paused) {
    config.canResumeAuto = false
    return { ...emptyResult('autopilot.decisionDisabled'), completedTargets }
  }

  // MAJ-1：清理過期的副官等待項（玩家手動先建好導致 targetLevel <= 當前等級），
  // 避免 levelAlreadyReached 的死項永久佔槽
  pruneAutopilotWaiting(planet)

  const technologies = player.technologies
  const steps = planAllSteps(planet, technologies, config, ctx)
  const blockers: AutopilotBlocker[] = []
  let enqueued = 0
  let downgraded = false

  // B7：副官永遠給玩家留一個建造槽
  // MAJ-2：只計建築槽位項（building/demolish），艦船/防禦/拆船不佔建築槽
  const capacity = publicLogic.getMaxBuildQueue(planet, ctx.additionalBuildQueue)
  const isBuildSlotItem = (i: { type: string }): boolean => i.type === 'building' || i.type === 'demolish'
  const autopilotPending = (): number =>
    planet.buildQueue.filter(isBuildSlotItem).length +
    planet.waitingBuildQueue.filter(i => i.source === 'autopilot' && isBuildSlotItem(i)).length
  const maxAutopilotPending = Math.max(0, capacity - 1)

  // 規劃用資源快照：逐筆模擬扣款，避免等待佇列超發（等待項開工時才真扣款）
  let planningResources: Resources = { ...planet.resources }
  // MAJ-8 軟預留累加器（死鎖修復）：高優先順序步驟被資源擋住時只累加缺口，不再從 planningResources 扣款
  const softReserved: Resources = zeroSoftReserve()

  const enqueueStep = (step: AutopilotStep, opts: { exemptSpaceReserve?: boolean } = {}): boolean => {
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
    // B5：空間預留。Minor-2：能源救援豁免空間預留，否則斷電時無法自救
    if (!opts.exemptSpaceReserve) {
      const usedSpace = buildingLogic.calculateUsedSpace(planet)
      const spaceUsage = BUILDINGS[step.buildingType].spaceUsage
      if (usedSpace + spaceUsage > planet.maxSpace - config.minFreeSpace) {
        pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedNoSpace' })
        return false
      }
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
      targetId: step.targetId || undefined // MAJ-1/MAJ-6：目標歸屬，用於精準撤回
    }
    waitingQueueLogic.addToBuildWaitingQueue(planet, item)
    planningResources = subtractCost(planningResources, step.cost)
    enqueued++
    return true
  }

  /** 嘗試排入一步：依次做阻塞檢查 → 工時門檻 → 資源/倉庫/能源檢查 */
  const tryEnqueue = (step: AutopilotStep): 'enqueued' | 'blocked' | 'downgraded' => {
    if (step.blockedBy) {
      pushBlocker(blockers, step.blockedBy)
      return 'blocked'
    }
    if (isBuildingBusy(planet, step.buildingType)) return 'blocked'
    // 前置滿足檢查（含等級門檻）：不滿足則本 tick 跳過，等前置鏈先完成
    if (!buildingLogic.checkBuildingRequirements(step.buildingType, planet, technologies, step.nextLevel)) {
      pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedPrereq' })
      return 'blocked'
    }
    // 自主模式工時門檻（B8）：超限 → 降級為執行模式，停止自主挑步。
    // MAJ-4：只對「真要排入」的步驟做降級判定；被科技/前置擋住、或玩家手動在建的長工時步驟不觸發降級。
    if (config.mode === 'auto' && step.buildTime > config.workHourThreshold) {
      config.mode = 'execute'
      config.downgradeReason = 'autopilot.downgradeWorkTime'
      config.canResumeAuto = false
      downgraded = true
      return 'downgraded'
    }
    // 倉庫救援：費用超過容量先擴倉庫
    const rescueOutcome = planWarehouseRescue(planet, step.cost, ctx.storageCapacityBonus, ctx)
    const warehouseStep = rescueOutcome.step
    if (warehouseStep) {
      // BLK-3：倉庫本身已在途（等待/在建）時不再重複排入，否則同一 targetLevel 的
      // 重複項轉正後判 levelAlreadyReached 且不移除，永久卡住等待佇列
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
      if (!hasResourcesAfterSoftReserve(planningResources, config.reserve, softReserved, warehouseStep.cost, softReserveBypassFor(softReserved, warehouseStep.buildingType))) {
        pushBlocker(blockers, { kind: 'building', itemType: warehouseStep.buildingType, level: warehouseStep.nextLevel, reason: 'autopilot.blockedNoResource' })
        // MAJ-8（改版）：救援項被資源擋住只累加缺口進軟預留，避免低優先順序步驟吃掉它要攢的資源
        addSoftReserveGap(softReserved, planningResources, config.reserve, warehouseStep.cost)
        return 'blocked'
      }
      return enqueueStep(warehouseStep) ? 'enqueued' : 'blocked'
    }
    // Minor-7：倉庫上限導致無法救援（12 級都裝不下），給出明確阻塞原因
    if (rescueOutcome.blocked) {
      pushBlocker(blockers, rescueOutcome.blocked)
      return 'blocked'
    }
    // 資源檢查（含顯式預留和 MAJ-8 軟預留；收入型建築在軟預留有缺口時豁免該資源，避免死鎖）
    if (!hasResourcesAfterSoftReserve(planningResources, config.reserve, softReserved, step.cost, softReserveBypassFor(softReserved, step.buildingType))) {
      pushBlocker(blockers, { kind: 'building', itemType: step.buildingType, level: step.nextLevel, reason: 'autopilot.blockedNoResource' })
      // MAJ-8（改版）：高優先順序步驟因資源被擋時只把缺口累加進軟預留，
      // 低優先順序只能用剩下的部分；收入型建築豁免軟預留放行時不 push 誤導性 blocker、不累加。
      addSoftReserveGap(softReserved, planningResources, config.reserve, step.cost)
      return 'blocked'
    }
    // B1：最壞完工順序能源驗證（含本步）
    // MAJ-7：若能源加成軍官在待完工項最晚完工前到期，驗證按無加成計算（保守）
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
      // Minor-2：救援步驟同樣受自主模式工時門檻約束；排入失敗不再記「已救援」；
      // 能源救援豁免 B5 空間預留，否則斷電時無法自救
      if (rescue &&
          !(config.mode === 'auto' && rescue.buildTime > config.workHourThreshold) &&
          hasResourcesAfterSoftReserve(planningResources, config.reserve, softReserved, rescue.cost) &&
          enqueueStep(rescue, { exemptSpaceReserve: true })) {
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
    // blocked/enqueued 都繼續嘗試後續步驟（低優先順序不餓死，但受預留約束）
  }

  // B8 滯後恢復判定：執行模式下，若所有剩餘步驟工時 < resumeThreshold，提示可恢復
  // MAJ-4：排除在建/等待中的步驟（玩家手動在建的長工時項不應擋住恢復）；
  // 若目標未完成但無可規劃步驟（全在途），恢復自主同樣安全
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

/** 玩家確認後從執行模式恢復自主模式（B6/B8：恢復必須玩家確認；星球與帝國研究共用） */
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

/** 切換自主/執行模式（玩家手動）。MAJ-5：執行模式下無條件手動切回自主會
 *  繞過 B8 滯後守衛；除非 canResumeAuto 已放行，否則拒絕切換。 */
export const setAutopilotMode = (config: AutopilotPlanetConfig, mode: AutopilotMode): boolean => {
  if (mode === 'auto' && config.mode === 'execute' && config.downgradeReason && !config.canResumeAuto) return false
  config.mode = mode
  if (mode === 'auto') {
    config.downgradeReason = undefined
    config.canResumeAuto = false
  }
  return true
}

// ---------------------------------------------------------------------------
// 帝國層級研究 tick（B6）
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

/** 選擇研究用星球：沿用既有規則——第一顆有研究室的星球 */
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
 * 帝國研究副官 tick：研究授權在帝國層級（B6），各星球副官永不排研究。
 * 佔用研究等待佇列，但永遠給玩家留一個研究槽。
 */
export const tickEmpireResearch = (
  player: Player,
  now: number,
  ctx: AutopilotContext
): EmpireResearchTickResult => {
  const config = player.empireResearchAutopilot
  if (!config || !config.enabled || config.paused) {
    // Minor-4：停用/暫停時清理滯後恢復標記，避免 UI 顯示過期狀態
    if (config) config.canResumeAuto = false
    return { ...emptyResult('autopilot.decisionDisabled'), completedTargets: [] }
  }
  const labPlanet = selectResearchPlanet(player)
  if (!labPlanet) {
    return {
      ...emptyResult('autopilot.decisionBlocked'),
      completedTargets: [],
      blockers: [{ kind: 'building', itemType: BuildingType.ResearchLab, level: 1, reason: 'autopilot.blockedNoLab' }]
    }
  }

  const completedTargets = reconcileResearchTargets(config, player.technologies)

  if (labPlanet.autopilot?.mode === 'monitor') {
    withdrawAutopilotResearchWaiting(player)
    config.canResumeAuto = false
    config.lastDecision = 'autopilot.decisionMonitoring'
    return { ...emptyResult('autopilot.decisionMonitoring'), completedTargets }
  }

  // v3 計費守衛（§4.1）：無有效合約時帝國研究副官不產生任何新工作。
  // 監控模式在上方已提前返回（免費監控不受守衛限制）。
  if (!canAutopilotWork(player.autopilotContract)) {
    config.canResumeAuto = false
    return { ...emptyResult('autopilot.decisionDisabled'), completedTargets }
  }

  // MAJ-1：清理過期的副官研究等待項
  pruneAutopilotResearchWaiting(player)

  const steps = planResearchSteps(player, config, ctx)
  const blockers: AutopilotBlocker[] = []
  let enqueued = 0
  let downgraded = false

  const capacity = publicLogic.getMaxResearchQueue(player.technologies)
  const autopilotPending = (): number =>
    player.researchQueue.length + player.waitingResearchQueue.filter(i => i.source === 'autopilot').length
  const maxAutopilotPending = Math.max(0, capacity - 1)

  // 帝國研究預留從玩家...研究沒有星球資源概念：預留約束研究排隊時的資源佔用。
  // 簡化：檢查第一顆有研究室星球的資源（既有研究等待項同樣在此星球扣款）。
  // Minor-5：研究 tick 的資源快照至少扣掉研究星球的副官預留，
  // 避免星球副官和研究副官各自拿一份互不扣減的快照規劃。
  const labReserve = labPlanet.autopilot?.reserve ?? createDefaultReserve()
  let planningResources: Resources = subtractCost(
    { ...labPlanet.resources },
    { metal: labReserve.metal, crystal: labReserve.crystal, deuterium: labReserve.deuterium, darkMatter: 0, energy: 0 }
  )
  // MAJ-8 軟預留累加器（死鎖修復；研究不產資源，bypass 恆為 undefined，行為與改版前一致）
  const softReserved: Resources = zeroSoftReserve()

  /** 該科技是否已有在途研究（研究佇列/等待佇列，任何來源） */
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
    // 去重：同一科技已在研究佇列/等待佇列（任何來源）則跳過
    if (isResearchBusy(step.technology)) continue
    // 前置滿足檢查（含等級門檻）
    if (!checkResearchLevelRequirements(step.technology, labPlanet.buildings, player.technologies, step.nextLevel)) {
      pushBlocker(blockers, { kind: 'technology', itemType: step.technology, level: step.nextLevel, reason: 'autopilot.blockedPrereq' })
      continue
    }
    // 自主模式工時門檻（B8）：研究同樣適用，超限降級為執行模式。
    // MAJ-4：只對「真要排入」的步驟做降級判定，被擋住/在建的長工時步驟不觸發。
    if (config.mode === 'auto' && step.researchTime > config.workHourThreshold) {
      config.mode = 'execute'
      config.downgradeReason = 'autopilot.downgradeWorkTime'
      config.canResumeAuto = false
      downgraded = true
      decision = 'autopilot.decisionDowngraded'
      break
    }
    // 資源檢查（含預留和 MAJ-8 軟預留），在研究星球的資源快照上模擬扣款
    if (!hasResourcesAfterSoftReserve(planningResources, config.reserve, softReserved, step.cost)) {
      pushBlocker(blockers, { kind: 'technology', itemType: step.technology, level: step.nextLevel, reason: 'autopilot.blockedNoResource' })
      // MAJ-8（改版）：高優先順序研究被資源擋住時只累加缺口進軟預留，低優先順序只能用剩下的部分
      addSoftReserveGap(softReserved, planningResources, config.reserve, step.cost)
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
      targetId: step.targetId || undefined // MAJ-1/MAJ-6：目標歸屬
    }
    waitingQueueLogic.addToResearchWaitingQueue(player, item)
    planningResources = subtractCost(planningResources, step.cost)
    enqueued++
  }

  // B8 滯後恢復判定
  // MAJ-4：排除在建/等待中的步驟，玩家手動在建的長工時研究不應擋住恢復
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
// 藍圖預設（M1 首版兩套；藍圖 = 目標清單的預設組合，方案 A）
// 開局骨架按 Opus 修正：太陽能 1 → 三礦各 1（三槽並行）→ 重氫優先 2→3～4 →
// 三礦到 2 後重氫一夠立刻工廠 1、2 → 關鍵路徑最長先排。
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
      { buildingType: BuildingType.CrystalStorage, targetLevel: 3, priority: 6 },
      { buildingType: BuildingType.DeuteriumTank, targetLevel: 2, priority: 7 }
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
      { buildingType: BuildingType.CrystalStorage, targetLevel: 3, priority: 7 },
      { buildingType: BuildingType.DeuteriumTank, targetLevel: 2, priority: 8 }
    ]
  }
]

export const getAutopilotBlueprint = (id: string): AutopilotBlueprint | undefined =>
  AUTOPILOT_BLUEPRINTS.find(b => b.id === id)

/**
 * 應用藍圖：用預設替換當前目標清單（已完成/已開工的工作不受影響，
 * 下次 tick 從實際等級重推）。同時啟用副官。
 * filter 可選：Minor-8，月球上過濾 planetOnly 建築等場景。
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
