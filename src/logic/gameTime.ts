/**
 * 游戏虚拟时间（BLK-1 修复）。
 *
 * gameNow = Date.now() + timeOffset。时间快转只增加 timeOffset，
 * 游戏时钟之后随真实时间持续推进：不会冻结（旧 Math.max 方案的 bug）、
 * 不会倒退（重复快转不再回拨 gameTime）。
 *
 * 所有游戏内时间戳（建造/研究/舰船/拆除队列的 startTime/endTime、
 * 舰队与导弹任务的到达时间、军官加成判定）统一用 getGameNow()。
 * 纯墙钟用途（云存档限流、UI 相对时间显示、ID 唯一性）继续用 Date.now()。
 */
let timeOffsetMs = 0

/** 从存档恢复时调用，同步持久化的偏移 */
export const setTimeOffset = (ms: number): void => {
  timeOffsetMs = ms
}

export const getTimeOffset = (): number => timeOffsetMs

/** 当前游戏虚拟时间（毫秒时间戳） */
export const getGameNow = (): number => Date.now() + timeOffsetMs
