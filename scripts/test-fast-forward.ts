/**
 * 快转冒烟测试：建造队列一次结清 + 资源按 gameSpeed 倍率增长
 * 运行: npx esbuild scripts/test-fast-forward.ts --bundle --platform=node --format=cjs --alias:@=./src --outfile=/tmp/test-ff.cjs && node /tmp/test-ff.cjs
 */
import { initializePlayer, processGameUpdate } from '@/logic/gameLogic'
import { createInitialPlanet } from '@/logic/planetLogic'
import { BuildingType } from '@/types/game'
import type { Player, BuildQueueItem } from '@/types/game'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail: string = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

// 新玩家 + 一个 1 小时后完成的金属矿建造队列项
// 预置 1 级太阳能电站，否则电力不足会导致产量归零（符合 OGame 规则）
function makePlayerWithBuildQueue(now: number): Player {
  const player = initializePlayer('ff-test', 'FFTester')
  const planet = createInitialPlanet('ff-test', 'FF Home')
  planet.lastUpdate = now
  planet.buildings[BuildingType.SolarPlant] = 1
  planet.buildings[BuildingType.MetalStorage] = 10 // 容量 10000*2^10，避免 100x 产量撞上限导致对照失真
  const item: BuildQueueItem = {
    id: 'ff-build-1',
    type: 'building',
    itemType: BuildingType.MetalMine,
    targetLevel: 1,
    startTime: now,
    endTime: now + 3600 * 1000 // 1 小时后完成
  }
  planet.buildQueue = [item]
  player.planets = [planet]
  return player
}

// 模拟 App.vue timeSkip 的核心：processGameUpdate(player, now+8h, gameSpeed, 聚合通知, 聚合解锁)
function skip(player: Player, now: number, hours: number, gameSpeed: number) {
  const notifications: string[] = []
  let unlockCount = 0
  const result = processGameUpdate(
    player,
    now + hours * 3600 * 1000,
    gameSpeed,
    (type, itemType, level) => { notifications.push(`${type}:${String(itemType)}:Lv${level}`) },
    items => { unlockCount += items.length }
  )
  player.researchQueue = result.updatedResearchQueue
  return { notifications, unlockCount }
}

const now = Date.now()

// T1: gameSpeed=100，快转 8 小时
console.log('T1: gameSpeed=100，快转 8h')
const p100 = makePlayerWithBuildQueue(now)
const metalBefore100 = p100.planets[0].resources.metal
const r100 = skip(p100, now, 8, 100)
const metalGain100 = p100.planets[0].resources.metal - metalBefore100
check('金属矿升级到 1 级', p100.planets[0].buildings[BuildingType.MetalMine] === 1, `level=${p100.planets[0].buildings[BuildingType.MetalMine]}`)
check('建造队列清空', p100.planets[0].buildQueue.length === 0)
check('收到建造完成通知', r100.notifications.some(n => n.startsWith('building:')), r100.notifications.join(','))
check('金属资源增长', metalGain100 > 0, `+${metalGain100}`)

// T2: gameSpeed=1 对照组
console.log('T2: gameSpeed=1，快转 8h（对照）')
const p1 = makePlayerWithBuildQueue(now)
const metalBefore1 = p1.planets[0].resources.metal
skip(p1, now, 8, 1)
const metalGain1 = p1.planets[0].resources.metal - metalBefore1
check('金属矿升级到 1 级', p1.planets[0].buildings[BuildingType.MetalMine] === 1)
check('金属资源增长', metalGain1 > 0, `+${metalGain1}`)

// T3: 速度倍率生效（100x 增量应远大于 1x；即使触及仓库上限也应保持量级差）
console.log('T3: 倍率对比')
check('100x 金属增量 >> 1x 金属增量', metalGain100 > metalGain1 * 10, `100x=+${metalGain100}, 1x=+${metalGain1}`)

console.log(`\n${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
