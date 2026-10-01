import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson } from '../lib/http'
import { validateUserName } from '../lib/validation'
import { latestClosedPeriod, statusOf, todayJst } from '../lib/period'

// マイページ用の通算成績API（/api/stats）
// 本人の判定は今のところ user_name の一致で行う。Discord連携後は discord_id に切り替える
const stats = new Hono<AppEnv>()

// 成績のある人の一覧（名前順）
stats.get('/players', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT s.user_name FROM scores s JOIN rankings r ON r.id = s.ranking_id
     WHERE r.kind = 'monthly' ORDER BY s.user_name`
  ).all<{ user_name: string }>()
  return c.json(results.map((r) => r.user_name))
})

// 1人分の通算成績
stats.get('/player', async (c) => {
  const userName = validateUserName(c.req.query('user_name'))
  if (!userName.ok) return errorJson(c, 400, userName.error)

  const today = todayJst()

  // 1戦（月間リングの各日）ごとの成績。同じ日のScoreで順位を付け、同点は同順位
  const games = c.env.DB.prepare(
    `WITH daily AS (
       SELECT s.ranking_id, s.played_on, s.user_name, SUM(s.amount) AS amount
       FROM scores s JOIN rankings r ON r.id = s.ranking_id
       WHERE r.kind = 'monthly'
       GROUP BY s.ranking_id, s.played_on, s.user_name
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
     FROM ranked WHERE user_name = ?`
  ).bind(userName.value)

  // 月間リングごとの成績（確定・暫定の両方。集計は画面側で確定分だけにする）
  const rings = c.env.DB.prepare(
    `WITH totals AS (
       SELECT s.ranking_id, s.user_name, SUM(s.amount) AS total, COUNT(DISTINCT s.played_on) AS days
       FROM scores s JOIN rankings r ON r.id = s.ranking_id
       WHERE r.kind = 'monthly'
       GROUP BY s.ranking_id, s.user_name
     ), ranked AS (
       SELECT *,
         RANK() OVER (PARTITION BY ranking_id ORDER BY total DESC) AS rank,
         COUNT(*) OVER (PARTITION BY ranking_id) AS players
       FROM totals
     )
     SELECT r.id, r.name, r.kind, r.period, k.rank, k.players, k.total, k.days
     FROM ranked k JOIN rankings r ON r.id = k.ranking_id
     WHERE k.user_name = ?
     ORDER BY r.period DESC`
  ).bind(userName.value)

  const [gameRows, ringRows] = await c.env.DB.batch([games, rings])
  const g = gameRows.results[0] as Record<string, number | null>
  const ringList = (ringRows.results as { id: number; name: string; kind: string; period: string; rank: number; players: number; total: number; days: number }[]).map(
    (r) => ({ ...r, status: statusOf(r, today) })
  )

  // 確定した月間リングだけを集計する
  const cutoff = latestClosedPeriod(today)
  const closed = ringList.filter((r) => r.period <= cutoff)
  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

  return c.json({
    user_name: userName.value,
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

export default stats
