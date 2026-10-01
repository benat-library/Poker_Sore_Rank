import type { Context } from 'hono'

// エラーを { error: 理由 } の形で返す
export function errorJson(c: Context, status: 400 | 401 | 404 | 500, message: string) {
  return c.json({ error: message }, status)
}

// URLの :id を正の整数として取り出す。不正な場合は null
export function parseId(raw: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

// リクエストボディをJSONとして読む。読めない場合は null
export async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json()
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}
