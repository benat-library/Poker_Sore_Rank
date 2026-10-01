import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv, LoginUser } from '../types'
import { errorJson } from './http'

// ログイン状態を保つ日数（使うたびにこの日数だけ延長する）
export const SESSION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_COOKIE = 'poker_session'

// ランダムな文字列（Cookie のトークンや OAuth の state に使う）
export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// トークンは SHA-256 にしてからDBに保存する（DBが漏れてもログインに使えないようにするため）
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ログイン状態の Cookie を書き込む（JavaScript から読めず、HTTPS でのみ送られる）
export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

// 新しいログイン状態を作る
export async function createSession(c: Context<AppEnv>, discordId: string) {
  const token = randomToken()
  const now = new Date()
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, discord_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hashToken(token), discordId, now.toISOString(), new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString())
    .run()
  setSessionCookie(c, token)
}

// ログアウト（DBのログイン状態を消し、Cookie も消す）
export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run()
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true })
}

// Cookie からログイン中の部員を探す。見つからなければ null
async function findUser(c: Context<AppEnv>): Promise<LoginUser | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  const tokenHash = await hashToken(token)
  const now = new Date()
  const row = await c.env.DB.prepare(
    `SELECT u.discord_id, u.username, u.global_name, s.expires_at
     FROM sessions s JOIN users u ON u.discord_id = s.discord_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(tokenHash, now.toISOString())
    .first<LoginUser & { expires_at: string }>()
  if (!row) return null

  // 使うたびに期限を延長する（DBへの書き込みを減らすため、延長は1日に1回まで）
  const remaining = Date.parse(row.expires_at) - now.getTime()
  if (remaining < (SESSION_DAYS - 1) * DAY_MS) {
    await c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .bind(new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString(), tokenHash)
      .run()
    setSessionCookie(c, token)
  }
  return { discord_id: row.discord_id, username: row.username, global_name: row.global_name }
}

// ログイン必須にする。画面はログイン画面へ移動し、APIは 401 を返す
export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await findUser(c)
  if (!user) {
    if (c.req.path.startsWith('/api/')) return errorJson(c, 401, 'ログインしてください')
    return c.redirect('/login')
  }
  c.set('user', user)
  await next()
}

// 他のサイトから送られてきた書き込み操作を拒否する（CSRF対策）
export const sameOriginOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('Origin')
    if (origin !== new URL(c.req.url).origin) return errorJson(c, 403, '不正なリクエストです')
  }
  await next()
}
