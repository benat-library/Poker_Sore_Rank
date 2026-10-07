// 月間リングの期間と締めの判定。日付はすべて日本時間で扱う

// 月末の締めのあと、入力・修正を受け付ける猶予日数（翌月1日〜この日まで）
export const GRACE_DAYS = 3

// ランキングの状態
// open: 期間中 / grace: 締め後の猶予期間（入力・修正できる） / closed: 確定（変更できない）
export type RankingStatus = 'open' | 'grace' | 'closed'

export type RankingInfo = { id: number; name: string; kind: string; period: string | null }

// 日本時間での今日（YYYY-MM-DD）
export function todayJst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// その月の最終日（YYYY-MM-DD）
export function lastDayOf(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

// 猶予期間の最終日（翌月の GRACE_DAYS 日）
export function graceEndOf(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, GRACE_DAYS)).toISOString().slice(0, 10)
}

// ランキングの状態を判定する（イベントは今のところ締めなし）
export function statusOf(ranking: RankingInfo, today = todayJst()): RankingStatus {
  if (ranking.kind !== 'monthly' || !ranking.period) return 'open'
  if (today <= lastDayOf(ranking.period)) return 'open'
  if (today <= graceEndOf(ranking.period)) return 'grace'
  return 'closed'
}

// 確定済みの月間リングのうち、最も新しい年月（これ以前の period はすべて確定）
export function latestClosedPeriod(today = todayJst()): string {
  const [y, m, d] = today.split('-').map(Number)
  // 猶予期間中なら2か月前、そうでなければ前月までが確定
  const back = d <= GRACE_DAYS ? 2 : 1
  const date = new Date(Date.UTC(y, m - 1 - back, 1))
  return date.toISOString().slice(0, 7)
}

// 月間リングのタイトル（例：2026年10月 月間リング）
export function monthlyTitle(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${y}年${m}月 月間リング`
}

// スコアを登録・修正できるか。できない場合は日本語の理由を返す
export function checkWritable(ranking: RankingInfo, playedOn: string | null, today = todayJst()): string | null {
  if (statusOf(ranking, today) === 'closed') return 'このランキングは確定済みのため変更できません'
  if (playedOn !== null && ranking.kind === 'monthly' && ranking.period && !playedOn.startsWith(`${ranking.period}-`)) {
    const [y, m] = ranking.period.split('-').map(Number)
    return `${y}年${m}月の日付を入力してください`
  }
  return null
}

// ---- 半期（年度の前期：4〜9月、後期：10〜3月）----
// 半期は「年度-1」（前期）「年度-2」（後期）の形で表す（例：2026年10月〜2027年3月は「2026-2」）

// 年月（YYYY-MM）が属する半期
export function termOf(period: string): string {
  const [y, m] = period.split('-').map(Number)
  if (m >= 4 && m <= 9) return `${y}-1`
  return m >= 10 ? `${y}-2` : `${y - 1}-2`
}

// 半期の最初と最後の年月（YYYY-MM）
export function termRange(term: string): { from: string; to: string } {
  const [y, h] = term.split('-').map(Number)
  return h === 1 ? { from: `${y}-04`, to: `${y}-09` } : { from: `${y}-10`, to: `${y + 1}-03` }
}

// 半期の名前（例：2026年度 後期（10月〜3月））
export function termTitle(term: string): string {
  const [y, h] = term.split('-').map(Number)
  return h === 1 ? `${y}年度 前期（4月〜9月）` : `${y}年度 後期（10月〜3月）`
}

// 半期の集計が確定しているか（最後の月の月間リングが確定していれば確定）
export function termClosed(term: string, today = todayJst()): boolean {
  return termRange(term).to <= latestClosedPeriod(today)
}
