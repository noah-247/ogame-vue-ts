# OGame 立繪畫風指南（AI 生圖關鍵詞）

> 調研自官方 OGame wiki（ogame.fandom.com）各單位頁面圖片，13 種艦船已逐張目檢官方原畫確認剪影；防禦/建築/軍官關鍵詞依據官方遊戲內圖示（2006 年以來未變）提煉。英文關鍵詞直接拼進生圖 prompt。

## 統一美術指導（Art Direction，拼進每個 prompt）

Deep-space black background with lavender-purple glowing accents. Realistic sci-fi concept art, single centered subject, clean recognizable silhouette, no text, no watermark, cinematic rim lighting.

## Ships

- lightFighter: 小巧單座三角翼戰機，短小機身，輕灰配色 — small delta-wing single-seat fighter, short compact fuselage, light gray hull
- heavyFighter: 更厚重的雙發裝甲戰機，前掠翼，深色船體 — bulky twin-engine armored fighter, forward-swept wings, dark metal hull
- cruiser: 細長箭頭形高速護衛艦，尾部發光引擎條 — long arrowhead-shaped fast frigate, glowing engine bar at stern
- battleship: 修長重灌甲戰列艦，艦橋塔樓，多層甲板結構 — elongated heavily-armored warship, command bridge tower, layered deck structures
- battlecruiser: 敦實炮艦，側舷突出炮塔艙，尾部發光引擎 — stocky gunship with protruding side turret pods, glowing rear engines
- bomber: 肥碩圓滾轟炸機，船艏發光引擎縫，厚重深色裝甲 — fat bulbous bomber hull, glowing engine slit at bow, heavy dark armor
- destroyer: 細長標槍形無畏艦，巨型脊柱主炮向前突出 — long lance-like dreadnought, huge spinal cannon protruding forward
- smallCargo: 小型圓頭穿梭運輸機，球形駕駛艙，兩側引擎艙 — small rounded cargo shuttle, bulbous cockpit, side engine pods
- largeCargo: 大型裝甲貨船，分節集裝箱船體，尾部艦橋 — large armored freighter, segmented container hull, rear bridge superstructure
- colonyShip: 巨型方舟殖民船，頂部發光綠色穹頂 — massive ark colony ship, glowing green dome on top
- recycler: 矮壯打撈拖船，船艏機械爪，周圍漂浮殘骸 — squat salvage tug with front claw arms, floating debris around
- espionageProbe: 小型帶刺球形無人機，細長天線 — tiny spiky spherical drone, thin antenna spikes
- solarSatellite: 經典衛星，四片太陽能板翼，中央桁架 — classic satellite with four solar panel wings, central truss
- darkMatterHarvester: 暗物質採集船（原創），深色船體＋發光紫色收容艙 — dark-hulled harvester ship, glowing violet containment pods, claw collectors
- deathstar: 月球大小的灰色球形戰鬥站，表面環形山炮口 — colossal spherical gray battlestation, moon-sized, crater dish on surface

## Defenses

- rocketLauncher: 地面火箭炮塔，旋轉底座上多管發射筒斜指天空 — ground rocket turret, cluster of angled launch tubes on rotating base
- lightLaser: 矮壯穹頂鐳射炮塔，單根短炮管 — squat dome laser turret, single short barrel
- heavyLaser: 高大裝甲鐳射炮塔，修長雙聯炮管 — tall armored laser turret, long twin barrels
- gaussCannon: 重型電磁軌道炮，炮管帶線圈環，堅固底座 — heavy railgun, long barrel with electromagnetic coil rings, sturdy mount
- ionCannon: 離子炮塔，炮口發光藍色離子球 — ion cannon turret, glowing blue ion orb at muzzle
- plasmaTurret: 等離子炮塔，基座上託著巨大發光等離子球 — plasma turret, huge glowing plasma sphere on pedestal
- smallShieldDome: 小型護盾發生器，撐起半球形藍色能量罩 — small shield generator under hemispherical blue energy dome
- largeShieldDome: 大型護盾罩，更大穹頂覆蓋基地 — large shield dome, bigger hemispherical energy dome over base
- antiBallisticMissile: 發射架上的小型攔截導彈 — small interceptor missile on ground launch rack
- interplanetaryMissile: 從發射井升起的細長大型洲際導彈 — tall slender interplanetary missile rising from silo hatch
- planetaryShield: 行星護盾（原創），巨型發生器塔＋覆蓋行星的能量穹頂 — giant generator tower projecting planet-wide energy dome

