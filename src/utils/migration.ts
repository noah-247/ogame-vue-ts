import type {
  AllyDefenseNotification,
  DebrisField,
  FleetMission,
  IncomingFleetAlert,
  JointAttackInvite,
  MissionReport,
  NPC,
  NPCActivityNotification,
  Planet,
  Player,
  Position,
  SpiedNotification,
  SpyReport
} from '@/types/game'
import { decryptData, encryptData } from './crypto'
import { generatePlanetTemperature } from '@/logic/planetLogic'
import pkg from '../../package.json'

/**
 * 資料遷移工具
 * 用於從舊版本資料結構遷移到新版本
 */

type PlanetKind = 'planet' | 'moon'
type RemappedPlanetEntry = { newId: string; name: string }
type DuplicatePlanetKindMap = Map<PlanetKind, RemappedPlanetEntry>
type DuplicatePlanetPositionMap = Map<string, DuplicatePlanetKindMap>

// oldPlanetId -> position -> planet/moon -> remapped target
type DuplicatePlanetIdMap = Map<string, DuplicatePlanetPositionMap>

interface MigratablePlayer extends Player {
  diplomaticRelations?: Record<string, unknown>
}

interface MigratableGameData {
  currentPlanetId?: string
  player?: MigratablePlayer
  npcs?: NPC[]
  universePlanets?: Record<string, Planet>
  debrisFields?: Record<string, DebrisField>
}

interface PlanetReferenceContext {
  position?: Position
  isMoon?: boolean
  planetName?: string
}

interface HasTargetPlanetId {
  targetPlanetId?: string
}

interface HasOriginPlanetId {
  originPlanetId?: string
}

interface HasParentPlanetId {
  parentPlanetId?: string
}

interface HasCurrentPlanetId {
  currentPlanetId?: string
}

const getPlanetPositionKey = (position: Position): string => {
  return `${position.galaxy}:${position.system}:${position.position}`
}

const getPlanetKindKey = (isMoon?: boolean): PlanetKind => {
  return isMoon ? 'moon' : 'planet'
}

const getPlanetEntriesFor = (
  planetId: string,
  idMap: DuplicatePlanetIdMap,
  position?: Position
): DuplicatePlanetKindMap | undefined => {
  if (!position) return undefined

  return idMap.get(planetId)?.get(getPlanetPositionKey(position))
}

const getEntriesByName = (entries: Iterable<RemappedPlanetEntry>, planetName?: string): RemappedPlanetEntry[] => {
  if (!planetName) {
    return []
  }

  return Array.from(entries).filter(entry => entry.name === planetName)
}

const getUniqueEntryByName = (entries: Iterable<RemappedPlanetEntry>, planetName?: string): RemappedPlanetEntry | undefined => {
  const matchedEntries = getEntriesByName(entries, planetName)
  if (matchedEntries.length !== 1) {
    return undefined
  }

  return matchedEntries[0]
}

const getOnlyEntry = (entries: DuplicatePlanetKindMap): RemappedPlanetEntry | undefined => {
  if (entries.size !== 1) {
    return undefined
  }

  return Array.from(entries.values())[0]
}

const getEntriesAcrossPositions = (byPosition: DuplicatePlanetPositionMap): RemappedPlanetEntry[] => {
  const entries: RemappedPlanetEntry[] = []

  byPosition.forEach(byKind => {
    byKind.forEach(entry => {
      entries.push(entry)
    })
  })

  return entries
}

