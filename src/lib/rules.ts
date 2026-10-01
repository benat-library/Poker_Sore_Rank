// 月間リングのチップのルール（初期チップ200、SB1/BB2で固定）
export const START_CHIPS = 200
// Rebuy 1回あたりのチップ数（Scoreから引く分）
export const REBUY_CHIPS = 200

// 最終チップ数とRebuy回数からScoreを計算する
export function scoreFromChips(finalChips: number, rebuys: number): number {
  return finalChips - START_CHIPS - REBUY_CHIPS * rebuys
}
