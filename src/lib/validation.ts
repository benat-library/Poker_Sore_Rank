// 入力値の検証。成功時は { ok: true, value }、失敗時は { ok: false, error: 日本語の理由 } を返す
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// ランキング名：前後の空白を除去し、1文字以上50文字以下
export function validateRankingName(input: unknown): Result<string> {
  if (typeof input !== 'string') return { ok: false, error: 'ランキング名を入力してください' }
  const name = input.trim()
  if (name.length < 1) return { ok: false, error: 'ランキング名を入力してください' }
  if ([...name].length > 50) return { ok: false, error: 'ランキング名は50文字以内で入力してください' }
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
