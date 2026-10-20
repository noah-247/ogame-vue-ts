/**
 * 統一生成帶字首的業務ID
 * 便於後續集中調整ID規則
 */
export const generateId = (prefix: string): string => {
  const timestamp = Date.now()
  return `${prefix}_${timestamp}_${Math.random().toString(36).slice(2, 9)}`
}
