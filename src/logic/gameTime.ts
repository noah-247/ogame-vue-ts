/**
 * 遊戲虛擬時間（BLK-1 修復）。
 *
 * gameNow = Date.now() + timeOffset。時間快轉只增加 timeOffset，
 * 遊戲時鐘之後隨真實時間持續推進：不會凍結（舊 Math.max 方案的 bug）、
 * 不會倒退（重複快轉不再回撥 gameTime）。
 *
 * 所有遊戲內時間戳（建造/研究/艦船/拆除佇列的 startTime/endTime、
 * 艦隊與導彈任務的到達時間、軍官加成判定）統一用 getGameNow()。
 * 純牆鍾用途（雲存檔限流、UI 相對時間顯示、ID 唯一性）繼續用 Date.now()。
 */
let timeOffsetMs = 0

/** 從存檔恢復時呼叫，同步持久化的偏移 */
export const setTimeOffset = (ms: number): void => {
  timeOffsetMs = ms
}

export const getTimeOffset = (): number => timeOffsetMs

/** 當前遊戲虛擬時間（毫秒時間戳） */
export const getGameNow = (): number => Date.now() + timeOffsetMs
