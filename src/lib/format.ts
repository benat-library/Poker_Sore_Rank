// サーバーで画面を組み立てるときの表示の書き方（public/common.js の同名の関数と同じ表示にする）

// Scoreを「+1,200」「-300」「±0」形式にする
export function formatAmount(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '-' : '±') + Math.abs(n).toLocaleString('ja-JP')
}

// Scoreの符号に応じた色クラス
export function amountClass(n: number): string {
  return n > 0 ? 'plus' : n < 0 ? 'minus' : ''
}

// 「2026-10-01」を「2026/10/01（木）」にする
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
export function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${date.replaceAll('-', '/')}（${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`
}

// ISO 8601 の日時を、日本時間の「2026/10/01」形式にする
export function formatDate(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll('-', '/')
}
