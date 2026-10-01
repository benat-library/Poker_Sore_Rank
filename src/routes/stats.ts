import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, readJson } from '../lib/http'
import { validateUserName } from '../lib/validation'
import { latestClosedPeriod, statusOf, todayJst } from '../lib/period'
import { auditStmt } from '../lib/audit'
import { PLAYER_KEY, PLAYER_NAME } from './scores'

// マイページ用の通算成績API（/api/stats）
// 人の判定は「player_key」（Discord とひも付いた記録は Discord ID、まだの記録は 'name:名前'）で行う
const stats = new Hono<AppEnv>()

// 月間リングの有効なスコア（削除済みのランキング・スコアは除く）
const MONTHLY_SCORES = `FROM scores s
  JOIN rankings r ON r.id = s.ranking_id
  LEFT JOIN users u ON u.discord_id = s.discord_id
  WHERE r.kind = 'monthly' AND r.deleted_at IS NULL AND s.deleted_at IS NULL`

// 成績のある人の一覧（名前順）
stats.get('/players', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${PLAYER_KEY} AS player_key, MAX(${PLAYER_NAME}) AS name ${MONTHLY_SCORES}
     GROUP BY player_key ORDER BY name`
  ).all()
  return c.json(results)
})

// 1人分の通算成績（?player= を省略すると自分）
stats.get('/player', async (c) => {
  const player = c.req.query('player') || c.get('user').discord_id
  const today = todayJst()

  // 1戦（月間リングの各日）ごとの成績。同じ日のScoreで順位を付け、同点は同順位
  const games = c.env.DB.prepare(
    `WITH daily AS (
       SELECT s.ranking_id, s.played_on, ${PLAYER_KEY} AS player_key, SUM(s.amount) AS amount
       ${MONTHLY_SCORES}
       GROUP BY s.ranking_id, s.played_on, player_key
     ), ranked AS (
       SELECT *,
         RANK() OVER (PARTITION BY ranking_id, played_on ORDER BY amount DESC) AS rank,
         COUNT(*) OVER (PARTITION BY ranking_id, played_on) AS players
       FROM daily
     )
     SELECT COUNT(*) AS count,
       COALESCE(SUM(rank = 1), 0) AS firsts,
       AVG(rank) AS avg_rank,
       AVG(players) AS avg_players,
       COALESCE(SUM(amount), 0) AS total,
       COALESCE(SUM(amount > 0), 0) AS wins,
       COALESCE(SUM(amount < 0), 0) AS losses
     FROM ranked WHERE player_key = ?`
  ).bind(player)

  // 月間リングごとの成績（確定・暫定の両方。集計は確定分だけにする）
  const rings = c.env.DB.prepare(
    `WITH totals AS (
       SELECT s.ranking_id, ${PLAYER_KEY} AS player_key, SUM(s.amount) AS total, COUNT(DISTINCT s.played_on) AS days
       ${MONTHLY_SCORES}
       GROUP BY s.ranking_id, player_key
     ), ranked AS (
       SELECT *,
         RANK() OVER (PARTITION BY ranking_id ORDER BY total DESC) AS rank,
         COUNT(*) OVER (PARTITION BY ranking_id) AS players
       FROM totals
     )
     SELECT r.id, r.name, r.kind, r.period, k.rank, k.players, k.total, k.days
     FROM ranked k JOIN rankings r ON r.id = k.ranking_id
     WHERE k.player_key = ?
     ORDER BY r.period DESC`
  ).bind(player)

  const name = c.env.DB.prepare(`SELECT MAX(${PLAYER_NAME}) AS name ${MONTHLY_SCORES} AND ${PLAYER_KEY} = ?`).bind(player)

  const [gameRows, ringRows, nameRows] = await c.env.DB.batch([games, rings, name])
  const g = gameRows.results[0] as Record<string, number | null>
  const ringList = (
    ringRows.results as { id: number; name: string; kind: string; period: string; rank: number; players: number; total: number; days: number }[]
  ).map((r) => ({ ...r, status: statusOf(r, today) }))

  // 確定した月間リングだけを集計する
  const cutoff = latestClosedPeriod(today)
  const closed = ringList.filter((r) => r.period <= cutoff)
  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

  return c.json({
    player_key: player,
    name: (nameRows.results[0] as { name: string | null } | undefined)?.name ?? c.get('user').username,
    games: {
      count: g.count ?? 0,
      firsts: g.firsts ?? 0,
      avg_rank: g.avg_rank,
      avg_players: g.avg_players,
      total: g.total ?? 0,
      wins: g.wins ?? 0,
      losses: g.losses ?? 0,
    },
    rings: {
      count: closed.length,
      firsts: closed.filter((r) => r.rank === 1).length,
      avg_rank: average(closed.map((r) => r.rank)),
      avg_players: average(closed.map((r) => r.players)),
    },
    ring_list: ringList,
  })
})

// 取り込んだ過去の記録（created_by が空のもの）の名前ごとの、現在のひも付け先の一覧（管理者モード用）
// アプリから入力した記録は最初から本人のものなので、ここには含めない
stats.get('/links', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.user_name AS name, s.discord_id, u.username AS owner,
       COUNT(*) AS count, MIN(s.played_on) AS first_day, MAX(s.played_on) AS last_day
     FROM scores s
     JOIN rankings r ON r.id = s.ranking_id
     LEFT JOIN users u ON u.discord_id = s.discord_id
     WHERE s.created_by IS NULL AND s.deleted_at IS NULL AND r.deleted_at IS NULL
     GROUP BY s.user_name, s.discord_id
     ORDER BY s.discord_id IS NOT NULL, s.user_name`
  ).all()
  return c.json(results)
})

