import { BuildingType, TechnologyType, ShipType, DefenseType, OfficerType, ExpeditionZone } from '@/types/game'
import type { BuildingConfig, TechnologyConfig, ShipConfig, DefenseConfig, OfficerConfig, ExpeditionZoneConfig } from '@/types/game'

// 建築配置資料
export const BUILDINGS: Record<BuildingType, BuildingConfig> = {
  [BuildingType.MetalMine]: {
    id: BuildingType.MetalMine,
    name: '金屬礦',
    description: '開採金屬資源',
    baseCost: { metal: 60, crystal: 15, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 15, // 減少建造時間：30→15秒
    costMultiplier: 1.5,
    spaceUsage: 1,
    planetOnly: true,
    requirements: { [BuildingType.SolarPlant]: 1 },
    levelRequirements: {
      10: { [BuildingType.RoboticsFactory]: 2 },
      20: { [BuildingType.RoboticsFactory]: 5, [BuildingType.ResearchLab]: 3 },
      30: { [BuildingType.NaniteFactory]: 1, [BuildingType.ResearchLab]: 8 }
    }
  },
  [BuildingType.CrystalMine]: {
    id: BuildingType.CrystalMine,
    name: '晶體礦',
    description: '開採晶體資源',
    baseCost: { metal: 48, crystal: 24, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 15, // 減少建造時間：30→15秒
    costMultiplier: 1.6,
    spaceUsage: 1,
    planetOnly: true,
    requirements: { [BuildingType.SolarPlant]: 1 },
    levelRequirements: {
      10: { [BuildingType.RoboticsFactory]: 2 },
      20: { [BuildingType.RoboticsFactory]: 5, [BuildingType.ResearchLab]: 3 },
      30: { [BuildingType.NaniteFactory]: 1, [BuildingType.ResearchLab]: 8 }
    }
  },
  [BuildingType.DeuteriumSynthesizer]: {
    id: BuildingType.DeuteriumSynthesizer,
    name: '重氫合成器',
    description: '合成重氫資源',
    baseCost: { metal: 225, crystal: 75, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 20, // 減少建造時間：30→20秒
    costMultiplier: 1.5,
    spaceUsage: 2,
    planetOnly: true,
    requirements: { [BuildingType.SolarPlant]: 1 },
    levelRequirements: {
      10: { [BuildingType.RoboticsFactory]: 2 },
      20: { [BuildingType.RoboticsFactory]: 5, [BuildingType.ResearchLab]: 3 },
      30: { [BuildingType.NaniteFactory]: 1, [BuildingType.ResearchLab]: 8 }
    }
  },
  [BuildingType.SolarPlant]: {
    id: BuildingType.SolarPlant,
    name: '太陽能電站',
    description: '提供能源',
    baseCost: { metal: 75, crystal: 30, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 15, // 減少建造時間：30→15秒
    costMultiplier: 1.5,
    spaceUsage: 2,
    planetOnly: true, // OGame規則：月球不能建造太陽能電站
    levelRequirements: {
      15: { [BuildingType.RoboticsFactory]: 3 },
      25: { [BuildingType.RoboticsFactory]: 6, [BuildingType.ResearchLab]: 5 },
      35: { [BuildingType.NaniteFactory]: 1, [BuildingType.ResearchLab]: 10 }
    }
  },
  [BuildingType.FusionReactor]: {
    id: BuildingType.FusionReactor,
    name: '核聚變反應堆',
    description: '使用重氫產生大量能源',
    baseCost: { metal: 900, crystal: 360, deuterium: 180, darkMatter: 0, energy: 0 },
    baseTime: 30,
    costMultiplier: 1.8,
    spaceUsage: 4,
    planetOnly: true, // OGame規則：月球不能建造核聚變反應堆
    requirements: {
      [TechnologyType.EnergyTechnology]: 3,
      [BuildingType.DeuteriumSynthesizer]: 5
    },
    levelRequirements: {
      10: { [BuildingType.RoboticsFactory]: 5, [TechnologyType.EnergyTechnology]: 6 },
      20: { [BuildingType.RoboticsFactory]: 8, [TechnologyType.EnergyTechnology]: 10, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [BuildingType.RoboticsFactory]: {
    id: BuildingType.RoboticsFactory,
    name: '機器人工廠',
    description: '加快建造速度',
    baseCost: { metal: 400, crystal: 120, deuterium: 200, darkMatter: 0, energy: 0 },
    baseTime: 40, // 減少建造時間：60→40秒
    costMultiplier: 2,
    spaceUsage: 4,
    requirements: {
      [BuildingType.MetalMine]: 2,
      [BuildingType.CrystalMine]: 2,
      [BuildingType.DeuteriumSynthesizer]: 2
    },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 3, [BuildingType.SolarPlant]: 8 },
      8: { [BuildingType.ResearchLab]: 6, [BuildingType.SolarPlant]: 12, [BuildingType.MetalMine]: 12, [BuildingType.CrystalMine]: 12 }
    }
  },
  [BuildingType.NaniteFactory]: {
    id: BuildingType.NaniteFactory,
    name: '奈米工廠',
    description: '增加建造佇列數量，每級+1佇列',
    baseCost: { metal: 1000000, crystal: 500000, deuterium: 100000, darkMatter: 0, energy: 0 },
    baseTime: 240, // 減少建造時間：300→240秒
    costMultiplier: 2,
    spaceUsage: 8,
    maxLevel: 10, // 最多10級（最多11個建造佇列）
    planetOnly: true, // OGame規則：月球不能建造奈米工廠
    requirements: { [BuildingType.RoboticsFactory]: 10 },
    levelRequirements: {
      3: { [BuildingType.ResearchLab]: 10, [BuildingType.Shipyard]: 8, [TechnologyType.ComputerTechnology]: 8 },
      5: { [BuildingType.ResearchLab]: 12, [BuildingType.Shipyard]: 10, [TechnologyType.ComputerTechnology]: 10 }
    }
  },
  [BuildingType.Shipyard]: {
    id: BuildingType.Shipyard,
    name: '船塢',
    description: '建造艦船',
    baseCost: { metal: 400, crystal: 200, deuterium: 100, darkMatter: 0, energy: 0 },
    baseTime: 30, // 減少建造時間：60→30秒
    costMultiplier: 2,
    spaceUsage: 5,
    fleetStorageBonus: 1000, // 每級增加1000艦隊倉儲
    requirements: { [BuildingType.RoboticsFactory]: 2 },
    levelRequirements: {
      8: { [BuildingType.RoboticsFactory]: 5, [BuildingType.ResearchLab]: 5 },
      12: { [BuildingType.RoboticsFactory]: 8, [BuildingType.ResearchLab]: 8, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [BuildingType.Hangar]: {
    id: BuildingType.Hangar,
    name: '機庫',
    description: '專門用於擴充套件艦隊儲存容量，支援星球專業化發展',
    baseCost: { metal: 200, crystal: 100, deuterium: 50, darkMatter: 0, energy: 0 },
    baseTime: 20,
    costMultiplier: 1.8,
    spaceUsage: 3,
    fleetStorageBonus: 1500, // 每級增加1500艦隊倉儲，比船塢更高
    planetOnly: true, // OGame規則：月球不能建造機庫
    requirements: { [BuildingType.RoboticsFactory]: 1 }, // 只需要1級機器人工廠
    levelRequirements: {
      10: { [BuildingType.RoboticsFactory]: 3 },
      20: { [BuildingType.RoboticsFactory]: 5 }
    }
  },
  [BuildingType.ResearchLab]: {
    id: BuildingType.ResearchLab,
    name: '研究實驗室',
    description: '研究科技',
    baseCost: { metal: 200, crystal: 400, deuterium: 200, darkMatter: 0, energy: 0 },
    baseTime: 30, // 減少建造時間：60→30秒
    costMultiplier: 2,
    spaceUsage: 3,
    planetOnly: true, // OGame規則：月球不能建造研究實驗室
    requirements: {
      [BuildingType.MetalMine]: 3,
      [BuildingType.CrystalMine]: 3,
      [BuildingType.DeuteriumSynthesizer]: 3
    },
    levelRequirements: {
      8: {
        [BuildingType.RoboticsFactory]: 5,
        [BuildingType.MetalMine]: 10,
        [BuildingType.CrystalMine]: 10,
        [BuildingType.DeuteriumSynthesizer]: 10
      },
      12: { [BuildingType.RoboticsFactory]: 8, [BuildingType.NaniteFactory]: 1, [TechnologyType.EnergyTechnology]: 5 }
    }
  },
  [BuildingType.MetalStorage]: {
    id: BuildingType.MetalStorage,
    name: '金屬倉庫',
    description: '增加金屬儲存上限',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 15, // 減少建造時間：30→15秒
    costMultiplier: 2,
    spaceUsage: 1,
    planetOnly: true, // OGame規則：月球不能建造倉儲（月球沒有礦場）
    requirements: { [BuildingType.MetalMine]: 1 }
  },
  [BuildingType.CrystalStorage]: {
    id: BuildingType.CrystalStorage,
    name: '晶體倉庫',
    description: '增加晶體儲存上限',
    baseCost: { metal: 1000, crystal: 500, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 15, // 減少建造時間：30→15秒
    costMultiplier: 2,
    spaceUsage: 1,
    planetOnly: true, // OGame規則：月球不能建造倉儲（月球沒有礦場）
    requirements: { [BuildingType.CrystalMine]: 1 }
  },
  [BuildingType.DeuteriumTank]: {
    id: BuildingType.DeuteriumTank,
    name: '重氫罐',
    description: '增加重氫儲存上限',
    baseCost: { metal: 1000, crystal: 1000, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 15, // 減少建造時間：30→15秒
    costMultiplier: 2,
    spaceUsage: 1,
    planetOnly: true, // OGame規則：月球不能建造倉儲（月球沒有礦場）
    requirements: { [BuildingType.DeuteriumSynthesizer]: 1 }
  },
  [BuildingType.DarkMatterCollector]: {
    id: BuildingType.DarkMatterCollector,
    name: '暗物質收集器',
    description: '收集稀有的暗物質資源',
    baseCost: { metal: 50000, crystal: 100000, deuterium: 50000, darkMatter: 0, energy: 0 },
    baseTime: 90, // 減少建造時間：120→90秒
    costMultiplier: 2,
    spaceUsage: 6,
    planetOnly: true,
    requirements: {
      [BuildingType.ResearchLab]: 5,
      [TechnologyType.DarkMatterTechnology]: 1
    },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 8, [TechnologyType.DarkMatterTechnology]: 3, [BuildingType.RoboticsFactory]: 8 },
      8: { [BuildingType.ResearchLab]: 10, [TechnologyType.DarkMatterTechnology]: 5, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [BuildingType.DarkMatterTank]: {
    id: BuildingType.DarkMatterTank,
    name: '暗物質儲罐',
    description: '增加暗物質儲存上限',
    baseCost: { metal: 10000, crystal: 10000, deuterium: 5000, darkMatter: 0, energy: 0 },
    baseTime: 20,
    costMultiplier: 2,
    spaceUsage: 2,
    planetOnly: true,
    requirements: {
      [BuildingType.DarkMatterCollector]: 2,
      [TechnologyType.DarkMatterTechnology]: 1
    },
    levelRequirements: {
      8: { [BuildingType.DarkMatterCollector]: 8, [BuildingType.RoboticsFactory]: 3 },
      12: { [BuildingType.DarkMatterCollector]: 15, [BuildingType.RoboticsFactory]: 6, [TechnologyType.DarkMatterTechnology]: 3 }
    }
  },
  [BuildingType.MissileSilo]: {
    id: BuildingType.MissileSilo,
    name: '導彈發射井',
    description: '儲存和發射導彈，每級可儲存10枚導彈',
    baseCost: { metal: 20000, crystal: 20000, deuterium: 1000, darkMatter: 0, energy: 0 },
    baseTime: 45,
    costMultiplier: 2,
    spaceUsage: 5,
    maxLevel: 10,
    planetOnly: true, // OGame規則：月球不能建造導彈發射井
    requirements: {
      [BuildingType.Shipyard]: 1
    },
    levelRequirements: {
      5: { [BuildingType.Shipyard]: 5, [TechnologyType.ComputerTechnology]: 3 },
      8: { [BuildingType.Shipyard]: 8, [TechnologyType.ComputerTechnology]: 6, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [BuildingType.Terraformer]: {
    id: BuildingType.Terraformer,
    name: '地形改造器',
    description: '改造行星地形，每級增加30個可用空間',
    baseCost: { metal: 0, crystal: 50000, deuterium: 100000, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    spaceUsage: 5,
    planetOnly: true,
    requirements: {
      [BuildingType.ResearchLab]: 10,
      [BuildingType.RoboticsFactory]: 8,
      [TechnologyType.TerraformingTechnology]: 1
    },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 12, [TechnologyType.TerraformingTechnology]: 3, [BuildingType.NaniteFactory]: 1 },
      8: { [BuildingType.ResearchLab]: 14, [TechnologyType.TerraformingTechnology]: 5, [BuildingType.NaniteFactory]: 3 }
    }
  },
  // 月球專屬建築
  [BuildingType.LunarBase]: {
    id: BuildingType.LunarBase,
    name: '月球基地',
    description: '增加月球可用空間',
    baseCost: { metal: 8000, crystal: 8000, deuterium: 4000, darkMatter: 0, energy: 0 },
    baseTime: 45, // 減少建造時間：60→45秒
    costMultiplier: 2,
    spaceUsage: 0, // 月球基地本身不佔用空間,反而增加空間
    moonOnly: true,
    levelRequirements: {
      5: { [BuildingType.RoboticsFactory]: 5 },
      8: { [BuildingType.RoboticsFactory]: 8, [BuildingType.NaniteFactory]: 1 }
    }
  },
  [BuildingType.SensorPhalanx]: {
    id: BuildingType.SensorPhalanx,
    name: '感測器陣列',
    description: '偵測周圍星系的艦隊活動',
    baseCost: { metal: 20000, crystal: 40000, deuterium: 20000, darkMatter: 0, energy: 0 },
    baseTime: 60, // 減少建造時間：90→60秒
    costMultiplier: 2,
    spaceUsage: 6,
    moonOnly: true,
    requirements: { [BuildingType.LunarBase]: 1 },
    levelRequirements: {
      5: { [BuildingType.LunarBase]: 5, [TechnologyType.ComputerTechnology]: 5 },
      8: { [BuildingType.LunarBase]: 8, [TechnologyType.ComputerTechnology]: 8, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [BuildingType.JumpGate]: {
    id: BuildingType.JumpGate,
    name: '跳躍門',
    description: '瞬間傳送艦隊到其他月球',
    baseCost: { metal: 2000000, crystal: 4000000, deuterium: 2000000, darkMatter: 50000, energy: 0 },
    baseTime: 240, // 減少建造時間：300→240秒
    costMultiplier: 2,
    spaceUsage: 10,
    moonOnly: true,
    maxLevel: 5, // 最多5級
    requirements: {
      [BuildingType.LunarBase]: 1,
      [TechnologyType.HyperspaceTechnology]: 7
    },
    levelRequirements: {
      3: { [BuildingType.LunarBase]: 5, [TechnologyType.HyperspaceTechnology]: 10, [BuildingType.NaniteFactory]: 3 }
    }
  },
  // 特殊建築
  [BuildingType.PlanetDestroyerFactory]: {
    id: BuildingType.PlanetDestroyerFactory,
    name: '行星毀滅者工廠',
    description: '建造能夠摧毀行星的終極武器',
    baseCost: { metal: 5000000, crystal: 4000000, deuterium: 1000000, darkMatter: 100000, energy: 0 },
    baseTime: 300,
    costMultiplier: 2,
    spaceUsage: 15,
    planetOnly: true,
    maxLevel: 3, // 最多3級
    requirements: {
      [BuildingType.Shipyard]: 12,
      [BuildingType.RoboticsFactory]: 10,
      [BuildingType.NaniteFactory]: 5,
      [TechnologyType.PlanetDestructionTech]: 1
    },
    levelRequirements: {
      3: {
        [BuildingType.Shipyard]: 14,
        [BuildingType.NaniteFactory]: 8,
        [TechnologyType.PlanetDestructionTech]: 3,
        [TechnologyType.HyperspaceTechnology]: 10
      }
    }
  },
  // 資源管理建築
  [BuildingType.GeoResearchStation]: {
    id: BuildingType.GeoResearchStation,
    name: '地質研究站',
    description: '研究地質結構，提高礦脈自然恢復速度。每級增加10%恢復速率',
    baseCost: { metal: 50000, crystal: 30000, deuterium: 20000, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 1.8,
    spaceUsage: 4,
    planetOnly: true, // 只能在行星上建造
    maxLevel: 10, // 最多10級（最高6倍恢復速度）
    requirements: {
      [BuildingType.ResearchLab]: 5,
      [BuildingType.MetalMine]: 10,
      [BuildingType.CrystalMine]: 10,
      [BuildingType.DeuteriumSynthesizer]: 8
    },
    levelRequirements: {
      5: {
        [BuildingType.ResearchLab]: 8,
        [BuildingType.RoboticsFactory]: 5,
        [TechnologyType.EnergyTechnology]: 5
      },
      8: {
        [BuildingType.ResearchLab]: 10,
        [BuildingType.RoboticsFactory]: 8,
        [TechnologyType.EnergyTechnology]: 8,
        [BuildingType.NaniteFactory]: 1
      }
    }
  },
  // 深層鑽探設施 - 提升礦脈上限
  [BuildingType.DeepDrillingFacility]: {
    id: BuildingType.DeepDrillingFacility,
    name: '深層鑽探設施',
    description: '深入地殼鑽探，解鎖更深層的礦脈儲量。每級增加20%礦脈上限',
    baseCost: { metal: 100000, crystal: 80000, deuterium: 50000, darkMatter: 0, energy: 0 },
    baseTime: 120,
    costMultiplier: 2.0,
    spaceUsage: 6,
    planetOnly: true, // 只能在行星上建造
    maxLevel: 10, // 最多10級（最高3倍礦脈上限）
    requirements: {
      [BuildingType.ResearchLab]: 8,
      [BuildingType.MetalMine]: 15,
      [BuildingType.CrystalMine]: 15,
      [BuildingType.DeuteriumSynthesizer]: 12,
      [BuildingType.GeoResearchStation]: 3
    },
    levelRequirements: {
      5: {
        [BuildingType.ResearchLab]: 10,
        [BuildingType.RoboticsFactory]: 8,
        [BuildingType.NaniteFactory]: 2,
        [TechnologyType.EnergyTechnology]: 10
      },
      8: {
        [BuildingType.ResearchLab]: 12,
        [BuildingType.NaniteFactory]: 5,
        [TechnologyType.EnergyTechnology]: 12,
        [TechnologyType.PlasmaTechnology]: 5
      }
    }
  },
  // 2moons新增建築
  [BuildingType.University]: {
    id: BuildingType.University,
    name: '大學',
    description: '培養科研人員，加快研究速度。每級減少研究時間8%（與星際研究網路疊加）',
    baseCost: { metal: 200000, crystal: 100000, deuterium: 50000, darkMatter: 0, energy: 0 },
    baseTime: 120,
    costMultiplier: 2,
    spaceUsage: 8,
    planetOnly: true,
    maxLevel: 10, // 最多10級（最高約57%研究時間減少）
    requirements: {
      [BuildingType.ResearchLab]: 8,
      [BuildingType.RoboticsFactory]: 6
    },
    levelRequirements: {
      5: {
        [BuildingType.ResearchLab]: 10,
        [BuildingType.RoboticsFactory]: 8,
        [TechnologyType.EnergyTechnology]: 8
      },
      8: {
        [BuildingType.ResearchLab]: 12,
        [BuildingType.NaniteFactory]: 2,
        [TechnologyType.ComputerTechnology]: 8
      }
    }
  }
}

// 科技配置資料
export const TECHNOLOGIES: Record<TechnologyType, TechnologyConfig> = {
  [TechnologyType.EnergyTechnology]: {
    id: TechnologyType.EnergyTechnology,
    name: '能源技術',
    description: '加快研究速度',
    baseCost: { metal: 0, crystal: 800, deuterium: 400, darkMatter: 0, energy: 0 },
    baseTime: 30, // 減少研究時間：60→30秒
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 1 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 3, [BuildingType.SolarPlant]: 10 },
      8: { [BuildingType.ResearchLab]: 5, [BuildingType.SolarPlant]: 15, [BuildingType.RoboticsFactory]: 3 },
      12: { [BuildingType.ResearchLab]: 8, [BuildingType.RoboticsFactory]: 6, [BuildingType.NaniteFactory]: 1 }
    }
  },
  [TechnologyType.LaserTechnology]: {
    id: TechnologyType.LaserTechnology,
    name: '鐳射技術',
    description: '開發鐳射武器',
    baseCost: { metal: 200, crystal: 100, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 1, [TechnologyType.EnergyTechnology]: 2 },
    levelRequirements: {
      6: { [BuildingType.ResearchLab]: 5, [TechnologyType.EnergyTechnology]: 5, [BuildingType.Shipyard]: 3 },
      10: { [BuildingType.ResearchLab]: 8, [TechnologyType.EnergyTechnology]: 8, [BuildingType.Shipyard]: 6 }
    }
  },
  [TechnologyType.IonTechnology]: {
    id: TechnologyType.IonTechnology,
    name: '離子技術',
    description: '開發離子武器',
    baseCost: { metal: 1000, crystal: 300, deuterium: 100, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 4, [TechnologyType.LaserTechnology]: 5, [TechnologyType.EnergyTechnology]: 4 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 8, [TechnologyType.LaserTechnology]: 10, [TechnologyType.EnergyTechnology]: 8 },
      8: { [BuildingType.ResearchLab]: 10, [TechnologyType.LaserTechnology]: 12, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [TechnologyType.HyperspaceTechnology]: {
    id: TechnologyType.HyperspaceTechnology,
    name: '超空間技術',
    description: '研究超空間跳躍',
    baseCost: { metal: 0, crystal: 4000, deuterium: 2000, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 7, [TechnologyType.EnergyTechnology]: 5 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 10, [TechnologyType.EnergyTechnology]: 8, [BuildingType.Shipyard]: 5 },
      8: { [BuildingType.ResearchLab]: 12, [TechnologyType.EnergyTechnology]: 10, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [TechnologyType.PlasmaTechnology]: {
    id: TechnologyType.PlasmaTechnology,
    name: '等離子技術',
    description: '開發等離子武器',
    baseCost: { metal: 2000, crystal: 4000, deuterium: 1000, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: {
      [BuildingType.ResearchLab]: 4,
      [TechnologyType.EnergyTechnology]: 8,
      [TechnologyType.LaserTechnology]: 10,
      [TechnologyType.IonTechnology]: 5
    },
    levelRequirements: {
      5: {
        [BuildingType.ResearchLab]: 10,
        [TechnologyType.EnergyTechnology]: 12,
        [TechnologyType.IonTechnology]: 8,
        [BuildingType.NaniteFactory]: 1
      },
      8: {
        [BuildingType.ResearchLab]: 12,
        [TechnologyType.EnergyTechnology]: 15,
        [TechnologyType.IonTechnology]: 10,
        [BuildingType.NaniteFactory]: 3
      }
    }
  },
  [TechnologyType.ComputerTechnology]: {
    id: TechnologyType.ComputerTechnology,
    name: '計算機技術',
    description: '增加研究佇列和艦隊任務槽位，每級+1佇列+1槽位',
    baseCost: { metal: 0, crystal: 400, deuterium: 600, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    fleetStorageBonus: 500, // 每級全域性增加500艦隊倉儲
    maxLevel: 10, // 最多15級（最多16個研究佇列和16個艦隊槽位）
    requirements: { [BuildingType.ResearchLab]: 1 },
    levelRequirements: {
      3: { [BuildingType.ResearchLab]: 5 },
      5: { [BuildingType.ResearchLab]: 8, [BuildingType.RoboticsFactory]: 5 },
      8: { [BuildingType.ResearchLab]: 10, [BuildingType.NaniteFactory]: 2 },
      12: { [BuildingType.ResearchLab]: 12, [BuildingType.NaniteFactory]: 5 }
    }
  },
  [TechnologyType.EspionageTechnology]: {
    id: TechnologyType.EspionageTechnology,
    name: '間諜技術',
    description:
      '提高間諜探測效果，每級提高1級偵查深度。偵察等級=己方等級-對方等級+偵察船數/5。≥-1顯示艦隊，≥1顯示防禦，≥3顯示建築，≥5顯示科技',
    baseCost: { metal: 200, crystal: 1000, deuterium: 200, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 3 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 6, [TechnologyType.ComputerTechnology]: 3 },
      8: { [BuildingType.ResearchLab]: 8, [TechnologyType.ComputerTechnology]: 5 }
    }
  },
  [TechnologyType.WeaponsTechnology]: {
    id: TechnologyType.WeaponsTechnology,
    name: '武器技術',
    description: '提高艦船和防禦的攻擊力，每級+10%',
    baseCost: { metal: 800, crystal: 200, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 4 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 7, [BuildingType.Shipyard]: 4 },
      10: { [BuildingType.ResearchLab]: 10, [BuildingType.Shipyard]: 8, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [TechnologyType.ShieldingTechnology]: {
    id: TechnologyType.ShieldingTechnology,
    name: '護盾技術',
    description: '提高艦船和防禦的護盾值，每級+10%',
    baseCost: { metal: 200, crystal: 600, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 6, [TechnologyType.EnergyTechnology]: 3 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 8, [TechnologyType.EnergyTechnology]: 6 },
      10: { [BuildingType.ResearchLab]: 10, [TechnologyType.EnergyTechnology]: 10, [BuildingType.NaniteFactory]: 2 }
    }
  },
  [TechnologyType.ArmourTechnology]: {
    id: TechnologyType.ArmourTechnology,
    name: '裝甲技術',
    description: '提高艦船和防禦的裝甲值，每級+10%',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 2 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 6, [BuildingType.Shipyard]: 3 },
      10: { [BuildingType.ResearchLab]: 10, [BuildingType.Shipyard]: 7, [BuildingType.NaniteFactory]: 1 }
    }
  },
  [TechnologyType.Astrophysics]: {
    id: TechnologyType.Astrophysics,
    name: '天體物理學',
    description: '每級增加1個殖民地槽位，增加探險成功率',
    baseCost: { metal: 4000, crystal: 8000, deuterium: 4000, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 1.75,
    requirements: {
      [BuildingType.ResearchLab]: 3,
      [TechnologyType.EspionageTechnology]: 4,
      [TechnologyType.ImpulseDrive]: 3
    },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 8, [TechnologyType.EspionageTechnology]: 8 },
      10: { [BuildingType.ResearchLab]: 12, [TechnologyType.HyperspaceTechnology]: 5, [BuildingType.NaniteFactory]: 3 }
    }
  },
  [TechnologyType.GravitonTechnology]: {
    id: TechnologyType.GravitonTechnology,
    name: '引力技術',
    description: '研究引力操縱，死星的必要技術',
    baseCost: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 100000, energy: 0 },
    baseTime: 0,
    costMultiplier: 3,
    maxLevel: 1, // 只有1級
    requirements: {
      [BuildingType.ResearchLab]: 12
    }
  },
  [TechnologyType.CombustionDrive]: {
    id: TechnologyType.CombustionDrive,
    name: '燃燒引擎',
    description: '基礎推進系統',
    baseCost: { metal: 400, crystal: 0, deuterium: 600, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 1, [TechnologyType.EnergyTechnology]: 1 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 5, [TechnologyType.EnergyTechnology]: 3, [BuildingType.Shipyard]: 2 },
      8: { [BuildingType.ResearchLab]: 8, [TechnologyType.EnergyTechnology]: 5, [BuildingType.Shipyard]: 5 }
    }
  },
  [TechnologyType.ImpulseDrive]: {
    id: TechnologyType.ImpulseDrive,
    name: '脈衝引擎',
    description: '高階推進系統',
    baseCost: { metal: 2000, crystal: 4000, deuterium: 600, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 2, [TechnologyType.EnergyTechnology]: 1 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 6, [TechnologyType.EnergyTechnology]: 4, [BuildingType.Shipyard]: 3 },
      8: { [BuildingType.ResearchLab]: 8, [TechnologyType.EnergyTechnology]: 6, [BuildingType.Shipyard]: 6 }
    }
  },
  [TechnologyType.HyperspaceDrive]: {
    id: TechnologyType.HyperspaceDrive,
    name: '超空間引擎',
    description: '超空間推進系統',
    baseCost: { metal: 10000, crystal: 20000, deuterium: 6000, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 7, [TechnologyType.HyperspaceTechnology]: 3 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 10, [TechnologyType.HyperspaceTechnology]: 6, [BuildingType.Shipyard]: 8 },
      8: { [BuildingType.ResearchLab]: 12, [TechnologyType.HyperspaceTechnology]: 8, [BuildingType.NaniteFactory]: 3 }
    }
  },
  [TechnologyType.DarkMatterTechnology]: {
    id: TechnologyType.DarkMatterTechnology,
    name: '暗物質技術',
    description: '研究暗物質的性質和應用',
    baseCost: { metal: 100000, crystal: 200000, deuterium: 100000, darkMatter: 0, energy: 0 },
    baseTime: 180,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 10, [TechnologyType.HyperspaceTechnology]: 5 },
    levelRequirements: {
      3: {
        [BuildingType.ResearchLab]: 10,
        [TechnologyType.HyperspaceTechnology]: 8,
        [BuildingType.RoboticsFactory]: 10,
        [TechnologyType.EnergyTechnology]: 10
      },
      5: {
        [BuildingType.ResearchLab]: 12,
        [TechnologyType.HyperspaceTechnology]: 10,
        [BuildingType.NaniteFactory]: 2,
        [TechnologyType.EnergyTechnology]: 12
      }
    }
  },
  [TechnologyType.TerraformingTechnology]: {
    id: TechnologyType.TerraformingTechnology,
    name: '地形改造技術',
    description: '研究行星地形改造技術，每級為所有行星增加30個可用空間',
    baseCost: { metal: 0, crystal: 20000, deuterium: 40000, darkMatter: 0, energy: 0 },
    baseTime: 90,
    costMultiplier: 2,
    requirements: { [BuildingType.ResearchLab]: 8, [TechnologyType.EnergyTechnology]: 6 },
    levelRequirements: {
      5: { [BuildingType.ResearchLab]: 12, [TechnologyType.EnergyTechnology]: 10, [BuildingType.RoboticsFactory]: 10 },
      8: { [BuildingType.ResearchLab]: 14, [TechnologyType.EnergyTechnology]: 12, [BuildingType.NaniteFactory]: 3 }
    }
  },
  [TechnologyType.PlanetDestructionTech]: {
    id: TechnologyType.PlanetDestructionTech,
    name: '行星毀滅技術',
    description: '研究如何摧毀整個行星的恐怖技術',
    baseCost: { metal: 4000000, crystal: 8000000, deuterium: 4000000, darkMatter: 200000, energy: 0 },
    baseTime: 300,
    costMultiplier: 2,
    maxLevel: 10,
    requirements: {
      [BuildingType.ResearchLab]: 12,
      [TechnologyType.HyperspaceTechnology]: 8,
      [TechnologyType.HyperspaceDrive]: 6,
      [TechnologyType.PlasmaTechnology]: 7
    },
    levelRequirements: {
      3: {
        [BuildingType.ResearchLab]: 14,
        [TechnologyType.HyperspaceTechnology]: 12,
        [TechnologyType.HyperspaceDrive]: 10,
        [TechnologyType.PlasmaTechnology]: 10,
        [BuildingType.NaniteFactory]: 5
      }
    }
  },
  [TechnologyType.MiningTechnology]: {
    id: TechnologyType.MiningTechnology,
    name: '採礦技術',
    description: '改進採礦方法和裝置，提升所有星球礦脈儲量上限。每級增加15%礦脈上限',
    baseCost: { metal: 50000, crystal: 30000, deuterium: 20000, darkMatter: 0, energy: 0 },
    baseTime: 90,
    costMultiplier: 1.8,
    maxLevel: 15, // 最多15級（最高約2.25倍上限加成）
    requirements: {
      [BuildingType.ResearchLab]: 5,
      [TechnologyType.EnergyTechnology]: 4,
      [BuildingType.MetalMine]: 12,
      [BuildingType.CrystalMine]: 12
    },
    levelRequirements: {
      5: {
        [BuildingType.ResearchLab]: 8,
        [TechnologyType.EnergyTechnology]: 8,
        [BuildingType.RoboticsFactory]: 5
      },
      10: {
        [BuildingType.ResearchLab]: 12,
        [TechnologyType.EnergyTechnology]: 12,
        [BuildingType.NaniteFactory]: 3,
        [TechnologyType.PlasmaTechnology]: 3
      }
    }
  },
  // 2moons新增科技
  [TechnologyType.IntergalacticResearchNetwork]: {
    id: TechnologyType.IntergalacticResearchNetwork,
    name: '星際研究網路',
    description: '連線多個星球的研究實驗室，共享研究資源。每級可連線1個額外的研究實驗室（取等級最高的N個實驗室）',
    baseCost: { metal: 240000, crystal: 400000, deuterium: 160000, darkMatter: 0, energy: 0 },
    baseTime: 180,
    costMultiplier: 2,
    maxLevel: 10,
    requirements: {
      [BuildingType.ResearchLab]: 10,
      [TechnologyType.ComputerTechnology]: 8,
      [TechnologyType.HyperspaceTechnology]: 8
    },
    levelRequirements: {
      5: {
        [BuildingType.ResearchLab]: 12,
        [TechnologyType.ComputerTechnology]: 10,
        [TechnologyType.HyperspaceTechnology]: 10
      },
      8: {
        [BuildingType.ResearchLab]: 14,
        [TechnologyType.ComputerTechnology]: 10,
        [BuildingType.NaniteFactory]: 5
      }
    }
  },
  [TechnologyType.MineralResearch]: {
    id: TechnologyType.MineralResearch,
    name: '礦物研究',
    description: '研究更高效的金屬提取技術，提升金屬礦產量。每級增加金屬產量2%',
    baseCost: { metal: 60000, crystal: 30000, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 1.75,
    maxLevel: 20,
    requirements: {
      [BuildingType.ResearchLab]: 5,
      [BuildingType.MetalMine]: 10,
      [TechnologyType.EnergyTechnology]: 3
    },
    levelRequirements: {
      10: {
        [BuildingType.ResearchLab]: 8,
        [BuildingType.MetalMine]: 20,
        [TechnologyType.EnergyTechnology]: 8
      },
      15: {
        [BuildingType.ResearchLab]: 12,
        [BuildingType.NaniteFactory]: 2,
        [TechnologyType.PlasmaTechnology]: 5
      }
    }
  },
  [TechnologyType.CrystalResearch]: {
    id: TechnologyType.CrystalResearch,
    name: '晶體研究',
    description: '研究更高效的晶體提煉技術，提升晶體礦產量。每級增加晶體產量2%',
    baseCost: { metal: 40000, crystal: 60000, deuterium: 0, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 1.75,
    maxLevel: 20,
    requirements: {
      [BuildingType.ResearchLab]: 5,
      [BuildingType.CrystalMine]: 10,
      [TechnologyType.EnergyTechnology]: 3
    },
    levelRequirements: {
      10: {
        [BuildingType.ResearchLab]: 8,
        [BuildingType.CrystalMine]: 20,
        [TechnologyType.EnergyTechnology]: 8
      },
      15: {
        [BuildingType.ResearchLab]: 12,
        [BuildingType.NaniteFactory]: 2,
        [TechnologyType.PlasmaTechnology]: 5
      }
    }
  },
  [TechnologyType.FuelResearch]: {
    id: TechnologyType.FuelResearch,
    name: '燃料研究',
    description: '研究更高效的重氫合成技術，提升重氫產量。每級增加重氫產量2%',
    baseCost: { metal: 0, crystal: 50000, deuterium: 50000, darkMatter: 0, energy: 0 },
    baseTime: 60,
    costMultiplier: 1.75,
    maxLevel: 20,
    requirements: {
      [BuildingType.ResearchLab]: 5,
      [BuildingType.DeuteriumSynthesizer]: 10,
      [TechnologyType.EnergyTechnology]: 3
    },
    levelRequirements: {
      10: {
        [BuildingType.ResearchLab]: 8,
        [BuildingType.DeuteriumSynthesizer]: 20,
        [TechnologyType.EnergyTechnology]: 8
      },
      15: {
        [BuildingType.ResearchLab]: 12,
        [BuildingType.NaniteFactory]: 2,
        [TechnologyType.PlasmaTechnology]: 5
      }
    }
  }
}

// 艦船配置資料
export const SHIPS: Record<ShipType, ShipConfig> = {
  [ShipType.LightFighter]: {
    id: ShipType.LightFighter,
    name: '輕型戰鬥機',
    description: '基礎戰鬥單位',
    cost: { metal: 3000, crystal: 1000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 20,
    cargoCapacity: 50,
    attack: 50,
    shield: 10,
    armor: 400,
    speed: 12500,
    fuelConsumption: 20,
    storageUsage: 5,
    requirements: { [BuildingType.Shipyard]: 1, [TechnologyType.CombustionDrive]: 1 },
    rapidFire: {
      [ShipType.EspionageProbe]: 5,
      [ShipType.SolarSatellite]: 5
    }
  },
  [ShipType.HeavyFighter]: {
    id: ShipType.HeavyFighter,
    name: '重型戰鬥機',
    description: '強力戰鬥單位',
    cost: { metal: 6000, crystal: 4000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 30,
    cargoCapacity: 100,
    attack: 150,
    shield: 25,
    armor: 1000,
    speed: 10000,
    fuelConsumption: 75,
    storageUsage: 10,
    requirements: { [BuildingType.Shipyard]: 3, [TechnologyType.ImpulseDrive]: 2 },
    rapidFire: {
      [ShipType.SmallCargo]: 3,
      [ShipType.EspionageProbe]: 5,
      [ShipType.SolarSatellite]: 5
    }
  },
  [ShipType.Cruiser]: {
    id: ShipType.Cruiser,
    name: '巡洋艦',
    description: '中型戰艦，剋制輕型戰鬥機',
    cost: { metal: 20000, crystal: 7000, deuterium: 2000, darkMatter: 0, energy: 0 },
    buildTime: 60,
    cargoCapacity: 800,
    attack: 400,
    shield: 50,
    armor: 2700,
    speed: 15000,
    fuelConsumption: 300,
    storageUsage: 15,
    requirements: { [BuildingType.Shipyard]: 5, [TechnologyType.ImpulseDrive]: 4, [TechnologyType.IonTechnology]: 2 },
    rapidFire: {
      [ShipType.LightFighter]: 6,
      [ShipType.EspionageProbe]: 5,
      [ShipType.SolarSatellite]: 5,
      [DefenseType.RocketLauncher]: 10
    }
  },
  [ShipType.Battleship]: {
    id: ShipType.Battleship,
    name: '戰列艦',
    description: '重型戰艦，主力作戰單位',
    cost: { metal: 45000, crystal: 15000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 90,
    cargoCapacity: 1500,
    attack: 1200,
    shield: 300,
    armor: 10000,
    speed: 10000,
    fuelConsumption: 500,
    storageUsage: 25,
    requirements: { [BuildingType.Shipyard]: 7, [TechnologyType.HyperspaceDrive]: 4 },
    rapidFire: {
      [ShipType.EspionageProbe]: 5,
      [ShipType.SolarSatellite]: 5
    }
  },
  [ShipType.Battlecruiser]: {
    id: ShipType.Battlecruiser,
    name: '戰列巡洋艦',
    description: '快速強大的戰鬥艦船，剋制戰列艦和巡洋艦',
    cost: { metal: 30000, crystal: 40000, deuterium: 15000, darkMatter: 0, energy: 0 },
    buildTime: 70,
    cargoCapacity: 750,
    attack: 700,
    shield: 400,
    armor: 7000,
    speed: 10000,
    fuelConsumption: 250,
    storageUsage: 20,
    requirements: {
      [BuildingType.Shipyard]: 8,
      [TechnologyType.HyperspaceDrive]: 5,
      [TechnologyType.HyperspaceTechnology]: 5,
      [TechnologyType.LaserTechnology]: 12
    },
    rapidFire: {
      [ShipType.SmallCargo]: 3,
      [ShipType.LargeCargo]: 3,
      [ShipType.HeavyFighter]: 4,
      [ShipType.Cruiser]: 4,
      [ShipType.Battleship]: 7,
      [ShipType.EspionageProbe]: 5,
      [ShipType.SolarSatellite]: 5
    }
  },
  [ShipType.Bomber]: {
    id: ShipType.Bomber,
    name: '轟炸機',
    description: '專門對付防禦設施的轟炸艦，高效摧毀炮臺',
    cost: { metal: 50000, crystal: 25000, deuterium: 15000, darkMatter: 0, energy: 0 },
    buildTime: 100,
    cargoCapacity: 500,
    attack: 1000,
    shield: 500,
    armor: 7500,
    speed: 4000,
    fuelConsumption: 700,
    storageUsage: 35,
    requirements: {
      [BuildingType.Shipyard]: 8,
      [TechnologyType.ImpulseDrive]: 6,
      [TechnologyType.PlasmaTechnology]: 5
    },
    rapidFire: {
      [ShipType.EspionageProbe]: 5,
      [ShipType.SolarSatellite]: 5,
      [DefenseType.RocketLauncher]: 20,
      [DefenseType.LightLaser]: 20,
      [DefenseType.HeavyLaser]: 10,
      [DefenseType.IonCannon]: 10,
      [DefenseType.GaussCannon]: 5,
      [DefenseType.PlasmaTurret]: 5
    }
  },
  [ShipType.Destroyer]: {
    id: ShipType.Destroyer,
    name: '驅逐艦',
    description: '輕型快速戰艦，擅長護航和反偵察，剋制輕型單位和探測器',
    cost: { metal: 15000, crystal: 5000, deuterium: 1500, darkMatter: 0, energy: 0 },
    buildTime: 45,
    cargoCapacity: 500,
    attack: 250,
    shield: 40,
    armor: 2000,
    speed: 18000,
    fuelConsumption: 200,
    storageUsage: 12,
    requirements: {
      [BuildingType.Shipyard]: 4,
      [TechnologyType.ImpulseDrive]: 3,
      [TechnologyType.ComputerTechnology]: 3
    },
    rapidFire: {
      [ShipType.LightFighter]: 4,
      [ShipType.EspionageProbe]: 10,
      [ShipType.SolarSatellite]: 10,
      [ShipType.SmallCargo]: 2,
      [DefenseType.RocketLauncher]: 5
    }
  },
  [ShipType.SmallCargo]: {
    id: ShipType.SmallCargo,
    name: '小型運輸船',
    description: '運輸資源',
    cost: { metal: 2000, crystal: 2000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 15,
    cargoCapacity: 5000,
    attack: 5,
    shield: 10,
    armor: 400,
    speed: 5000,
    fuelConsumption: 10,
    storageUsage: 10,
    requirements: { [BuildingType.Shipyard]: 2, [TechnologyType.CombustionDrive]: 2 }
  },
  [ShipType.LargeCargo]: {
    id: ShipType.LargeCargo,
    name: '大型運輸船',
    description: '大量運輸資源',
    cost: { metal: 6000, crystal: 6000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 30,
    cargoCapacity: 25000,
    attack: 5,
    shield: 25,
    armor: 1200,
    speed: 7500,
    fuelConsumption: 50,
    storageUsage: 20,
    requirements: { [BuildingType.Shipyard]: 4, [TechnologyType.CombustionDrive]: 6 }
  },
  [ShipType.ColonyShip]: {
    id: ShipType.ColonyShip,
    name: '殖民船',
    description: '建立新殖民地',
    cost: { metal: 10000, crystal: 20000, deuterium: 10000, darkMatter: 0, energy: 0 },
    buildTime: 120,
    cargoCapacity: 7500,
    attack: 50,
    shield: 100,
    armor: 3000,
    speed: 2500,
    fuelConsumption: 1000,
    storageUsage: 40,
    requirements: { [BuildingType.Shipyard]: 4, [TechnologyType.ImpulseDrive]: 3 }
  },
  [ShipType.Recycler]: {
    id: ShipType.Recycler,
    name: '回收船',
    description: '回收廢墟資源',
    cost: { metal: 10000, crystal: 6000, deuterium: 2000, darkMatter: 0, energy: 0 },
    buildTime: 60,
    cargoCapacity: 20000,
    attack: 1,
    shield: 10,
    armor: 1600,
    speed: 2000,
    fuelConsumption: 300,
    storageUsage: 30,
    requirements: { [BuildingType.Shipyard]: 4, [TechnologyType.CombustionDrive]: 6 }
  },
  [ShipType.EspionageProbe]: {
    id: ShipType.EspionageProbe,
    name: '間諜探測器',
    description: '偵察敵方星球',
    cost: { metal: 0, crystal: 1000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 5,
    cargoCapacity: 5,
    attack: 5, // OGame 原版數值（原為 0，探測器應有微弱攻擊力）
    shield: 10, // OGame 原版數值（原為 0）
    armor: 100,
    speed: 100000000,
    fuelConsumption: 1,
    storageUsage: 2,
    requirements: { [BuildingType.Shipyard]: 3, [TechnologyType.CombustionDrive]: 3 }
  },
  [ShipType.SolarSatellite]: {
    id: ShipType.SolarSatellite,
    name: '太陽能衛星',
    description: '提供額外能源，產能受星球溫度影響',
    cost: { metal: 0, crystal: 2000, deuterium: 500, darkMatter: 0, energy: 0 },
    buildTime: 10,
    cargoCapacity: 0,
    attack: 1,
    shield: 1,
    armor: 200,
    speed: 1, // 極低速度，可被艦隊攜帶但非常慢
    fuelConsumption: 0,
    storageUsage: 1,
    requirements: { [BuildingType.Shipyard]: 1 }
  },
  [ShipType.DarkMatterHarvester]: {
    id: ShipType.DarkMatterHarvester,
    name: '暗物質採集船',
    description: '專門用於採集暗物質的特殊飛船',
    cost: { metal: 100000, crystal: 150000, deuterium: 50000, darkMatter: 0, energy: 0 },
    buildTime: 120,
    cargoCapacity: 1000, // 暗物質專用儲存
    attack: 10,
    shield: 50,
    armor: 2000,
    speed: 5000,
    fuelConsumption: 500,
    storageUsage: 50,
    requirements: {
      [BuildingType.Shipyard]: 8,
      [TechnologyType.HyperspaceDrive]: 5,
      [TechnologyType.DarkMatterTechnology]: 1
    }
  },
  [ShipType.Deathstar]: {
    id: ShipType.Deathstar,
    name: '死星',
    description: '終極武器，能夠摧毀整個行星',
    cost: { metal: 50000000, crystal: 40000000, deuterium: 10000000, darkMatter: 20000, energy: 0 },
    buildTime: 600,
    cargoCapacity: 1000000,
    attack: 200000,
    shield: 50000,
    armor: 900000,
    speed: 100,
    fuelConsumption: 1,
    storageUsage: 100,
    requirements: {
      [BuildingType.PlanetDestroyerFactory]: 3,
      [TechnologyType.PlanetDestructionTech]: 7,
      [TechnologyType.HyperspaceDrive]: 7
    },
    rapidFire: {
      // 對所有艦船的快速射擊
      [ShipType.SmallCargo]: 250,
      [ShipType.LargeCargo]: 250,
      [ShipType.LightFighter]: 200,
      [ShipType.HeavyFighter]: 100,
      [ShipType.Cruiser]: 33,
      [ShipType.Battleship]: 30,
      [ShipType.Battlecruiser]: 15,
      [ShipType.Bomber]: 25,
      [ShipType.Destroyer]: 5,
      [ShipType.ColonyShip]: 250,
      [ShipType.Recycler]: 250,
      [ShipType.EspionageProbe]: 1250,
      [ShipType.SolarSatellite]: 1250,
      [ShipType.DarkMatterHarvester]: 50,
      // 對所有防禦設施的快速射擊
      [DefenseType.RocketLauncher]: 200,
      [DefenseType.LightLaser]: 200,
      [DefenseType.HeavyLaser]: 100,
      [DefenseType.GaussCannon]: 50,
      [DefenseType.IonCannon]: 100,
      [DefenseType.PlasmaTurret]: 10,
      [DefenseType.SmallShieldDome]: 1250,
      [DefenseType.LargeShieldDome]: 1250
    }
  }
}

// 防禦設施配置資料
export const DEFENSES: Record<DefenseType, DefenseConfig> = {
  [DefenseType.RocketLauncher]: {
    id: DefenseType.RocketLauncher,
    name: '火箭發射器',
    description: '基礎防禦設施',
    cost: { metal: 2000, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 10,
    attack: 80,
    shield: 20,
    armor: 200,
    requirements: { [BuildingType.Shipyard]: 1 }
  },
  [DefenseType.LightLaser]: {
    id: DefenseType.LightLaser,
    name: '輕型鐳射炮',
    description: '鐳射防禦武器',
    cost: { metal: 1500, crystal: 500, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 12,
    attack: 100,
    shield: 25,
    armor: 200,
    requirements: { [BuildingType.Shipyard]: 2, [TechnologyType.LaserTechnology]: 3 }
  },
  [DefenseType.HeavyLaser]: {
    id: DefenseType.HeavyLaser,
    name: '重型鐳射炮',
    description: '強力鐳射武器',
    cost: { metal: 6000, crystal: 2000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 20,
    attack: 250,
    shield: 100,
    armor: 800,
    requirements: { [BuildingType.Shipyard]: 4, [TechnologyType.LaserTechnology]: 6 }
  },
  [DefenseType.GaussCannon]: {
    id: DefenseType.GaussCannon,
    name: '高斯炮',
    description: '電磁加速武器',
    cost: { metal: 20000, crystal: 15000, deuterium: 2000, darkMatter: 0, energy: 0 },
    buildTime: 35,
    attack: 1100,
    shield: 200,
    armor: 3500,
    requirements: { [BuildingType.Shipyard]: 6, [TechnologyType.EnergyTechnology]: 6 }
  },
  [DefenseType.IonCannon]: {
    id: DefenseType.IonCannon,
    name: '離子炮',
    description: '離子武器系統',
    cost: { metal: 2000, crystal: 6000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 30,
    attack: 150,
    shield: 500,
    armor: 800,
    requirements: { [BuildingType.Shipyard]: 4, [TechnologyType.IonTechnology]: 4 }
  },
  [DefenseType.PlasmaTurret]: {
    id: DefenseType.PlasmaTurret,
    name: '等離子炮臺',
    description: '最強防禦武器',
    cost: { metal: 50000, crystal: 50000, deuterium: 30000, darkMatter: 0, energy: 0 },
    buildTime: 60,
    attack: 3000,
    shield: 300,
    armor: 10000,
    requirements: { [BuildingType.Shipyard]: 8, [TechnologyType.PlasmaTechnology]: 7 }
  },
  [DefenseType.SmallShieldDome]: {
    id: DefenseType.SmallShieldDome,
    name: '小型護盾罩',
    description: '保護星球的能量護盾',
    cost: { metal: 10000, crystal: 10000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 30,
    attack: 1,
    shield: 2000,
    armor: 2000,
    requirements: { [BuildingType.Shipyard]: 6, [TechnologyType.EnergyTechnology]: 3 }
  },
  [DefenseType.LargeShieldDome]: {
    id: DefenseType.LargeShieldDome,
    name: '大型護盾罩',
    description: '強大的星球護盾',
    cost: { metal: 50000, crystal: 50000, deuterium: 0, darkMatter: 0, energy: 0 },
    buildTime: 60,
    attack: 1,
    shield: 10000,
    armor: 10000,
    requirements: { [BuildingType.Shipyard]: 6, [TechnologyType.EnergyTechnology]: 6 }
  },
  [DefenseType.PlanetaryShield]: {
    id: DefenseType.PlanetaryShield,
    name: '行星護盾',
    description: '保護行星免受毀滅攻擊的超級護盾',
    cost: { metal: 2000000, crystal: 2000000, deuterium: 1000000, darkMatter: 50000, energy: 0 },
    buildTime: 180,
    attack: 1,
    shield: 100000,
    armor: 100000,
    requirements: {
      [BuildingType.Shipyard]: 10,
      [TechnologyType.EnergyTechnology]: 10,
      [TechnologyType.HyperspaceTechnology]: 8
    }
  },
  [DefenseType.AntiBallisticMissile]: {
    id: DefenseType.AntiBallisticMissile,
    name: '反彈道導彈',
    description: '攔截敵方導彈，每個可攔截1枚星際導彈',
    cost: { metal: 8000, crystal: 0, deuterium: 2000, darkMatter: 0, energy: 0 },
    buildTime: 20,
    attack: 1,
    shield: 1,
    armor: 800,
    requirements: {
      [BuildingType.MissileSilo]: 2
    }
  },
  [DefenseType.InterplanetaryMissile]: {
    id: DefenseType.InterplanetaryMissile,
    name: '星際導彈',
    description: '可以攻擊其他星球的防禦設施，射程取決於脈衝引擎等級',
    cost: { metal: 12500, crystal: 2500, deuterium: 10000, darkMatter: 0, energy: 0 },
    buildTime: 30,
    attack: 12000,
    shield: 1,
    armor: 1500,
    requirements: {
      [BuildingType.MissileSilo]: 4,
      [TechnologyType.ImpulseDrive]: 1
    }
  }
}

// 軍官配置資料
export const OFFICERS: Record<OfficerType, OfficerConfig> = {
  [OfficerType.Commander]: {
    id: OfficerType.Commander,
    name: '指揮官',
    description: '提升建築速度和管理能力',
    cost: { metal: 0, crystal: 50000, deuterium: 25000, darkMatter: 7000, energy: 0 },
    weeklyMaintenance: { metal: 0, crystal: 5000, deuterium: 2500, darkMatter: 900, energy: 0 },
    benefits: {
      buildingSpeedBonus: 10, // 建築速度 +10%
      additionalBuildQueue: 1, // 額外1個建築佇列
      storageCapacityBonus: 10 // 倉儲容量 +10%
    }
  },
  [OfficerType.Admiral]: {
    id: OfficerType.Admiral,
    name: '上將',
    description: '提升艦隊作戰能力',
    cost: { metal: 50000, crystal: 25000, deuterium: 0, darkMatter: 7000, energy: 0 },
    weeklyMaintenance: { metal: 5000, crystal: 2500, deuterium: 0, darkMatter: 900, energy: 0 },
    benefits: {
      additionalFleetSlots: 2, // 額外2個艦隊槽位
      fleetSpeedBonus: 10, // 艦隊速度 +10%
      fuelConsumptionReduction: 10 // 燃料消耗 -10%
    }
  },
  [OfficerType.Engineer]: {
    id: OfficerType.Engineer,
    name: '工程師',
    description: '增強防禦和能量系統',
    cost: { metal: 40000, crystal: 20000, deuterium: 10000, darkMatter: 7000, energy: 0 },
    weeklyMaintenance: { metal: 4000, crystal: 2000, deuterium: 1000, darkMatter: 900, energy: 0 },
    benefits: {
      defenseBonus: 15, // 防禦力 +15%
      energyProductionBonus: 10, // 電量產出 +10%
      buildingSpeedBonus: 5 // 建築速度 +5%
    }
  },
  [OfficerType.Geologist]: {
    id: OfficerType.Geologist,
    name: '地質學家',
    description: '提高資源開採效率',
    cost: { metal: 30000, crystal: 30000, deuterium: 20000, darkMatter: 7000, energy: 0 },
    weeklyMaintenance: { metal: 3000, crystal: 3000, deuterium: 2000, darkMatter: 900, energy: 0 },
    benefits: {
      resourceProductionBonus: 15, // 資源產量 +15%
      storageCapacityBonus: 10 // 倉儲容量 +10%
    }
  },
  [OfficerType.Technocrat]: {
    id: OfficerType.Technocrat,
    name: '技術專家',
    description: '加快科技研究速度',
    cost: { metal: 20000, crystal: 40000, deuterium: 20000, darkMatter: 7000, energy: 0 },
    weeklyMaintenance: { metal: 2000, crystal: 4000, deuterium: 2000, darkMatter: 900, energy: 0 },
    benefits: {
      researchSpeedBonus: 15 // 研究速度 +15%
    }
  },
  [OfficerType.DarkMatterSpecialist]: {
    id: OfficerType.DarkMatterSpecialist,
    name: '暗物質專家',
    description: '提升暗物質採集效率',
    cost: { metal: 50000, crystal: 100000, deuterium: 50000, darkMatter: 100, energy: 0 },
    weeklyMaintenance: { metal: 5000, crystal: 10000, deuterium: 5000, darkMatter: 10, energy: 0 },
    benefits: {
      darkMatterProductionBonus: 25 // 暗物質產量 +25%
    }
  }
}

// 月球配置
export const MOON_CONFIG = {
  minDebrisField: 100000, // 最小殘骸場 (金屬+晶體) 100k = 1%機率
  baseChance: 0, // 基礎0%機率（每100k殘骸增加1%）
  maxChance: 20, // 最大20%機率（需要2M殘骸）
  chancePerDebris: 100000, // 每10萬資源增加1%機率
  baseFields: 1, // 月球初始空間（OGame規則：初始只有1格）
  lunarBaseFieldsBonus: 30, // 每級月球基地增加的空間（每級+30格，佔用0格）
  minDiameter: 3476, // 最小月球直徑(km)，1%機率時
  maxDiameter: 8944, // 最大月球直徑(km)，20%機率時保證>8000km
  baseDiameter: 3000, // 基礎直徑(km)
  diameterPerChance: 273, // 每1%機率增加的直徑(km)，(8944-3476)/20≈273
  jumpGateCooldown: 3600000 // 跳躍門冷卻時間(ms) = 1小時 (OGame規則)
  // 注：月球資源容量與行星相同（基礎10000），OGame規則允許資源超過容量儲存
}

// 行星配置
export const PLANET_CONFIG = {
  baseSize: 300, // 行星基礎空間
  terraformerSpaceBonus: 30, // 每級地形改造器增加的空間
  terraformingTechSpaceBonus: 30 // 每級地形改造技術增加的空間
}

// 艦隊倉儲配置
export const FLEET_STORAGE_CONFIG = {
  baseStorage: 1000, // 基礎艦隊倉儲
  shipyardBonus: 1000, // 每級造船廠增加的倉儲
  computerTechBonus: 500 // 每級計算機技術全域性增加的倉儲
}

// 外交系統配置
export const DIPLOMATIC_CONFIG = {
  // 好感度範圍
  MIN_REPUTATION: -100,
  MAX_REPUTATION: 100,

  // 關係狀態閾值
  HOSTILE_THRESHOLD: -20, // 低於此值為敵對
  FRIENDLY_THRESHOLD: 20, // 高於此值為友好

  // 各種行為的好感度變化值
  REPUTATION_CHANGES: {
    // 贈送資源（基於資源價值計算）
    GIFT_BASE: 0, // 基礎好感度（移除固定獎勵，完全基於資源量）
    GIFT_PER_1K_RESOURCES: 2, // 每1000資源價值增加2點（提高權重）
    GIFT_MIN_VALUE: 500, // 最小資源價值門檻（低於此值不增加好感度）
    GIFT_MAX_SINGLE: 20, // 單次贈送最大好感度增加

    // 負面行為
    ATTACK: -15, // 攻擊一次
    ATTACK_WIN: -25, // 攻擊並獲勝
    ATTACK_DESTROY_PLANET: -50, // 摧毀星球
    SPY_DETECTED: -5, // 偵查被發現
    SPY_UNDETECTED: -2, // 偵查未被發現
    STEAL_DEBRIS: -10, // 搶奪殘骸（在NPC星球位置）
    DESTROY_FLEET: -3, // 每摧毀1單位戰力扣除好感度

    // 正面行為
    HELP_ATTACK_ENEMY: 15, // 幫助攻擊NPC的敵人
    LONG_PEACE_DECAY: 1, // 長期不攻擊的友好衰減（每週+1）
    TRADE: 5, // 貿易（未來功能預留）

    // 關係網路影響
    ALLY_ATTACKED: -10, // 攻擊盟友導致的好感度降低
    ALLY_HELPED: 5 // 幫助盟友導致的好感度增加
  },

  // 好感度自然變化
  NATURAL_DECAY: {
    ENABLED: true,
    INTERVAL: 7 * 24 * 3600, // 7天（秒）
    TOWARDS_NEUTRAL_RATE: 2 // 每週向中立值迴歸2點
  },

  // 基於關係的行為調整
  BEHAVIOR_MODIFIERS: {
    HOSTILE_ATTACK_MULTIPLIER: 2.0, // 敵對狀態攻擊頻率翻倍
    HOSTILE_SPY_MULTIPLIER: 1.5, // 敵對狀態偵查頻率提高50%
    FRIENDLY_ATTACK_PROBABILITY: 0, // 友好狀態不攻擊
    FRIENDLY_SPY_PROBABILITY: 0.5, // 友好狀態偵查機率降低到50%
    NEUTRAL_ATTACK_PROBABILITY: 1.0, // 中立狀態正常攻擊機率
    NEUTRAL_SPY_PROBABILITY: 1.0 // 中立狀態正常偵查機率
  },

  // NPC主動贈送資源配置
  NPC_GIFT_CONFIG: {
    ENABLED: true,
    MIN_REPUTATION: 60, // NPC對玩家好感度≥60才會贈送
    CHECK_INTERVAL: 4 * 3600, // 每4小時檢查一次（秒）
    GIFT_PROBABILITY: 0.3, // 30%機率贈送（提高頻率）
    // 基礎贈送量（會根據玩家經濟規模動態調整）
    BASE_GIFT_AMOUNT: {
      METAL: { min: 100000, max: 500000 },
      CRYSTAL: { min: 50000, max: 250000 },
      DEUTERIUM: { min: 20000, max: 100000 }
    },
    // 動態贈送配置：根據玩家總產量比例贈送
    DYNAMIC_GIFT: {
      ENABLED: true,
      // 贈送玩家每小時產量的倍數（4-8小時產量）
      PRODUCTION_MULTIPLIER: { min: 4, max: 8 },
      // 最小贈送量（保底）
      MIN_AMOUNT: {
        METAL: 100000,
        CRYSTAL: 50000,
        DEUTERIUM: 20000
      },
      // 最大贈送量（封頂，防止過於誇張）
      MAX_AMOUNT: {
        METAL: 100000000, // 1億
        CRYSTAL: 50000000, // 5千萬
        DEUTERIUM: 20000000 // 2千萬
      }
    }
  },

  // 禮物接受/拒絕配置
  GIFT_ACCEPTANCE_CONFIG: {
    NPC_REJECTION_BASE_PROBABILITY: 0.3, // NPC拒絕禮物的基礎機率（30%）
    NPC_REJECTION_REPUTATION_MODIFIER: 0.01, // 好感度每降低1點，拒絕機率增加1%
    MIN_REJECTION_PROBABILITY: 0.05, // 最小拒絕機率（5%，即使關係很好）
    MAX_REJECTION_PROBABILITY: 0.8, // 最大拒絕機率（80%，即使關係很差）
    GIFT_EXPIRATION_DAYS: 7, // 禮物通知過期天數
    REJECTION_REPUTATION_PENALTY: -5 // 拒絕禮物導致的好感度降低
  },

  // 盟友協防配置
  ALLY_DEFENSE_CONFIG: {
    ENABLED: true,
    // 觸發協防的最低好感度
    MIN_REPUTATION: 70,
    // 檢查間隔（秒）
    CHECK_INTERVAL: 30,
    // 派遣艦隊比例（派出多少比例的可用艦隊）
    FLEET_RATIO: { min: 0.3, max: 0.6 },
    // 協防持續時間（毫秒）- 艦隊在玩家星球駐守多久
    STATION_DURATION: 2 * 60 * 60 * 1000, // 2小時
    // 每個NPC最多同時協防幾個星球
    MAX_CONCURRENT_DEFENSES: 2,
    // 協防觸發條件：來襲艦隊規模最小值
    MIN_INCOMING_FLEET_SIZE: 50,
    // 協防觸發機率（根據好感度調整）
    BASE_DEFENSE_PROBABILITY: 0.7
  },

  // 敵對NPC增強行為配置
  HOSTILE_BEHAVIOR_CONFIG: {
    // 圍攻機制：多個敵對NPC協同攻擊
    SIEGE: {
      ENABLED: true,
      // 觸發圍攻的條件
      MIN_HOSTILE_NPCS: 2, // 至少2個敵對NPC才能觸發圍攻
      TRIGGER_REPUTATION: -50, // 好感度低於此值的NPC可能參與圍攻
      // 圍攻視窗時間（毫秒）- NPC在此時間內協調攻擊
      COORDINATION_WINDOW: 60 * 1000, // 1分鐘內到達
      // 圍攻機率（基礎機率，會根據玩家實力調整）
      BASE_PROBABILITY: 0.3,
      // 圍攻冷卻時間（毫秒）
      COOLDOWN: 30 * 60 * 1000, // 30分鐘
      // 圍攻艦隊比例（每個參與NPC派出的艦隊比例）
      FLEET_RATIO: { min: 0.5, max: 0.8 }
    },

    // 騷擾戰術：小規模持續襲擊
    HARASSMENT: {
      ENABLED: true,
      // 觸發條件：好感度低於此值
      TRIGGER_REPUTATION: -30,
      // 騷擾間隔（秒）- 比正常攻擊更頻繁
      INTERVAL: 120, // 2分鐘
      // 騷擾艦隊規模（小規模）
      FLEET_SIZE_RATIO: { min: 0.1, max: 0.2 },
      // 騷擾機率
      PROBABILITY: 0.4,
      // 騷擾型別權重
      TYPES: {
        spy: 0.4, // 40%機率偵查騷擾
        raid: 0.4, // 40%機率小規模襲擊
        intimidate: 0.2 // 20%機率威懾（派艦隊但不攻擊，消耗玩家注意力）
      }
    },

    // 報復升級：被攻擊次數越多，反擊越猛烈
    REVENGE_ESCALATION: {
      ENABLED: true,
      // 報復等級配置（基於被攻擊次數）
      LEVELS: [
        { attackCount: 1, fleetMultiplier: 1.0, attackInterval: 600, name: 'mild' }, // 輕微：正常反擊
        { attackCount: 3, fleetMultiplier: 1.5, attackInterval: 300, name: 'moderate' }, // 中等：1.5倍艦隊，5分鐘間隔
        { attackCount: 5, fleetMultiplier: 2.0, attackInterval: 180, name: 'severe' }, // 嚴重：2倍艦隊，3分鐘間隔
        { attackCount: 10, fleetMultiplier: 3.0, attackInterval: 60, name: 'extreme' } // 極端：3倍艦隊，1分鐘間隔
      ],
      // 報復記憶時間（毫秒）- 超過此時間後報復等級重置
      MEMORY_DURATION: 7 * 24 * 60 * 60 * 1000, // 7天
      // 報復期間是否呼叫盟友NPC助戰
      CALL_ALLIES: true,
      // 呼叫盟友的機率（報復等級越高機率越大）
      ALLY_CALL_BASE_PROBABILITY: 0.2
    }
  },

  // 中立NPC行為配置
  NEUTRAL_BEHAVIOR_CONFIG: {
    // 有條件貿易：中立NPC可以與玩家進行資源交換
    TRADE: {
      ENABLED: true,
      // 貿易前提：好感度在此區間內的中立NPC才會貿易
      MIN_REPUTATION: -10, // 好感度不能太低
      MAX_REPUTATION: 19, // 好感度不能太高（太高就是友好了）
      // 貿易檢查間隔（秒）
      CHECK_INTERVAL: 1800, // 30分鐘
      // 貿易機率
      PROBABILITY: 0.05,
      // 玩家最多同時保留的貿易提議數量
      MAX_PENDING_OFFERS: 5,
      // 匯率配置：NPC出售資源的匯率
      EXCHANGE_RATES: {
        // 金屬:晶體:重氫 基準比例 3:2:1
        metalToCrystal: 1.5, // 1.5金屬換1晶體
        metalToDeuterium: 3.0, // 3金屬換1重氫
        crystalToDeuterium: 2.0 // 2晶體換1重氫
      },
      // 貿易量配置（基於玩家每小時產量的倍數）
      TRADE_AMOUNT: {
        min: 2, // 最少2小時產量
        max: 6 // 最多6小時產量
      },
      // 貿易手續費（NPC抽取的百分比）
      FEE_PERCENTAGE: 10,
      // 成功貿易增加好感度
      REPUTATION_GAIN: 3
    },

    // 外交搖擺：中立NPC會根據玩家行為傾向友好或敵對
    SWING: {
      ENABLED: true,
      // 搖擺檢查間隔（秒）
      CHECK_INTERVAL: 1800, // 30分鐘
      // 搖擺觸發閾值
      SWING_THRESHOLD: {
        toFriendly: 15, // 好感度達到15時有機率變友好
        toHostile: -15 // 好感度達到-15時有機率變敵對
      },
      // 搖擺機率（基礎機率，根據好感度調整）
      BASE_PROBABILITY: 0.2,
      // 搖擺時的通知（給玩家提示NPC態度變化）
      NOTIFY_PLAYER: true
    },

    // 觀望行為：中立NPC會觀察玩家與其他NPC的互動
    OBSERVE: {
      ENABLED: true,
      // 觀察範圍（同一星系內的NPC）
      SAME_GALAXY_ONLY: true,
      // 玩家攻擊附近NPC時，中立NPC好感度變化
      ATTACK_NEARBY_PENALTY: -3,
      // 玩家幫助附近NPC時，中立NPC好感度變化
      HELP_NEARBY_BONUS: 2
    }
  },

  // 友好NPC增強行為配置
  FRIENDLY_BEHAVIOR_CONFIG: {
    // 情報共享：友好NPC會分享其他NPC的情報
    INTEL_SHARING: {
      ENABLED: true,
      // 觸發條件：好感度達到此值
      MIN_REPUTATION: 50,
      // 分享間隔（秒）
      INTERVAL: 3600, // 1小時
      // 分享機率
      PROBABILITY: 0.4,
      // 情報型別
      INTEL_TYPES: {
        enemyFleet: 0.4, // 40%機率分享敵對NPC艦隊資訊
        enemyResources: 0.3, // 30%機率分享敵對NPC資源資訊
        enemyMovement: 0.3 // 30%機率分享敵對NPC艦隊動向
      }
    },

    // 聯合攻擊邀請：友好NPC可能邀請玩家一起攻擊敵對NPC
    JOINT_ATTACK: {
      ENABLED: true,
      // 觸發條件：好感度達到此值
      MIN_REPUTATION: 70,
      // 邀請間隔（秒）
      INTERVAL: 7200, // 2小時
      // 邀請機率
      PROBABILITY: 0.25,
      // 目標選擇：共同敵人優先
      PREFER_COMMON_ENEMY: true,
      // NPC提供的艦隊比例
      NPC_FLEET_RATIO: { min: 0.3, max: 0.5 },
      // 戰利品分配：玩家獲得的比例
      PLAYER_LOOT_RATIO: 0.7,
      // 聯合攻擊成功增加好感度
      SUCCESS_REPUTATION_GAIN: 10,
      // 拒絕邀請減少好感度
      DECLINE_REPUTATION_PENALTY: -5
    },

    // 資源援助：友好NPC在玩家困難時提供援助
    RESOURCE_AID: {
      ENABLED: true,
      // 觸發條件：好感度達到此值
      MIN_REPUTATION: 60,
      // 檢查間隔（秒）
      CHECK_INTERVAL: 1800, // 30分鐘
      // 觸發條件：玩家資源低於產量的N小時
      TRIGGER_LOW_RESOURCES_HOURS: 2,
      // 援助量（玩家N小時產量）
      AID_AMOUNT_HOURS: 4,
      // 援助機率
      PROBABILITY: 0.5
    }
  },

  // NPC聯盟系統配置
  NPC_ALLIANCE_CONFIG: {
    ENABLED: true,

    // NPC之間關係初始化
    INTER_NPC_RELATIONS: {
      // 初始化方式：random（隨機）、distance（基於距離）、type（基於AI型別）
      INIT_MODE: 'mixed',
      // 同一星系內NPC更容易成為盟友
      SAME_GALAXY_ALLY_BONUS: 0.3,
      // AI型別相容性（決定NPC之間關係）
      TYPE_COMPATIBILITY: {
        // 侵略型與防守型互為敵人
        aggressive_defensive: -0.8,
        // 商人型與任何型別都友好
        trader_any: 0.5,
        // 擴張型互相競爭
        expansionist_expansionist: -0.3,
        // 平衡型保持中立
        balanced_any: 0
      }
    },

    // 連坐效應配置
    GUILT_BY_ASSOCIATION: {
      ENABLED: true,
      // 攻擊NPC時，其盟友好感度降低
      ALLY_REPUTATION_PENALTY: -10,
      // 幫助NPC時，其盟友好感度增加
      ALLY_REPUTATION_BONUS: 5,
      // 盟友關係強度影響（越緊密影響越大）
      STRENGTH_MULTIPLIER: true,
      // 最大傳播深度（防止無限傳播）
      MAX_PROPAGATION_DEPTH: 2
    },

    // NPC盟友互助
    MUTUAL_DEFENSE: {
      ENABLED: true,
      // 盟友被攻擊時的響應機率
      RESPONSE_PROBABILITY: 0.5,
      // 響應艦隊比例
      FLEET_RATIO: { min: 0.2, max: 0.4 },
      // 響應冷卻時間（秒）
      COOLDOWN: 1800 // 30分鐘
    },

    // NPC之間的資源共享
    RESOURCE_SHARING: {
      ENABLED: true,
      // 共享間隔（秒）
      INTERVAL: 7200, // 2小時
      // 共享比例
      SHARE_RATIO: 0.1 // 共享10%資源
    }
  }
}

// 礦脈儲量配置
export const ORE_DEPOSIT_CONFIG = {
  // 基礎儲量（單位：資源量）- 大幅提升以支援後期發展
  BASE_DEPOSITS: {
    metal: 500_000_000_0, // 50億金屬
    crystal: 300_000_000_0, // 30億晶體
    deuterium: 150_000_000_0 // 15億重氫
  },
  // 位置係數（位置1-15），影響資源分佈
  // 內圈(1-4)晶體多，中圈(5-10)均衡，外圈(11-15)重氫多
  POSITION_MULTIPLIERS: {
    metal: [0.8, 0.85, 0.9, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75],
    crystal: [1.3, 1.25, 1.2, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7],
    deuterium: [0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7]
  },
  // 銀河系係數（每個銀河系增加5%儲量）
  GALAXY_MULTIPLIER: 0.05,
  // 隨機浮動範圍（±20%）
  RANDOM_VARIANCE: 0.2,
  // 警告閾值（低於10%時顯示警告）
  WARNING_THRESHOLD: 0.1,
  // 產量衰減開始閾值（低於5%時產量開始衰減）
  DECAY_START_THRESHOLD: 0.05,
  // 礦脈耗盡後的基礎產量保底（20%產量，確保遊戲可繼續）
  MIN_PRODUCTION_EFFICIENCY: 0.2,
  // 礦脈恢復配置
  REGENERATION: {
    ENABLED: true,
    // 每小時恢復初始儲量的百分比（1% = 每小時恢復1%，約4.2天完全恢復）
    RATE_PER_HOUR: 0.01,
    // 最大恢復到初始儲量的百分比（100表示可以完全恢復）%
    MAX_PERCENTAGE: 1.0
  }
}

// 探險區域配置 - 大幅提升獎勵，降低空手而歸機率
export const EXPEDITION_ZONES: Record<ExpeditionZone, ExpeditionZoneConfig> = {
  [ExpeditionZone.NearSpace]: {
    id: ExpeditionZone.NearSpace,
    requiredTechLevel: 0, // 無需求
    flightTimeMultiplier: 1.0,
    resourceMultiplier: 1.5, // 1.0 -> 1.5
    darkMatterMultiplier: 1.5, // 1.0 -> 1.5
    fleetFindMultiplier: 1.5, // 1.0 -> 1.5
    dangerMultiplier: 0.5, // 低危險
    probabilities: {
      resources: 40, // 35 -> 40 高機率發現資源
      darkMatter: 12, // 8 -> 12
      fleet: 15, // 10 -> 15
      pirates: 5, // 7 -> 5 低海盜
      aliens: 3, // 5 -> 3 低外星人
      nothing: 25 // 35 -> 25 降低空手而歸
    }
  },
  [ExpeditionZone.DeepSpace]: {
    id: ExpeditionZone.DeepSpace,
    requiredTechLevel: 4, // 需要天體物理學4級
    flightTimeMultiplier: 1.5,
    resourceMultiplier: 2.5, // 1.5 -> 2.5
    darkMatterMultiplier: 2.5, // 1.5 -> 2.5
    fleetFindMultiplier: 2.0, // 1.5 -> 2.0
    dangerMultiplier: 1.0, // 標準危險
    probabilities: {
      resources: 35, // 30 -> 35
      darkMatter: 15, // 10 -> 15
      fleet: 18, // 15 -> 18
      pirates: 12, // 15 -> 12
      aliens: 8, // 10 -> 8
      nothing: 12 // 20 -> 12
    }
  },
  [ExpeditionZone.UnchartedSpace]: {
    id: ExpeditionZone.UnchartedSpace,
    requiredTechLevel: 8, // 需要天體物理學8級
    flightTimeMultiplier: 2.0,
    resourceMultiplier: 4.0, // 2.5 -> 4.0
    darkMatterMultiplier: 3.5, // 2.0 -> 3.5
    fleetFindMultiplier: 3.0, // 2.0 -> 3.0
    dangerMultiplier: 1.5, // 高危險
    probabilities: {
      resources: 32, // 25 -> 32
      darkMatter: 18, // 12 -> 18
      fleet: 22, // 18 -> 22
      pirates: 12, // 18 -> 12
      aliens: 10, // 15 -> 10
      nothing: 6 // 12 -> 6
    }
  },
  [ExpeditionZone.DangerousNebula]: {
    id: ExpeditionZone.DangerousNebula,
    requiredTechLevel: 12, // 需要天體物理學12級
    flightTimeMultiplier: 3.0,
    resourceMultiplier: 6.0, // 4.0 -> 6.0
    darkMatterMultiplier: 5.0, // 3.0 -> 5.0
    fleetFindMultiplier: 5.0, // 3.0 -> 5.0
    dangerMultiplier: 2.5, // 極高危險
    probabilities: {
      resources: 30, // 20 -> 30
      darkMatter: 20, // 15 -> 20
      fleet: 25, // 20 -> 25
      pirates: 12, // 20 -> 12
      aliens: 10, // 20 -> 10
      nothing: 3 // 5 -> 3 極少空手而歸
    }
  }
}
