import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { createSession, destroySession, randomToken } from '../lib/session'

// Discord ログイン（/auth/...）
const auth = new Hono<AppEnv>()

const STATE_COOKIE = 'poker_oauth_state'
const DISCORD_API = 'https://discord.com/api/v10'

// 名前の後ろに付いたタグ（例：「niijima [26AC],」の「 [26AC],」）や前後の空白を外す
export function cleanName(name: string): string {
  return name.replace(/\s*\[[^\]]*\]\s*,?\s*$/, '').replace(/[,\s]+$/, '').trim() || name.trim()
}

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
    // identify：ユーザー名とID、guilds.members.read：部のサーバーでのニックネーム（メンバーか確認するためにも使う）
    scope: 'identify guilds.members.read',
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

  // 部のサーバーでのメンバー情報を取得する（メンバーでなければ 404 が返る。アクセストークンは保存しない）
  const memberRes = await fetch(`${DISCORD_API}/users/@me/guilds/${c.env.DISCORD_GUILD_ID}/member`, { headers })
  if (memberRes.status === 404) return c.redirect('/login?error=not_member')
  if (!memberRes.ok) {
    console.error('Discord メンバー情報の取得に失敗', memberRes.status, await memberRes.text())
    return c.redirect('/login?error=failed')
  }
  const member = await memberRes.json<{ nick: string | null; user: { id: string; username: string; global_name: string | null } }>()
  const me = member.user

  // アプリで使う名前は、Discord のサーバー上で表示される名前（ニックネーム → 表示名 → ユーザー名の順）
  // 「niijima [26AC]」のような後ろのタグは外す（過去の記録もタグを外した名前で入っているため）
  const displayName = cleanName(member.nick ?? me.global_name ?? me.username)

  const now = new Date().toISOString()
  await c.env.DB.batch([
    // 部員情報を登録・更新する（users.username には、アプリで表示する名前を入れる）
    c.env.DB.prepare(
      `INSERT INTO users (discord_id, username, global_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, global_name = excluded.global_name, last_login_at = excluded.last_login_at`
    ).bind(me.id, displayName, me.global_name, now, now),
    // サーバー上の名前、または Discord のユーザー名と同じ名前で、まだ誰にもひも付いていない過去の記録を、この部員の記録にする
    c.env.DB.prepare('UPDATE scores SET discord_id = ? WHERE user_name IN (?, ?) AND discord_id IS NULL').bind(
      me.id,
      displayName,
      me.username
    ),
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
