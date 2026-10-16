# OGame 立绘画风指南（AI 生图关键词）

> 调研自官方 OGame wiki（ogame.fandom.com）各单位页面图片，13 种舰船已逐张目检官方原画确认剪影；防御/建筑/军官关键词依据官方游戏内图标（2006 年以来未变）提炼。英文关键词直接拼进生图 prompt。

## 统一美术指导（Art Direction，拼进每个 prompt）

Deep-space black background with lavender-purple glowing accents. Realistic sci-fi concept art, single centered subject, clean recognizable silhouette, no text, no watermark, cinematic rim lighting.

## Ships

- lightFighter: 小巧单座三角翼战机，短小机身，轻灰配色 — small delta-wing single-seat fighter, short compact fuselage, light gray hull
- heavyFighter: 更厚重的双发装甲战机，前掠翼，深色船体 — bulky twin-engine armored fighter, forward-swept wings, dark metal hull
- cruiser: 细长箭头形高速护卫舰，尾部发光引擎条 — long arrowhead-shaped fast frigate, glowing engine bar at stern
- battleship: 修长重装甲战列舰，舰桥塔楼，多层甲板结构 — elongated heavily-armored warship, command bridge tower, layered deck structures
- battlecruiser: 敦实炮舰，侧舷突出炮塔舱，尾部发光引擎 — stocky gunship with protruding side turret pods, glowing rear engines
- bomber: 肥硕圆滚轰炸机，船艏发光引擎缝，厚重深色装甲 — fat bulbous bomber hull, glowing engine slit at bow, heavy dark armor
- destroyer: 细长标枪形无畏舰，巨型脊柱主炮向前突出 — long lance-like dreadnought, huge spinal cannon protruding forward
- smallCargo: 小型圆头穿梭运输机，球形驾驶舱，两侧引擎舱 — small rounded cargo shuttle, bulbous cockpit, side engine pods
- largeCargo: 大型装甲货船，分节集装箱船体，尾部舰桥 — large armored freighter, segmented container hull, rear bridge superstructure
- colonyShip: 巨型方舟殖民船，顶部发光绿色穹顶 — massive ark colony ship, glowing green dome on top
- recycler: 矮壮打捞拖船，船艏机械爪，周围漂浮残骸 — squat salvage tug with front claw arms, floating debris around
- espionageProbe: 小型带刺球形无人机，细长天线 — tiny spiky spherical drone, thin antenna spikes
- solarSatellite: 经典卫星，四片太阳能板翼，中央桁架 — classic satellite with four solar panel wings, central truss
- darkMatterHarvester: 暗物质采集船（原创），深色船体＋发光紫色收容舱 — dark-hulled harvester ship, glowing violet containment pods, claw collectors
- deathstar: 月球大小的灰色球形战斗站，表面环形山炮口 — colossal spherical gray battlestation, moon-sized, crater dish on surface

## Defenses

- rocketLauncher: 地面火箭炮塔，旋转底座上多管发射筒斜指天空 — ground rocket turret, cluster of angled launch tubes on rotating base
- lightLaser: 矮壮穹顶激光炮塔，单根短炮管 — squat dome laser turret, single short barrel
- heavyLaser: 高大装甲激光炮塔，修长双联炮管 — tall armored laser turret, long twin barrels
- gaussCannon: 重型电磁轨道炮，炮管带线圈环，坚固底座 — heavy railgun, long barrel with electromagnetic coil rings, sturdy mount
- ionCannon: 离子炮塔，炮口发光蓝色离子球 — ion cannon turret, glowing blue ion orb at muzzle
- plasmaTurret: 等离子炮塔，基座上托着巨大发光等离子球 — plasma turret, huge glowing plasma sphere on pedestal
- smallShieldDome: 小型护盾发生器，撑起半球形蓝色能量罩 — small shield generator under hemispherical blue energy dome
- largeShieldDome: 大型护盾罩，更大穹顶覆盖基地 — large shield dome, bigger hemispherical energy dome over base
- antiBallisticMissile: 发射架上的小型拦截导弹 — small interceptor missile on ground launch rack
- interplanetaryMissile: 从发射井升起的细长大型洲际导弹 — tall slender interplanetary missile rising from silo hatch
- planetaryShield: 行星护盾（原创），巨型发生器塔＋覆盖行星的能量穹顶 — giant generator tower projecting planet-wide energy dome