const buildDuplicatePlanetIdMap = (player: Player): DuplicatePlanetIdMap => {
  const planetsByOriginalId = new Map<string, Planet[]>()

  player.planets.forEach(planet => {
    let group = planetsByOriginalId.get(planet.id)
    if (!group) {
      group = []
      planetsByOriginalId.set(planet.id, group)
    }
    group.push(planet)
  })

  const idMap: DuplicatePlanetIdMap = new Map()

  planetsByOriginalId.forEach((planets, originalId) => {
    if (planets.length <= 1) return

    planets.forEach((planet, index) => {
      if (index === 0) return

      const newId = `${originalId}_${Math.random().toString(36).substring(2, 9)}`
      const positionKey = getPlanetPositionKey(planet.position)

      let byPosition = idMap.get(originalId)
      if (!byPosition) {
        byPosition = new Map()
        idMap.set(originalId, byPosition)
      }

      let byKind = byPosition.get(positionKey)
      if (!byKind) {
        byKind = new Map()
        byPosition.set(positionKey, byKind)
      }

      byKind.set(getPlanetKindKey(planet.isMoon), {
        newId,
        name: planet.name
      })

      planet.id = newId
    })
  })

  return idMap
}

const resolveRemappedPlanetId = (
  planetId: string | undefined,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): string | undefined => {
  if (!planetId) return undefined

  const byPosition = idMap.get(planetId)
  if (!byPosition) return undefined

  if (context.position) {
    const byKind = getPlanetEntriesFor(planetId, idMap, context.position)
    if (!byKind) return undefined

    // 只有在位置或名稱足夠區分目標時才重寫引用，避免把舊引用誤指到錯誤星球
    if (context.isMoon !== undefined) {
      return byKind.get(getPlanetKindKey(context.isMoon))?.newId
    }

    const matchedByName = getUniqueEntryByName(byKind.values(), context.planetName)
    if (matchedByName) {
      return matchedByName.newId
    }

    return getOnlyEntry(byKind)?.newId
  }

  if (context.planetName) {
    return getUniqueEntryByName(getEntriesAcrossPositions(byPosition), context.planetName)?.newId
  }

  return undefined
}

const getUpdatedPlanetId = (
  currentPlanetId: string | undefined,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): string | undefined => {
  const remappedPlanetId = resolveRemappedPlanetId(currentPlanetId, idMap, context)
  if (!remappedPlanetId || remappedPlanetId === currentPlanetId) {
    return undefined
  }

  return remappedPlanetId
}

const updateTargetPlanetId = (
  target: HasTargetPlanetId,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): boolean => {
  const remappedPlanetId = getUpdatedPlanetId(target.targetPlanetId, idMap, context)
  if (!remappedPlanetId) {
    return false
  }

  target.targetPlanetId = remappedPlanetId
  return true
}

const updateOriginPlanetId = (
  target: HasOriginPlanetId,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): boolean => {
  const remappedPlanetId = getUpdatedPlanetId(target.originPlanetId, idMap, context)
  if (!remappedPlanetId) {
    return false
  }

  target.originPlanetId = remappedPlanetId
  return true
}

const updateParentPlanetId = (
  target: HasParentPlanetId,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): boolean => {
  const remappedPlanetId = getUpdatedPlanetId(target.parentPlanetId, idMap, context)
  if (!remappedPlanetId) {
    return false
  }

  target.parentPlanetId = remappedPlanetId
  return true
}

const updateCurrentPlanetId = (
  target: HasCurrentPlanetId,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): boolean => {
  const remappedPlanetId = getUpdatedPlanetId(target.currentPlanetId, idMap, context)
  if (!remappedPlanetId) {
    return false
  }

  target.currentPlanetId = remappedPlanetId
  return true
}

const updateMissionTargetPlanetId = (mission: FleetMission, idMap: DuplicatePlanetIdMap): boolean => {
  return updateTargetPlanetId(mission, idMap, {
    position: mission.targetPosition,
    isMoon: mission.targetIsMoon
  })
}

const updateSpyReportTargetPlanetId = (report: SpyReport, idMap: DuplicatePlanetIdMap): boolean => {
  return updateTargetPlanetId(report, idMap, {
    position: report.targetPosition,
    planetName: report.targetPlanetName
  })
}

const updateSpiedNotificationTargetPlanetId = (
  notification: SpiedNotification,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(notification, idMap, {
    planetName: notification.targetPlanetName
  })
}

