/**
 * Vite 的 base 为 './'，图片路径使用相对路径，确保部署到子目录时正确加载。
 * 建筑图片例外：hangar 对应 images/buildings/allianceDepot.webp。
 */
import type { ShipType, DefenseType, BuildingType, OfficerType } from '@/types/game'

export const SHIP_ARTWORK: Record<ShipType, string> = {
  lightFighter: 'images/ships/lightFighter.webp',
  heavyFighter: 'images/ships/heavyFighter.webp',
  cruiser: 'images/ships/cruiser.webp',
  battleship: 'images/ships/battleship.webp',
  battlecruiser: 'images/ships/battlecruiser.webp',
  bomber: 'images/ships/bomber.webp',
  destroyer: 'images/ships/destroyer.webp',
  smallCargo: 'images/ships/smallCargo.webp',
  largeCargo: 'images/ships/largeCargo.webp',
  colonyShip: 'images/ships/colonyShip.webp',
  recycler: 'images/ships/recycler.webp',
  espionageProbe: 'images/ships/espionageProbe.webp',
  solarSatellite: 'images/ships/solarSatellite.webp',
  darkMatterHarvester: 'images/ships/darkMatterHarvester.webp',
  deathstar: 'images/ships/deathstar.webp',
}

export const DEFENSE_ARTWORK: Record<DefenseType, string> = {
  rocketLauncher: 'images/defenses/rocketLauncher.webp',
  lightLaser: 'images/defenses/lightLaser.webp',
  heavyLaser: 'images/defenses/heavyLaser.webp',
  gaussCannon: 'images/defenses/gaussCannon.webp',
  ionCannon: 'images/defenses/ionCannon.webp',
  plasmaTurret: 'images/defenses/plasmaTurret.webp',
  smallShieldDome: 'images/defenses/smallShieldDome.webp',
  largeShieldDome: 'images/defenses/largeShieldDome.webp',
  antiBallisticMissile: 'images/defenses/antiBallisticMissile.webp',
  interplanetaryMissile: 'images/defenses/interplanetaryMissile.webp',
  planetaryShield: 'images/defenses/planetaryShield.webp',
}

export const BUILDING_ARTWORK: Record<BuildingType, string> = {
  metalMine: 'images/buildings/metalMine.webp',
  crystalMine: 'images/buildings/crystalMine.webp',
  deuteriumSynthesizer: 'images/buildings/deuteriumSynthesizer.webp',
  solarPlant: 'images/buildings/solarPlant.webp',
  fusionReactor: 'images/buildings/fusionReactor.webp',
  roboticsFactory: 'images/buildings/roboticsFactory.webp',
  naniteFactory: 'images/buildings/naniteFactory.webp',
  shipyard: 'images/buildings/shipyard.webp',
  hangar: 'images/buildings/allianceDepot.webp',
  researchLab: 'images/buildings/researchLab.webp',
  metalStorage: 'images/buildings/metalStorage.webp',
  crystalStorage: 'images/buildings/crystalStorage.webp',
  deuteriumTank: 'images/buildings/deuteriumTank.webp',
  darkMatterCollector: 'images/buildings/darkMatterCollector.webp',
  darkMatterTank: 'images/buildings/darkMatterTank.webp',
  missileSilo: 'images/buildings/missileSilo.webp',
  terraformer: 'images/buildings/terraformer.webp',
  lunarBase: 'images/buildings/lunarBase.webp',
  sensorPhalanx: 'images/buildings/sensorPhalanx.webp',
  jumpGate: 'images/buildings/jumpGate.webp',
  planetDestroyerFactory: 'images/buildings/planetDestroyerFactory.webp',
  geoResearchStation: 'images/buildings/geoResearchStation.webp',
  deepDrillingFacility: 'images/buildings/deepDrillingFacility.webp',
  university: 'images/buildings/university.webp',
}

export const OFFICER_ARTWORK: Record<OfficerType, string> = {
  commander: 'images/officers/commander.webp',
  admiral: 'images/officers/admiral.webp',
  engineer: 'images/officers/engineer.webp',
  geologist: 'images/officers/geologist.webp',
  technocrat: 'images/officers/technocrat.webp',
  darkMatterSpecialist: 'images/officers/darkMatterSpecialist.webp',
}

export function artworkFor(kind: 'ship' | 'defense' | 'building' | 'officer', key: string): string | undefined {
  const artwork: Partial<Record<string, string>> = {
    ship: SHIP_ARTWORK,
    defense: DEFENSE_ARTWORK,
    building: BUILDING_ARTWORK,
    officer: OFFICER_ARTWORK,
  }[kind]

  return Object.prototype.hasOwnProperty.call(artwork, key) ? artwork[key] : undefined
}