## Buildings

- metalMine: 露天礦場，井架高塔＋煙囪，工業風 — open-pit mine with headframe tower and smokestacks, industrial
- crystalMine: 晶體礦洞精煉廠，發光水晶簇 — crystal refinery with glowing crystal formations
- deuteriumSynthesizer: 化工廠，球形儲罐群＋管道 — chemical plant with spherical storage tanks and pipes
- solarPlant: 傾斜太陽能板陣列 — field of tilted solar panel arrays
- fusionReactor: 穹頂反應堆建築，核心發光 — domed reactor building with glowing core
- roboticsFactory: 機器人工廠，機械臂＋傳送帶 — industrial factory with robotic arms and conveyor lines
- naniteFactory: 未來風奈米工廠，發光六邊形結構 — futuristic nano facility, glowing hexagonal structures
- shipyard: 軌道船塢，龍門支架＋在建艦體 — orbital drydock gantry with ship under construction
- metalStorage: 金屬倉庫，矮胖圓柱倉群 — squat cylindrical metal silos bunker
- crystalStorage: 晶體倉庫，多面體水晶倉 — faceted crystal storage silo
- deuteriumTank: 重氫罐區，一排球形壓力罐 — row of spherical pressurized deuterium tanks
- researchLab: 科研綜合樓，衛星天線塔 — research complex with satellite dish antenna tower
- terraformer: 地形改造器，巨型穹頂陣列＋大氣處理塔 — massive terraforming dome array with atmospheric processor towers
- allianceDepot: 機庫（按 config 畫機庫），大開門飛機庫 — large aircraft hangar with open doors
- missileSilo: 導彈發射井，混凝土井口＋彈頭露出 — concrete missile silo hatch with missile nose visible
- lunarBase: 月球基地，月面穹頂艙＋居住模組 — moon surface base with habitat domes and modules
- sensorPhalanx: 感應陣列，高聳雷達塔＋碟形天線群 — tall sensor tower with radar dish array
- jumpGate: 跳躍門，巨型發光傳送門圓環 — giant glowing portal ring, stargate-like
- darkMatterCollector: 暗物質收集器（原創），地面收集陣列＋紫色能量柱 — ground collector array with violet energy beams
- darkMatterTank: 暗物質罐（原創），黑色收容罐＋紫色發光縫 — dark containment tank with violet glowing seams
- geoResearchStation: 地質研究站（原創），野外考察站＋鑽探裝置 — field research outpost with drilling equipment
- deepDrillingFacility: 深層鑽探設施（原創），高聳鑽井塔＋深井 — towering drilling rig over deep borehole
- planetDestroyerFactory: 行星毀滅者工廠（原創），巨型武器工廠＋軌道炮骨架 — massive weapons factory with orbital cannon frame
- university: 大學（原創），未來風學院建築群＋穹頂圖書館 — futuristic academy campus with domed library

## Officers

- commander: 指揮官，嚴肅軍官制服＋軍帽，肖像 — stern military officer portrait, uniform with peaked cap and medals
- admiral: 上將，海軍風白色金邊制服，肖像 — admiral portrait, white naval uniform with gold trim
- engineer: 工程師，工裝＋安全帽＋工具，肖像 — engineer portrait, work gear with hardhat and tools
- geologist: 地質學家，野外考察裝＋地質錘，肖像 — geologist portrait, field gear with rock hammer
- technocrat: 技術專家，白大褂科學家＋資料植入體，肖像 — technocrat portrait, scientist in lab coat with tech implants
- darkMatterSpecialist: 暗物質專家（原創），兜帽研究員＋紫色暗物質輝光，肖像 — hooded researcher portrait with violet dark-matter glow
