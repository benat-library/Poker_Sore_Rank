import { MAX_BLIND_MINUTES } from './rules'

// 入力値の検証。成功時は { ok: true, value }、失敗時は { ok: false, error: 日本語の理由 } を返す
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// ランキング名・大会名：前後の空白を除去し、1文字以上50文字以下（label はエラー文に使う名前）
export function validateRankingName(input: unknown, label = 'ランキング名'): Result<string> {
  if (typeof input !== 'string') return { ok: false, error: `${label}を入力してください` }
  const name = input.trim()
  if (name.length < 1) return { ok: false, error: `${label}を入力してください` }
  if ([...name].length > 50) return { ok: false, error: `${label}は50文字以内で入力してください` }
  return { ok: true, value: name }
}

// ユーザー名：前後の空白を除去し、1文字以上30文字以下
export function validateUserName(input: unknown): Result<string> {
  if (typeof input !== 'string') return { ok: false, error: 'ユーザー名を入力してください' }
  const name = input.trim()
  if (name.length < 1) return { ok: false, error: 'ユーザー名を入力してください' }
  if ([...name].length > 30) return { ok: false, error: 'ユーザー名は30文字以内で入力してください' }
  return { ok: true, value: name }
}

// Score（amount）：整数で、-1000000 以上 1000000 以下
export function validateAmount(input: unknown): Result<number> {
  if (typeof input !== 'number' || !Number.isInteger(input)) {
    return { ok: false, error: 'Scoreは整数で入力してください' }
  }
  if (input < -1000000 || input > 1000000) {
    return { ok: false, error: 'Scoreは -1000000 以上 1000000 以下で入力してください' }
  }
  return { ok: true, value: input }
}

// 日付：YYYY-MM-DD 形式で、実在する日付であること
export function validatePlayedOn(input: unknown): Result<string> {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return { ok: false, error: '日付は YYYY-MM-DD 形式で入力してください' }
  }
  const [y, m, d] = input.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // 2月30日などは別の日付に繰り上がるため、元の値と一致するかで妥当性を判定する
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, error: '存在しない日付です' }
  }
  return { ok: true, value: input }
}

// ランキングの種類
export function validateKind(input: unknown): Result<'monthly' | 'event'> {
  if (input === 'monthly' || input === 'event') return { ok: true, value: input }
  return { ok: false, error: 'ランキングの種類を選んでください' }
}

// 年月：YYYY-MM 形式で、2000年〜2100年の範囲
export function validatePeriod(input: unknown): Result<string> {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}$/.test(input)) {
    return { ok: false, error: '年月は YYYY-MM 形式で入力してください' }
  }
  const [y, m] = input.split('-').map(Number)
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return { ok: false, error: '存在しない年月です' }
  return { ok: true, value: input }
}

// 最終チップ数：0以上 1000000 以下の整数
export function validateFinalChips(input: unknown): Result<number> {
  if (typeof input !== 'number' || !Number.isInteger(input)) {
    return { ok: false, error: '最終チップ数は整数で入力してください' }
  }
  if (input < 0 || input > 1000000) return { ok: false, error: '最終チップ数は 0 以上 1000000 以下で入力してください' }
  return { ok: true, value: input }
}

// Rebuy回数：0以上 50 以下の整数
export function validateRebuys(input: unknown): Result<number> {
  if (typeof input !== 'number' || !Number.isInteger(input)) {
    return { ok: false, error: 'Rebuy回数は整数で入力してください' }
  }
  if (input < 0 || input > 50) return { ok: false, error: 'Rebuy回数は 0 以上 50 以下で入力してください' }
  return { ok: true, value: input }
}

// 半期：「年度-1」（前期）か「年度-2」（後期）で、2000〜2100年度
export function validateTerm(input: unknown): Result<string> {
  if (typeof input !== 'string' || !/^\d{4}-[12]$/.test(input)) return { ok: false, error: '半期の指定が正しくありません' }
  const y = Number(input.slice(0, 4))
  if (y < 2000 || y > 2100) return { ok: false, error: '半期の指定が正しくありません' }
  return { ok: true, value: input }
}

// 大会の情報（イベント・トーナメント共通）：名前、開催日（空なら未定）、募集上限（空なら上限なし。2〜256人）
export function validateEventInfo(
  body: Record<string, unknown>,
  label: string
): Result<{ name: string; held_on: string | null; capacity: number | null }> {
  const name = validateRankingName(body.name, label)
  if (!name.ok) return name
  let heldOn: string | null = null
  if (body.held_on !== undefined && body.held_on !== null && body.held_on !== '') {
    const d = validatePlayedOn(body.held_on)
    if (!d.ok) return { ok: false, error: '開催日の形式が正しくありません' }
    heldOn = d.value
  }
  let capacity: number | null = null
  if (body.capacity !== undefined && body.capacity !== null && body.capacity !== '') {
    const n = Number(body.capacity)
    if (!Number.isInteger(n) || n < 2 || n > 256) return { ok: false, error: '募集上限は2〜256人の整数で入力してください' }
    capacity = n
  }
  return { ok: true, value: { name: name.value, held_on: heldOn, capacity } }
}

// ブラインドの編集：1レベルの時間（1〜99分）と段階（[[SB, BB], ...]。1〜40段階、各 1〜1000000 の整数で BB は SB 以上）
// levels が null なら標準の段階に戻す
export function validateBlinds(body: Record<string, unknown>): Result<{ minutes: number; levels: [number, number][] | null }> {
  const minutes = Number(body.minutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_BLIND_MINUTES) {
    return { ok: false, error: `1レベルの時間は1〜${MAX_BLIND_MINUTES}分の整数で入力してください` }
  }
  if (body.levels === null) return { ok: true, value: { minutes, levels: null } }
  if (!Array.isArray(body.levels) || body.levels.length < 1 || body.levels.length > 40) {
    return { ok: false, error: 'ブラインドは1〜40段階で入力してください' }
  }
  const levels: [number, number][] = []
  for (const [i, row] of body.levels.entries()) {
    const sb = Array.isArray(row) ? Number(row[0]) : NaN
    const bb = Array.isArray(row) ? Number(row[1]) : NaN
    const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 1000000
    if (!ok(sb) || !ok(bb)) return { ok: false, error: `レベル${i + 1}：SB と BB は1以上の整数で入力してください` }
    if (bb < sb) return { ok: false, error: `レベル${i + 1}：BB は SB 以上にしてください` }
    levels.push([sb, bb])
  }
  return { ok: true, value: { minutes, levels } }
}