// ログインしたことのある部員の一覧（管理者モードで、ひも付け先を選ぶため）
stats.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT discord_id, username FROM users ORDER BY username').all()
  return c.json(results)
})

// 取り込んだ過去の記録のひも付け先を変更する（管理者モード用）
// discord_id に部員を指定すると、元のひも付けは外れてその部員の記録になる。null なら未ひも付けに戻す
stats.post('/link', async (c) => {
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')
  const name = validateUserName(body.name)
  if (!name.ok) return errorJson(c, 400, name.error)

  let ownerId: string | null = null
  let ownerName: string | null = null
  if (body.discord_id !== null) {
    if (typeof body.discord_id !== 'string') return errorJson(c, 400, 'ひも付け先の部員を選んでください')
    const owner = await c.env.DB.prepare('SELECT discord_id, username FROM users WHERE discord_id = ?')
      .bind(body.discord_id)
      .first<{ discord_id: string; username: string }>()
    if (!owner) return errorJson(c, 400, 'ひも付け先の部員が見つかりません')
    ownerId = owner.discord_id
    ownerName = owner.username
  }

  const actor = c.get('user').discord_id
  const target = 'user_name = ? AND created_by IS NULL AND deleted_at IS NULL'
  const before = await c.env.DB.prepare(`SELECT discord_id, COUNT(*) AS count FROM scores WHERE ${target} GROUP BY discord_id`)
    .bind(name.value)
    .all<{ discord_id: string | null; count: number }>()
  if (before.results.length === 0) return errorJson(c, 404, '対象の記録がありません')

  // ひも付け先の変更と操作履歴の記録を1つのトランザクションで行う
  const [updated] = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE scores SET discord_id = ?, updated_by = ? WHERE ${target}`).bind(ownerId, actor, name.value),
    auditStmt(c.env.DB, actor, 'claim', 'score', 0, { user_name: name.value, owners: before.results }, { discord_id: ownerId }),
  ])
  return c.json({ ok: true, count: updated.meta.changes, owner: ownerName })
})

export default stats
