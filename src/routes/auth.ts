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

// ポーカー運営サーバーのメンバーなら管理者（1）、メンバーでなければ 0
// Discord から確認できなかったとき（混雑など）は null を返し、前回の判定をそのまま使う
async function checkAdmin(adminGuildId: string, headers: Record<string, string>): Promise<0 | 1 | null> {
  if (adminGuildId === '') return 0
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${adminGuildId}/member`, { headers })
  if (res.ok) return 1
  if (res.status === 404) return 0
  console.error('運営サーバーのメンバー確認に失敗', res.status, await res.text())
  return null
}

// ログイン時に、同じ名前（サーバーのニックネーム＝intra名）の記録を自分の記録にする文
// 管理者がひも付けを変更したことのある名前は、自動では触らない（解除した記録が勝手に戻らないように）
function autoLinkStmts(db: D1Database, discordId: string, name: string) {
  const notClaimed = "?2 NOT IN (SELECT json_extract(before_json, '$.user_name') FROM audit_logs WHERE action = 'claim')"
  return [
    // 取り込んだ過去の記録（月間リング）：まだ何もひも付いていない部員にだけ（実質、初回ログイン時）。ひも付けは1人1つの名前まで
    db
      .prepare(
        `UPDATE scores SET discord_id = ?1
         WHERE discord_id IS NULL AND created_by IS NULL AND deleted_at IS NULL AND user_name = ?2 AND ${notClaimed}
           AND NOT EXISTS (SELECT 1 FROM scores WHERE discord_id = ?1 AND created_by IS NULL AND deleted_at IS NULL)`
      )
      .bind(discordId, name),
    // 管理者が名前で登録しておいたイベント・トーナメントの参加記録（まだ誰にもひも付いていないもの）。自分がすでに参加している大会の記録は除く
    ...[
      ['event_entries', 'ranking_id'],
      ['tournament_entries', 'tournament_id'],
    ].map(([table, parent]) =>
      db
        .prepare(
          `UPDATE ${table} SET discord_id = ?1
           WHERE discord_id IS NULL AND user_name = ?2 AND ${notClaimed}
             AND NOT EXISTS (SELECT 1 FROM ${table} o WHERE o.${parent} = ${table}.${parent} AND o.discord_id = ?1)`
        )
        .bind(discordId, name)
    ),
  ]
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
  type Member = { nick: string | null; roles: string[]; user: { id: string; username: string; global_name: string | null } }
  let member: Member
  const memberRes = await fetch(`${DISCORD_API}/users/@me/guilds/${c.env.DISCORD_GUILD_ID}/member`, { headers })
  if (memberRes.status === 404) {
    // サーバーのメンバーでなくても、例外として許可した Discord ユーザーならログインできる（ニックネーム・ロールは無し）
    const userRes = await fetch(`${DISCORD_API}/users/@me`, { headers })
    if (!userRes.ok) {
      console.error('Discord ユーザー情報の取得に失敗', userRes.status, await userRes.text())
      return c.redirect('/login?error=failed')
    }
    const user = await userRes.json<Member['user']>()
    const allowed = (c.env.LOGIN_ALLOW_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean)
    if (!allowed.includes(user.id)) return c.redirect('/login?error=not_member')
    member = { nick: null, roles: [], user }
  } else if (!memberRes.ok) {
    console.error('Discord メンバー情報の取得に失敗', memberRes.status, await memberRes.text())
    return c.redirect('/login?error=failed')
  } else {
    member = await memberRes.json<Member>()
  }
  const me = member.user

  // アプリで使う名前は、Discord のサーバー上で表示される名前（ニックネーム → 表示名 → ユーザー名の順）
  // 「niijima [26AC]」のような後ろのタグは外す（過去の記録もタグを外した名前で入っているため）
  const displayName = cleanName(member.nick ?? me.global_name ?? me.username)
  // 自動ひも付けに使う名前は、サーバーのニックネーム（intra名にしてもらっている）だけ
  // Discord のユーザー名はたまたま別の人の intra名と同じことがあるので使わない
  const nickName = member.nick ? cleanName(member.nick) : null
  // 競技ポーカー部のロールを持っているか（ロールIDが未設定なら、誰も持っていない扱い）
  const isClubMember = c.env.CLUB_ROLE_ID !== '' && member.roles.includes(c.env.CLUB_ROLE_ID) ? 1 : 0
  const isAdmin = await checkAdmin(c.env.ADMIN_GUILD_ID, headers)

  const now = new Date().toISOString()
  await c.env.DB.batch([
    // 部員情報を登録・更新する（users.username には、アプリで表示する名前を入れる）
    c.env.DB.prepare(
      `INSERT INTO users (discord_id, username, global_name, is_club_member, is_admin, created_at, last_login_at)
       VALUES (?1, ?2, ?3, ?4, COALESCE(?5, 0), ?6, ?6)
       ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, global_name = excluded.global_name,
         is_club_member = excluded.is_club_member, is_admin = COALESCE(?5, users.is_admin), last_login_at = excluded.last_login_at`
    ).bind(me.id, displayName, me.global_name, isClubMember, isAdmin, now),
    // 自分の名前の記録の自動ひも付け（サーバーのニックネーム＝intra名が一致するときだけ。ニックネームが無ければしない）
    ...(nickName === null ? [] : autoLinkStmts(c.env.DB, me.id, nickName)),
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
