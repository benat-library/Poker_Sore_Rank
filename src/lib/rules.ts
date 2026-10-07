// 月間リングのチップのルール（初期チップ200、SB1/BB2で固定）
export const START_CHIPS = 200
// Rebuy 1回あたりのチップ数（Scoreから引く分）
export const REBUY_CHIPS = 200

// 最終チップ数とRebuy回数からScoreを計算する
export function scoreFromChips(finalChips: number, rebuys: number): number {
  return finalChips - START_CHIPS - REBUY_CHIPS * rebuys
}

// イベント・トーナメントの標準のブラインドストラクチャー（SB / BB。上から順にレベル1, 2, …）
// 大会ごとに画面から変えられる（変えていない大会はこの段階を使う）
export const BLIND_LEVELS: [number, number][] = [
  [1, 2], [1, 3], [2, 4], [3, 6], [4, 8], [5, 10], [7, 14],
  [10, 20], [15, 30], [20, 40], [30, 60], [40, 80], [50, 100],
]
// 1レベルの時間（分）は1〜99分の自由入力。最初は 12 分（DB の列の初期値）
export const MAX_BLIND_MINUTES = 99

// 保存されたブラインドの段階（JSON）を読む。未設定や壊れた値なら標準の段階
export function blindLevelsOf(json: string | null): [number, number][] {
  if (!json) return BLIND_LEVELS
  try {
    const levels = JSON.parse(json)
    return Array.isArray(levels) && levels.length > 0 ? levels : BLIND_LEVELS
  } catch {
    return BLIND_LEVELS
  }
}
