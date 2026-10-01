import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { createSession, destroySession, randomToken } from '../lib/session'

// Discord ログイン（/auth/...）
const auth = new Hono<AppEnv>()

const STATE_COOKIE = 'poker_oauth_state'
const DISCORD_API = 'https://discord.com/api/v10'

// ログイン後に Discord から戻ってくるURL（Discord の開発者サイトに登録したものと一致させる）
function callbackUrl(url: string): string {
  return `${new URL(url).origin}/auth/callback`
}

// Discord のログイン画面へ移動する
auth.get('/login', (c) => {
  // なりすまし防止の合言葉（state）を Cookie に入れておき、戻ってきたときに照合する
  const state = randomToken(16)
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/auth', maxAge: 600 })
  const params = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: callbackUrl(c.req.url),
    // identify：ユーザー名とID、guilds：参加しているサーバーの一覧（部のメンバーか確認するため）
    scope: 'identify guilds',
    state,
    prompt: 'none',
  })
  return c.redirect(`https://discord.com/oauth2/authorize?${params}`)
})

// Discord から戻ってきたときの処理
auth.get('/callback', async (c) => {
  const state = getCookie(c, STATE_COOKIE)
  deleteCookie(c, STATE_COOKIE, { path: '/auth', secure: true })
  const code = c.req.query('code')
  if (!code || !state || c.req.query('state') !== state) return c.redirect('/login?error=failed')

  // 受け取ったコードを、Discord のアクセストークンに交換する
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID,
      client_secret: c.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(c.req.url),
    }),
  })
  if (!tokenRes.ok) {
    console.error('Discord トークン取得に失敗', tokenRes.status, await tokenRes.text())
    return c.redirect('/login?error=failed')
  }
  const { access_token } = await tokenRes.json<{ access_token: string }>()
  const headers = { Authorization: `Bearer ${access_token}` }

  // ユーザー情報と、参加しているサーバーの一覧を取得する（アクセストークンは保存しない）
  const [meRes, guildsRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, { headers }),
    fetch(`${DISCORD_API}/users/@me/guilds`, { headers }),
  ])
  if (!meRes.ok || !guildsRes.ok) return c.redirect('/login?error=failed')
  const me = await meRes.json<{ id: string; username: string; global_name: string | null }>()
  const guilds = await guildsRes.json<{ id: string }[]>()

  // 部のサーバーのメンバーだけログインできる
  if (!guilds.some((g) => g.id === c.env.DISCORD_GUILD_ID)) return c.redirect('/login?error=not_member')

  const now = new Date().toISOString()
  await c.env.DB.batch([
    // 部員情報を登録・更新する
    c.env.DB.prepare(
      `INSERT INTO users (discord_id, username, global_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, global_name = excluded.global_name, last_login_at = excluded.last_login_at`
    ).bind(me.id, me.username, me.global_name, now, now),
    // ユーザー名が同じで、まだ誰にもひも付いていない過去の記録を、この部員の記録にする
    c.env.DB.prepare('UPDATE scores SET discord_id = ? WHERE user_name = ? AND discord_id IS NULL').bind(me.id, me.username),
  ])
  await createSession(c, me.id)
  return c.redirect('/')
})

// ログアウト
auth.post('/logout', async (c) => {
  await destroySession(c)
  return c.redirect('/login', 303)
})

export default auth