const updateNPCActivityTargetPlanetId = (
  notification: NPCActivityNotification,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(notification, idMap, {
    position: notification.targetPosition,
    planetName: notification.targetPlanetName
  })
}

const updateIncomingAlertTargetPlanetId = (
  alert: IncomingFleetAlert,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(alert, idMap, {
    planetName: alert.targetPlanetName
  })
}

const updateJointAttackTargetPlanetId = (
  invite: JointAttackInvite,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(invite, idMap, {
    position: invite.targetPosition
  })
}

const updateAllyDefenseTargetPlanetId = (
  notification: AllyDefenseNotification,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(notification, idMap, {
    planetName: notification.targetPlanetName
  })
}

const updateMissionReportPlanetIds = (report: MissionReport, idMap: DuplicatePlanetIdMap): boolean => {
  let mutated = false

  if (updateOriginPlanetId(report, idMap, {
    planetName: report.originPlanetName
  })) {
    mutated = true
  }

  if (updateTargetPlanetId(report, idMap, {
    position: report.targetPosition,
    planetName: report.targetPlanetName
  })) {
    mutated = true
  }

  if (report.details?.newPlanetId) {
    const remappedNewPlanetId = getUpdatedPlanetId(report.details.newPlanetId, idMap, {
      position: report.targetPosition,
      planetName: report.details.newPlanetName || report.targetPlanetName
    })

    if (remappedNewPlanetId) {
      report.details.newPlanetId = remappedNewPlanetId
      mutated = true
    }
  }

  return mutated
}

const fixPlayerPlanetsAndQueues = (player: Player, idMap: DuplicatePlanetIdMap): boolean => {
  let mutated = false

  player.planets.forEach(planet => {
    if (planet.isMoon && updateParentPlanetId(planet, idMap, {
      position: planet.position,
      isMoon: false
    })) {
      mutated = true
    }

    // 等待佇列裡的 planetId 應始終與所屬星球保持一致
    planet.waitingBuildQueue?.forEach(item => {
      if (item.planetId && item.planetId !== planet.id) {
        item.planetId = planet.id
        mutated = true
      }
    })
  })

  return mutated
}

const fixPlayerReferences = (
  player: Player,
  data: MigratableGameData,
  idMap: DuplicatePlanetIdMap
): boolean => {
  let mutated = false

  if (updateCurrentPlanetId(data, idMap)) {
    mutated = true
  }

  player.fleetMissions?.forEach(mission => {
    if (updateMissionTargetPlanetId(mission, idMap)) {
      mutated = true
    }
  })

  player.spyReports?.forEach(report => {
    if (updateSpyReportTargetPlanetId(report, idMap)) {
      mutated = true
    }
  })

  player.spiedNotifications?.forEach(notification => {
    if (updateSpiedNotificationTargetPlanetId(notification, idMap)) {
      mutated = true
    }
  })

  player.npcActivityNotifications?.forEach(notification => {
    if (updateNPCActivityTargetPlanetId(notification, idMap)) {
      mutated = true
    }
  })

  player.missionReports?.forEach(report => {
    if (updateMissionReportPlanetIds(report, idMap)) {
      mutated = true
    }
  })

  player.incomingFleetAlerts?.forEach(alert => {
    if (updateIncomingAlertTargetPlanetId(alert, idMap)) {
      mutated = true
    }
  })

  player.jointAttackInvites?.forEach(invite => {
    if (updateJointAttackTargetPlanetId(invite, idMap)) {
      mutated = true
    }
  })

  player.allyDefenseNotifications?.forEach(notification => {
    if (updateAllyDefenseTargetPlanetId(notification, idMap)) {
      mutated = true
    }
  })

  return mutated
}

