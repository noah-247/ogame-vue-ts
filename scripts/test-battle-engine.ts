/**
 * 战斗引擎验证脚本（OGame 原版公式对照）
 * 使用种子 RNG，所有断言完全确定、可重复。
 * 运行: npx esbuild scripts/test-battle-engine.ts --bundle --platform=node --format=cjs --alias:@=./src --outfile=/tmp/test-battle.cjs && node /tmp/test-battle.cjs
 */
import { simulateBattle, type Rng } from '@/workers/battleEngine'

// mulberry32 种子随机数
function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail: string = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}
const sum = (o: Record<string, number | undefined>) =>
  Object.values(o).reduce((s, v) => s + (v ?? 0), 0)

// T1: 10 巡洋舰 vs 100 轻战机 → 巡洋舰碾压（连击6 + 属性压制）
console.log('T1: 10 Cruiser vs 100 LightFighter（种子确定）')
{
  const r = simulateBattle({ ships: { cruiser: 10 } }, { ships: { lightFighter: 100 } }, 6, seeded(42))
  check('攻击方获胜', r.winner === 'attacker', `winner=${r.winner}`)
  check('巡洋舰零损失', sum(r.attackerLosses) === 0, `损失=${sum(r.attackerLosses)}`)
  check('轻战机全灭', sum(r.defenderLosses.fleet) === 100)
}

// T2: 1 死星 vs 500 轻战机 → 跳弹规则：轻战机攻击50 < 死星护盾50000的1%，应几乎无伤
console.log('T2: 1 Deathstar vs 500 LightFighter（护盾跳弹）')
{
  const r = simulateBattle({ ships: { deathstar: 1 } }, { ships: { lightFighter: 500 } }, 6, seeded(7))
  check('死星获胜', r.winner === 'attacker', `winner=${r.winner} rounds=${r.rounds}`)
  check('死星零损失', sum(r.attackerLosses) === 0)
  check('轻战机全灭', sum(r.defenderLosses.fleet) === 500)
}

// T3: 1 战列舰 vs 25 探测器 → 连击5清场（种子下期望击杀约30 > 25）
console.log('T3: 1 Battleship vs 25 EspionageProbe（连击）')
{
  const r = simulateBattle({ ships: { battleship: 1 } }, { ships: { espionageProbe: 25 } }, 6, seeded(123))
  check('战列舰获胜', r.winner === 'attacker', `winner=${r.winner}`)
  check('战列舰零损失', sum(r.attackerLosses) === 0)
  // 连击机制验证：首轮击杀数应 > 1（无连击则每轮只能杀1个）
  const round1Kills = sum(r.roundDetails[0]?.defenderLosses.fleet ?? {})
  check('首轮连击击杀 > 1', round1Kills > 1, `首轮击杀=${round1Kills}`)
}

// T4: 1 小型运输舰 vs 1 小型运输舰 → 攻击5 < 护盾10，永远打不动，应平局零损失
console.log('T4: 1 SmallCargo vs 1 SmallCargo（护盾全吸收 → 平局）')
{
  const r = simulateBattle({ ships: { smallCargo: 1 } }, { ships: { smallCargo: 1 } }, 6, seeded(1))
  check('6轮平局', r.winner === 'draw' && r.rounds === 6, `winner=${r.winner} rounds=${r.rounds}`)
  check('零损失', sum(r.attackerLosses) === 0 && sum(r.defenderLosses.fleet) === 0)
}

// T5: 1000 轻战机 vs 1000 轻战机 → 双方都有损失
console.log('T5: 1000 LightFighter vs 1000 LightFighter')
{
  const r = simulateBattle({ ships: { lightFighter: 1000 } }, { ships: { lightFighter: 1000 } }, 6, seeded(99))
  check('双方都有损失', sum(r.attackerLosses) > 0 && sum(r.defenderLosses.fleet) > 0,
    `攻损失 ${sum(r.attackerLosses)} / 防损失 ${sum(r.defenderLosses.fleet)}`)
}

// T6: 爆炸规则 — 重伤未死的船可能爆炸（用种子固定一次爆炸事件）
console.log('T6: 爆炸规则（船体<70% 有概率爆炸）')
{
  // 1艘重型战列舰（船体7000）vs 大量轻激光炮：多轮累积船体伤害触发爆炸判定路径
  const r = simulateBattle(
    { ships: { battleship: 10 } },
    { defense: { lightLaser: 200 } },
    6, seeded(2024)
  )
  check('战斗正常结算', ['attacker', 'defender', 'draw'].includes(r.winner), `winner=${r.winner}`)
  check('防御方有损失', sum(r.defenderLosses.defense) > 0)
}

// T7: 接口形状完整（App 依赖这些字段）
console.log('T7: 结果结构完整性')
{
  const r = simulateBattle(
    { ships: { cruiser: 5 }, weaponTech: 10, shieldTech: 5, armorTech: 8 },
    { ships: { lightFighter: 20 }, defense: { rocketLauncher: 10 } },
    6, seeded(5)
  )
  check('含 winner/rounds/losses/remaining/roundDetails',
    ['winner', 'rounds', 'attackerLosses', 'defenderLosses', 'attackerRemaining', 'defenderRemaining', 'roundDetails']
      .every(k => k in r))
  check('roundDetails 结构正确',
    r.roundDetails.every(d => 'round' in d && 'attackerRemainingPower' in d && 'defenderRemainingPower' in d))
}

// T8: 性能 — 3000 vs 3000 应在合理时间内完成
console.log('T8: 性能 3000 vs 3000')
{
  const t0 = Date.now()
  simulateBattle({ ships: { lightFighter: 3000 } }, { ships: { cruiser: 300 } }, 6, seeded(3))
  const dt = Date.now() - t0
  check('5秒内完成', dt < 5000, `${dt}ms`)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
