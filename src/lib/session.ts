import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv, LoginUser } from '../types'
import { errorJson } from './http'
import { foul } from './foul'

// ログイン状態を保つ日数（ログインしてからこの日数がたったら、使っていても一度ログインし直してもらう）
// ログインし直すときに、42のサーバー・ポーカー運営サーバーにまだいるか（管理者か）、ロールやニックネームを確認し直すため
export const SESSION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_COOKIE = 'poker_session'
// 管理者が「一般部員として表示」にしているときに付く Cookie（ブラウザを閉じると消える。権限を下げる方向にしか働かない）
export const MEMBER_VIEW_COOKIE = 'poker_member_view'

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
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO sessions (token_hash, discord_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(
      await hashToken(token),
      discordId,
      now.toISOString(),
      new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString()
    ),
    // ついでに、期限切れのログイン状態を消しておく（DBに溜まり続けないように）
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()),
  ])
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
  // 期限（ログインした日から SESSION_DAYS 日）を過ぎたログイン状態は使えない（延長はしない）
  const row = await c.env.DB.prepare(
    `SELECT u.discord_id, u.username, u.global_name, u.is_admin, u.banned_until > ?2 AS banned
     FROM sessions s JOIN users u ON u.discord_id = s.discord_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  )
    .bind(tokenHash, now.toISOString())
    .first<Omit<LoginUser, 'is_admin' | 'real_admin' | 'banned'> & { is_admin: number; banned: number | null }>()
  if (!row) return null

  const realAdmin = row.is_admin === 1
  const memberView = getCookie(c, MEMBER_VIEW_COOKIE) === '1'
  return {
    discord_id: row.discord_id,
    username: row.username,
    global_name: row.global_name,
    is_admin: realAdmin && !memberView,
    real_admin: realAdmin,
    banned: row.banned === 1,
  }
}

// ログイン必須にする。画面はログイン画面へ移動し、APIは 401 を返す
export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await findUser(c)
  if (!user) {
    if (c.req.path.startsWith('/api/')) return errorJson(c, 401, 'ログインしてください')
    return c.redirect('/login')
  }
  c.set('user', user)
  // 退場処分中の人は、API も画面も使えない（画面は index.tsx の bannedPage が出す。DB には何も書き込まない）
  if (user.banned && (c.req.path.startsWith('/api/') || c.req.path.startsWith('/me/'))) {
    return c.json({ error: '退場処分中です。しばらくの間このアプリは使えません', code: 'banned' }, 403)
  }
  await next()
}

// 管理者だけに許可する（管理者でなければ 403 を返す）
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user').is_admin) return foul(c, `管理者だけの操作（${c.req.method} ${c.req.path}）`)
  await next()
}

// 「一般部員として表示」のオン・オフ（本当の管理者だけ。オンの間はサーバーも一般部員として扱う）
export async function setMemberView(c: Context<AppEnv>) {
  const user = c.get('user')
  if (!user.real_admin) return foul(c, '管理者の表示切り替え')
  const body = await c.req.json().catch(() => null)
  if (body?.on === true) setCookie(c, MEMBER_VIEW_COOKIE, '1', { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
  else deleteCookie(c, MEMBER_VIEW_COOKIE, { path: '/', secure: true })
  return c.json({ ok: true })
}

// ログインしていなくても見られる画面用。ログイン中なら部員情報を入れておく（ヘッダーのナビ表示に使う）
export const optionalLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await findUser(c)
  if (user) c.set('user', user)
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