const fixNpcPlayerSpyReports = (npc: NPC, idMap: DuplicatePlanetIdMap): boolean => {
  if (!npc.playerSpyReports) {
    return false
  }

  let mutated = false
  const remappedPlayerSpyReports: Record<string, SpyReport> = {}

  // playerSpyReports 的 key 就是玩家星球 ID，需要和報告內容一起遷移
  Object.entries(npc.playerSpyReports).forEach(([planetId, report]) => {
    if (updateSpyReportTargetPlanetId(report, idMap)) {
      mutated = true
    }

    const remappedPlanetId = getUpdatedPlanetId(planetId, idMap, {
      position: report.targetPosition,
      planetName: report.targetPlanetName
    })

    if (remappedPlanetId) {
      remappedPlayerSpyReports[remappedPlanetId] = report
      mutated = true
      return
    }

    remappedPlayerSpyReports[planetId] = report
  })

  npc.playerSpyReports = remappedPlayerSpyReports
  return mutated
}

const fixNpcReferences = (npcs: NPC[], idMap: DuplicatePlanetIdMap): boolean => {
  let mutated = false

  npcs.forEach(npc => {
    if (fixNpcPlayerSpyReports(npc, idMap)) {
      mutated = true
    }

    npc.fleetMissions?.forEach(mission => {
      if (updateMissionTargetPlanetId(mission, idMap)) {
        mutated = true
      }
    })
  })

  return mutated
}

/**
 * 修復玩家星球的重複ID，並同步更新可被可靠識別的舊引用。
 * 缺少位置或名稱上下文、無法安全判定歸屬的舊引用會保留原ID，
 * 繼續指向保留下來的首個星球，避免把資料誤指到錯誤目標。
 */
const fixDuplicatePlanetIds = (data: MigratableGameData): boolean => {
  const player = data.player
  if (!player || !Array.isArray(player.planets) || player.planets.length === 0) {
    return false
  }

  const idMap = buildDuplicatePlanetIdMap(player)
  if (idMap.size === 0) {
    return false
  }

  // buildDuplicatePlanetIdMap 已經在上一步直接修復了重複星球 ID，
  // 只要 idMap 非空，就說明當前遷移已經發生了實際修改。
  let mutated = true

  if (fixPlayerPlanetsAndQueues(player, idMap)) {
    mutated = true
  }

  if (fixPlayerReferences(player, data, idMap)) {
    mutated = true
  }

  if (data.npcs && fixNpcReferences(data.npcs, idMap)) {
    mutated = true
  }

  return mutated
}

/**
 * 執行資料遷移
 * 將舊版本的 universePlanets 和 debrisFields 從 gameStore 遷移到 universeStore
 */
