import type { Planet, Player } from '@/types/game'
import { createDefaultPlanetAutopilot } from '@/logic/autopilotLogic'

export const monitoringPlanet = (overrides: Partial<Planet> = {}): Planet => ({
  id: 'planet-1', name: 'Test', position: { galaxy: 1, system: 1, position: 8 },
  resources: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 100 },
  buildings: {}, fleet: {}, defense: {}, buildQueue: [], waitingBuildQueue: [],
  lastUpdate: Date.now(), maxSpace: 500, maxFleetStorage: 0, isMoon: false,
  autopilot: { ...createDefaultPlanetAutopilot(), enabled: true }, ...overrides
}) as Planet

export const monitoringPlayer = (planets: Planet[]): Player => ({
  id: 'player-1', name: 'Test', planets, technologies: {}, officers: {},
  researchQueue: [], waitingResearchQueue: [], fleetMissions: []
}) as unknown as Player
