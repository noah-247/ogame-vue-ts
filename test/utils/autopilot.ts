import type { Planet, Player } from '@/types/game'
import { createDefaultPlanetAutopilot } from '@/logic/autopilotLogic'
import { createDefaultContract } from '@/logic/autopilotBilling'

export const monitoringPlanet = (overrides: Partial<Planet> = {}): Planet => ({
  id: 'planet-1', name: 'Test', position: { galaxy: 1, system: 1, position: 8 },
  resources: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 100 },
  buildings: {}, fleet: {}, defense: {}, buildQueue: [], waitingBuildQueue: [],
  lastUpdate: Date.now(), maxSpace: 500, maxFleetStorage: 0, isMoon: false,
  autopilot: { ...createDefaultPlanetAutopilot(), enabled: true }, ...overrides
}) as Planet

export const monitoringPlayer = (planets: Planet[]): Player => ({
  id: 'player-1', name: 'Test', planets, technologies: {}, officers: {},
  researchQueue: [], waitingResearchQueue: [], fleetMissions: [],
  // v3 计费：副官工作需要 active 合约；既有行为测试默认挂一张有效合约
  autopilotContract: { ...createDefaultContract(planets[0]?.id ?? 'planet-1', planets.map(p => p.id)), status: 'active' as const }
}) as unknown as Player