export const migrateGameData = (): void => {
  try {
    const storageKey = pkg.name
    const universeStorageKey = `${pkg.name}-universe`

    // 讀取舊的加密存檔
    const oldEncryptedData = localStorage.getItem(storageKey)
    if (!oldEncryptedData) return

    // 嘗試解密（如果是加密格式）
    let oldData: MigratableGameData
    try {
      oldData = decryptData(oldEncryptedData) as MigratableGameData
    } catch {
      // 解密失敗，可能是新格式（未加密），直接解析
      try {
        oldData = JSON.parse(oldEncryptedData) as MigratableGameData
      } catch {
        return // 無法解析，放棄遷移
      }
    }

    // 標記是否有資料需要儲存
    let needsSave = false

    // 修復NPC資料（確保所有必需欄位都存在）
    if (oldData.npcs && Array.isArray(oldData.npcs)) {
      const now = Date.now()
      const playerId = oldData.player?.id

      oldData.npcs.forEach((npc: NPC) => {
        // 確保NPC有必需的時間欄位，並設定隨機冷卻避免同時行動
        if (npc.lastSpyTime === undefined || npc.lastSpyTime === 0) {
          // 0-4分鐘的隨機延遲
          const randomSpyOffset = Math.random() * 240 * 1000
          npc.lastSpyTime = now - randomSpyOffset
          needsSave = true
        }
        if (npc.lastAttackTime === undefined || npc.lastAttackTime === 0) {
          // 0-8分鐘的隨機延遲
          const randomAttackOffset = Math.random() * 480 * 1000
          npc.lastAttackTime = now - randomAttackOffset
          needsSave = true
        }
        // 確保NPC有必需的陣列欄位
        if (!npc.fleetMissions) {
          npc.fleetMissions = []
          needsSave = true
        }
        if (!npc.playerSpyReports) {
          npc.playerSpyReports = {}
          needsSave = true
        }
        if (!npc.relations) {
          npc.relations = {}
          needsSave = true
        }
        if (!npc.allies) {
          npc.allies = []
          needsSave = true
        }
        if (!npc.enemies) {
          npc.enemies = []
          needsSave = true
        }

        // 如果NPC與玩家沒有建立關係，自動建立中立關係
        if (playerId && !npc.relations[playerId]) {
          npc.relations[playerId] = {
            fromId: npc.id,
            toId: playerId,
            reputation: 0,
            status: 'neutral' as const,
            lastUpdated: now,
            history: []
          }
          needsSave = true
        }
      })
    }

    // 初始化玩家積分（如果不存在）
    if (oldData.player && oldData.player.points === undefined) {
      // 積分會在遊戲啟動時透過 initGame 計算，這裡設定為0
      oldData.player.points = 0
      needsSave = true
    }

    // 修復重複的星球ID
    if (fixDuplicatePlanetIds(oldData)) {
      needsSave = true
    }

    // 遷移溫度資料：為沒有溫度的星球生成溫度
    // 玩家星球
    if (oldData.player?.planets && Array.isArray(oldData.player.planets)) {
      oldData.player.planets.forEach((planet: Planet) => {
        // 月球不需要溫度
        if (!planet.isMoon && !planet.temperature) {
          planet.temperature = generatePlanetTemperature(planet.position.position)
          needsSave = true
        }
        // 遷移礦脈資料：確保所有礦脈都有 position 欄位
        if (planet.oreDeposits && !planet.isMoon) {
          const deposits = planet.oreDeposits as any
          // 情況1：舊格式有 initialMetal，需要刪除並新增 position
          if (deposits.initialMetal !== undefined) {
            delete deposits.initialMetal
            delete deposits.initialCrystal
            delete deposits.initialDeuterium
            needsSave = true
          }
          // 情況2：沒有 position 欄位，需要新增
          if (!deposits.position) {
            deposits.position = { ...planet.position }
            needsSave = true
          }
        }
      })
    }

    // NPC星球
    if (oldData.npcs && Array.isArray(oldData.npcs)) {
      oldData.npcs.forEach((npc: NPC) => {
        if (npc.planets && Array.isArray(npc.planets)) {
          npc.planets.forEach((planet: Planet) => {
            // 月球不需要溫度
            if (!planet.isMoon && !planet.temperature) {
              planet.temperature = generatePlanetTemperature(planet.position.position)
              needsSave = true
            }
            // 遷移礦脈資料：確保所有礦脈都有 position 欄位
            if (planet.oreDeposits && !planet.isMoon) {
              const deposits = planet.oreDeposits as any
              // 情況1：舊格式有 initialMetal，需要刪除
              if (deposits.initialMetal !== undefined) {
                delete deposits.initialMetal
                delete deposits.initialCrystal
                delete deposits.initialDeuterium
                needsSave = true
              }
              // 情況2：沒有 position 欄位，需要新增
              if (!deposits.position) {
                deposits.position = { ...planet.position }
                needsSave = true
              }
            }
          })
        }
      })
    }

    // 遷移 player.diplomaticRelations 到 npc.relations
    // 舊版本使用 player.diplomaticRelations[npcId] 儲存玩家對NPC的關係
    // 新版本統一使用 npc.relations[playerId] 儲存NPC對玩家的關係
    if (oldData.player?.diplomaticRelations && oldData.npcs && Array.isArray(oldData.npcs)) {
      const playerId = oldData.player.id
      const npcs = oldData.npcs
      const playerRelations = oldData.player.diplomaticRelations as Record<string, any>

      Object.entries(playerRelations).forEach(([npcId, relation]) => {
        const npc = npcs.find((n: NPC) => n.id === npcId)
        if (npc) {
          if (!npc.relations) {
            npc.relations = {}
          }
          // 如果NPC對玩家的關係不存在，使用玩家對NPC的關係資料
          if (!npc.relations[playerId]) {
            npc.relations[playerId] = {
              ...relation,
              fromId: npcId,
              toId: playerId
            }
            needsSave = true
          } else {
            // 如果兩邊都有資料，使用聲望值更極端的那個（偏離0更遠的）
            const existingReputation = npc.relations[playerId].reputation || 0
            const playerReputation = relation.reputation || 0
            if (Math.abs(playerReputation) > Math.abs(existingReputation)) {
              npc.relations[playerId].reputation = playerReputation
              npc.relations[playerId].status = relation.status
              needsSave = true
            }
          }
        }
      })

      // 刪除舊的 diplomaticRelations 欄位
      delete oldData.player.diplomaticRelations
      needsSave = true
    }

    // 檢查是否需要遷移地圖資料
    const hasOldMapData = oldData.universePlanets || oldData.debrisFields

    if (hasOldMapData) {
      // 準備 universeStore 資料
      const universeData: {
        planets: Record<string, Planet>
        debrisFields: Record<string, DebrisField>
      } = {
        planets: {},
        debrisFields: {}
      }

      // 遷移星球資料（排除玩家星球）
      if (oldData.universePlanets) {
        const oldPlanets = oldData.universePlanets as Record<string, Planet>
        const playerPlanets = oldData.player?.planets || []
        const playerPlanetIds = new Set(playerPlanets.map((p: Planet) => p.id))
        Object.entries(oldPlanets).forEach(([key, planet]) => {
          // 只遷移非玩家星球
          if (!playerPlanetIds.has(planet.id)) {
            // 為沒有溫度的星球生成溫度
            if (!planet.isMoon && !planet.temperature) {
              planet.temperature = generatePlanetTemperature(planet.position.position)
            }
            universeData.planets[key] = planet
          }
        })
        delete oldData.universePlanets
        needsSave = true
      }

      // 遷移殘骸場資料
      if (oldData.debrisFields) {
        universeData.debrisFields = oldData.debrisFields
        delete oldData.debrisFields
        needsSave = true
      }

      // 儲存universeStore資料
      localStorage.setItem(universeStorageKey, encryptData(universeData))
    }

    // 檢查並更新已存在的 universeStore 資料中的星球溫度
    const existingUniverseData = localStorage.getItem(universeStorageKey)
    if (existingUniverseData) {
      try {
        let universeData: { planets: Record<string, Planet>; debrisFields: Record<string, DebrisField> }
        try {
          universeData = decryptData(existingUniverseData)
        } catch {
          universeData = JSON.parse(existingUniverseData)
        }

        let universePlanetMigrated = false
        if (universeData.planets) {
          Object.values(universeData.planets).forEach((planet: Planet) => {
            if (!planet.isMoon && !planet.temperature) {
              planet.temperature = generatePlanetTemperature(planet.position.position)
              universePlanetMigrated = true
            }
          })
        }

        if (universePlanetMigrated) {
          localStorage.setItem(universeStorageKey, encryptData(universeData))
        }
      } catch (error) {
        console.error('[Migration] Failed to migrate universe planets temperature:', error)
      }
    }

    // 如果有任何資料被修改，儲存gameStore資料
    if (needsSave) {
      localStorage.setItem(storageKey, encryptData(oldData))
    }
  } catch (error) {
    console.error('[Migration] Failed to migrate game data:', error)
  }
}
