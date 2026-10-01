import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { errorJson } from './http'

// 合言葉を送るリクエストヘッダー名（日本語も送れるよう、値は encodeURIComponent 済み）
const PASSWORD_HEADER = 'X-App-Password'

// 文字列を SHA-256 に変換する（長さをそろえて比較するため）
async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
}

// 合言葉が一致するか。一致までの時間から推測されないよう、一定時間で比較する
async function isCorrectPassword(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(input), sha256(expected)])
  return crypto.subtle.timingSafeEqual(a, b)
}

// API用の合言葉チェック
export const requirePassword: MiddlewareHandler<AppEnv> = async (c, next) => {
  const expected = c.env.APP_PASSWORD
  if (!expected) {
    // 設定漏れのときは誰も通さない
    console.error('APP_PASSWORD が設定されていません')
    return errorJson(c, 500, '合言葉が設定されていません。管理者に連絡してください')
  }

  const raw = c.req.header(PASSWORD_HEADER)
  let input = ''
  try {
    input = raw ? decodeURIComponent(raw) : ''
  } catch {
    input = ''
  }
  if (!input || !(await isCorrectPassword(input, expected))) {
    return errorJson(c, 401, '合言葉が正しくありません')
  }
  await next()
}