## Buildings

- metalMine: 露天矿场，井架高塔＋烟囱，工业风 — open-pit mine with headframe tower and smokestacks, industrial
- crystalMine: 晶体矿洞精炼厂，发光水晶簇 — crystal refinery with glowing crystal formations
- deuteriumSynthesizer: 化工厂，球形储罐群＋管道 — chemical plant with spherical storage tanks and pipes
- solarPlant: 倾斜太阳能板阵列 — field of tilted solar panel arrays
- fusionReactor: 穹顶反应堆建筑，核心发光 — domed reactor building with glowing core
- roboticsFactory: 机器人工厂，机械臂＋传送带 — industrial factory with robotic arms and conveyor lines
- naniteFactory: 未来风纳米工厂，发光六边形结构 — futuristic nano facility, glowing hexagonal structures
- shipyard: 轨道船坞，龙门支架＋在建舰体 — orbital drydock gantry with ship under construction
- metalStorage: 金属仓库，矮胖圆柱仓群 — squat cylindrical metal silos bunker
- crystalStorage: 晶体仓库，多面体水晶仓 — faceted crystal storage silo
- deuteriumTank: 重氢罐区，一排球形压力罐 — row of spherical pressurized deuterium tanks
- researchLab: 科研综合楼，卫星天线塔 — research complex with satellite dish antenna tower
- terraformer: 地形改造器，巨型穹顶阵列＋大气处理塔 — massive terraforming dome array with atmospheric processor towers
- allianceDepot: 机库（按 config 画机库），大开门飞机库 — large aircraft hangar with open doors
- missileSilo: 导弹发射井，混凝土井口＋弹头露出 — concrete missile silo hatch with missile nose visible
- lunarBase: 月球基地，月面穹顶舱＋居住模块 — moon surface base with habitat domes and modules
- sensorPhalanx: 感应阵列，高耸雷达塔＋碟形天线群 — tall sensor tower with radar dish array
- jumpGate: 跳跃门，巨型发光传送门圆环 — giant glowing portal ring, stargate-like
- darkMatterCollector: 暗物质收集器（原创），地面收集阵列＋紫色能量柱 — ground collector array with violet energy beams
- darkMatterTank: 暗物质罐（原创），黑色收容罐＋紫色发光缝 — dark containment tank with violet glowing seams
- geoResearchStation: 地质研究站（原创），野外考察站＋钻探设备 — field research outpost with drilling equipment
- deepDrillingFacility: 深层钻探设施（原创），高耸钻井塔＋深井 — towering drilling rig over deep borehole
- planetDestroyerFactory: 行星毁灭者工厂（原创），巨型武器工厂＋轨道炮骨架 — massive weapons factory with orbital cannon frame
- university: 大学（原创），未来风学院建筑群＋穹顶图书馆 — futuristic academy campus with domed library

## Officers

- commander: 指挥官，严肃军官制服＋军帽，肖像 — stern military officer portrait, uniform with peaked cap and medals
- admiral: 上将，海军风白色金边制服，肖像 — admiral portrait, white naval uniform with gold trim
- engineer: 工程师，工装＋安全帽＋工具，肖像 — engineer portrait, work gear with hardhat and tools
- geologist: 地质学家，野外考察装＋地质锤，肖像 — geologist portrait, field gear with rock hammer
- technocrat: 技术专家，白大褂科学家＋数据植入体，肖像 — technocrat portrait, scientist in lab coat with tech implants
- darkMatterSpecialist: 暗物质专家（原创），兜帽研究员＋紫色暗物质辉光，肖像 — hooded researcher portrait with violet dark-matter glow
