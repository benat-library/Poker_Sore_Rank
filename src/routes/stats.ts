import { Hono } from 'hono'
import type { AppEnv, LoginUser } from '../types'
import { errorJson, readJson } from '../lib/http'
import { validateTerm, validateUserName } from '../lib/validation'
import { latestClosedPeriod, statusOf, termClosed, termOf, termRange, termTitle, todayJst } from '../lib/period'
import { auditStmt } from '../lib/audit'
import { PLAYER_KEY, PLAYER_NAME } from './scores'
import { requireAdmin } from '../lib/session'
import { foul } from '../lib/foul'

// イベントの順位・トーナメントの申し込みで、同じ人を判定するキー（スコアの PLAYER_KEY と同じ形）
const EVENT_KEY = "COALESCE(er.discord_id, 'name:' || er.user_name)"
const ENTRY_KEY = "COALESCE(e.discord_id, 'name:' || e.user_name)"

// その人（?1 の player_key）が出た月間リングの日（削除済みのリング・記録は除く）
const MY_DAYS = `SELECT DISTINCT s.ranking_id, s.played_on FROM scores s JOIN rankings r ON r.id = s.ranking_id
  WHERE r.kind = 'monthly' AND r.deleted_at IS NULL AND s.deleted_at IS NULL AND ${PLAYER_KEY} = ?1`

// マイページ用の通算成績API（/api/stats）
// 人の判定は「player_key」（Discord とひも付いた記録は Discord ID、まだの記録は 'name:名前'）で行う
const stats = new Hono<AppEnv>()

// 月間リングの有効なスコア（削除済みのランキング・スコアは除く）
const MONTHLY_SCORES = `FROM scores s
  JOIN rankings r ON r.id = s.ranking_id
  LEFT JOIN users u ON u.discord_id = s.discord_id
  WHERE r.kind = 'monthly' AND r.deleted_at IS NULL AND s.deleted_at IS NULL`

// 成績のある人の一覧（名前順。他の人の成績を見るのは管理者だけなので、一覧も管理者だけ）
stats.get('/players', requireAdmin, async (c) => c.json(await listPlayers(c.env.DB)))

// 成績のある人の一覧（マイページの「表示する人」の選択肢。サーバーで画面を作るときにも使う）
export async function listPlayers(db: D1Database) {
  const { results } = await db.prepare(
    `SELECT ${PLAYER_KEY} AS player_key, MAX(${PLAYER_NAME}) AS name ${MONTHLY_SCORES}
     GROUP BY player_key ORDER BY name`
  ).all<{ player_key: string; name: string }>()
  return results
}

// 1人分の通算成績（?player= を省略すると自分。他の人の成績は管理者だけ）
stats.get('/player', async (c) => {
  const user = c.get('user')
  const player = c.req.query('player') || user.discord_id
  if (player !== user.discord_id && !user.is_admin) return foul(c, '他の人の成績の閲覧')
  return c.json(await playerStats(c.env.DB, player, user))
})

export type PlayerStats = Awaited<ReturnType<typeof playerStats>>

// 1人分の通算成績を集める（マイページの画面をサーバーで作るときにも使う。見てよい人かどうかは呼ぶ側で確認する）
export async function playerStats(db: D1Database, player: string, user: LoginUser) {
  const today = todayJst()

  // 集計を軽くするため、全員の全記録ではなく、その人が出た日（MY_DAYS）・出たリングの記録だけを読んで順位を計算する
  // （その日・そのリングの順位は、その日・そのリングの記録だけで決まるので、結果は全員分を読んだときと同じ）
  // 索引 idx_scores_player（PLAYER_KEY の式）と idx_scores_ranking_day を使う（migration 0014）

  // 1戦（月間リングの各日）ごとの成績。同じ日のScoreで順位を付け、同点は同順位
  const games = db.prepare(
    `WITH mine AS (${MY_DAYS}), daily AS (
       SELECT s.ranking_id, s.played_on, ${PLAYER_KEY} AS player_key, SUM(s.amount) AS amount
       FROM mine m JOIN scores s ON s.ranking_id = m.ranking_id AND s.played_on = m.played_on
       WHERE s.deleted_at IS NULL
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
     FROM ranked WHERE player_key = ?1`
  ).bind(player)

  // 月間リングごとの成績（確定・暫定の両方。集計は確定分だけにする）
  const rings = db.prepare(
    `WITH mine AS (SELECT DISTINCT ranking_id FROM (${MY_DAYS})), totals AS (
       SELECT s.ranking_id, ${PLAYER_KEY} AS player_key, SUM(s.amount) AS total, COUNT(DISTINCT s.played_on) AS days
       FROM mine m JOIN scores s ON s.ranking_id = m.ranking_id
       WHERE s.deleted_at IS NULL
       GROUP BY s.ranking_id, player_key
     ), ranked AS (
       SELECT *,
         RANK() OVER (PARTITION BY ranking_id ORDER BY total DESC) AS rank,
         COUNT(*) OVER (PARTITION BY ranking_id) AS players
       FROM totals
     )
     SELECT r.id, r.name, r.kind, r.period, k.rank, k.players, k.total, k.days
     FROM ranked k JOIN rankings r ON r.id = k.ranking_id
     WHERE k.player_key = ?1
     ORDER BY r.period DESC`
  ).bind(player)

  // 表示名（月間リング → イベント → トーナメント → 部員情報の順に探す）
  const name = db.prepare(
    `SELECT COALESCE(
       (SELECT MAX(${PLAYER_NAME}) ${MONTHLY_SCORES} AND ${PLAYER_KEY} = ?1),
       (SELECT COALESCE(u.username, er.user_name) FROM event_entries er LEFT JOIN users u ON u.discord_id = er.discord_id
        WHERE ${EVENT_KEY} = ?1 LIMIT 1),
       (SELECT COALESCE(u.username, e.user_name) FROM tournament_entries e LEFT JOIN users u ON u.discord_id = e.discord_id
        WHERE ${ENTRY_KEY} = ?1 LIMIT 1),
       (SELECT username FROM users WHERE discord_id = ?1)
     ) AS name`
  ).bind(player)

  // 終了したイベントごとの順位（削除済みのイベントは除く）
  const events = db.prepare(
    `SELECT r.id, r.name, r.held_on, er.place, (SELECT COUNT(*) FROM event_entries x WHERE x.ranking_id = r.id) AS players
     FROM event_entries er
     JOIN rankings r ON r.id = er.ranking_id AND r.kind = 'event' AND r.deleted_at IS NULL AND r.event_status = 'finished'
     WHERE ${EVENT_KEY} = ? AND er.place IS NOT NULL
     ORDER BY COALESCE(r.held_on, substr(r.created_at, 1, 10)) DESC, r.id DESC`
  ).bind(player)

  // 組み合わせを作ったあとのトーナメントの申し込みと、その大会の対戦（どこまで勝ち上がったかを計算する）
  const entries = db.prepare(
    `SELECT t.id, t.name, t.held_on, t.status, e.id AS entry_id,
       (SELECT COUNT(*) FROM tournament_entries x WHERE x.tournament_id = t.id) AS players
     FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id AND t.deleted_at IS NULL AND t.status <> 'entry'
     WHERE ${ENTRY_KEY} = ?
     ORDER BY COALESCE(t.held_on, substr(t.created_at, 1, 10)) DESC, t.id DESC`
  ).bind(player)
  const matches = db.prepare(
    `SELECT m.tournament_id, m.round, m.player1_entry_id, m.player2_entry_id, m.winner_entry_id
     FROM tournament_matches m
     WHERE m.tournament_id IN (SELECT e.tournament_id FROM tournament_entries e WHERE ${ENTRY_KEY} = ?)`
  ).bind(player)

  // 競技ポーカー部のロールを持っているか（ひも付いていない過去の記録の名前は、該当なし）
  const member = db.prepare('SELECT is_club_member, is_admin FROM users WHERE discord_id = ?').bind(player)

  const [gameRows, ringRows, nameRows, memberRows, eventRows, entryRows, matchRows] = await db.batch([
    games, rings, name, member, events, entries, matches,
  ])
  const g = gameRows.results[0] as Record<string, number | null>
  const ringList = (
    ringRows.results as { id: number; name: string; kind: string; period: string; rank: number; players: number; total: number; days: number }[]
  ).map((r) => ({ ...r, status: statusOf(r, today) }))

  // 確定した月間リングだけを集計する
  const cutoff = latestClosedPeriod(today)
  const closed = ringList.filter((r) => r.period <= cutoff)
  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

  return {
    player_key: player,
    name: (nameRows.results[0] as { name: string | null } | undefined)?.name ?? player,
    club_member: (memberRows.results[0] as { is_club_member: number } | undefined)?.is_club_member === 1,
    // 管理者か（自分のときは「一般部員として表示」中なら出さない）
    admin: player === user.discord_id ? user.is_admin : (memberRows.results[0] as { is_admin: number } | undefined)?.is_admin === 1,
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
    events: eventSummary(eventRows.results as EventRow[]),
    tournaments: tournamentSummary(entryRows.results as EntryRow[], matchRows.results as MatchRow[]),
  }
}

type EventRow = { id: number; name: string; held_on: string | null; place: number; players: number }

// 上位30%に入る順位（参加人数の30%を四捨五入。少人数でも1位は必ず入る。例：9人なら3位まで、5人なら2位まで）
export function top30Line(players: number) {
  return Math.max(1, Math.round(players * 0.3))
}

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

// イベントの成績（参加回数・優勝・上位30%・平均順位・平均参加人数と、イベントごとの順位）
function eventSummary(list: EventRow[]) {
  return {
    count: list.length,
    firsts: list.filter((e) => e.place === 1).length,
    top30: list.filter((e) => e.place <= top30Line(e.players)).length,
    avg_place: average(list.map((e) => e.place)),
    avg_players: average(list.map((e) => e.players)),
    list,
  }
}

type EntryRow = { id: number; name: string; held_on: string | null; status: string; entry_id: number; players: number }
type MatchRow = { tournament_id: number; round: number; player1_entry_id: number | null; player2_entry_id: number | null; winner_entry_id: number | null }

// トーナメントの成績。負けた回戦から「ベストN」を出す（決勝で負けたら準優勝＝ベスト2）。best は小さいほど良い成績
function tournamentSummary(entries: EntryRow[], matches: MatchRow[]) {
  const list = entries.map((t) => {
    const own = matches.filter((m) => m.tournament_id === t.id)
    const rounds = Math.max(0, ...own.map((m) => m.round))
    const lost = own.find(
      (m) => m.winner_entry_id !== null && m.winner_entry_id !== t.entry_id && (m.player1_entry_id === t.entry_id || m.player2_entry_id === t.entry_id)
    )
    const champion = own.some((m) => m.round === rounds && m.winner_entry_id === t.entry_id)
    const best = champion ? 1 : lost ? 2 ** (rounds - lost.round + 1) : null
    const result = best === 1 ? '優勝' : best === 2 ? '準優勝' : best !== null ? `ベスト${best}` : '勝ち残り中'
    return { id: t.id, name: t.name, held_on: t.held_on, players: t.players, result, best }
  })
  const decided = list.filter((t) => t.best !== null).map((t) => t.best as number)
  const best = decided.length ? Math.min(...decided) : null
  return {
    count: list.length,
    firsts: list.filter((t) => t.best === 1).length,
    seconds: list.filter((t) => t.best === 2).length,
    best: best === null ? null : best === 1 ? '優勝' : best === 2 ? '準優勝' : `ベスト${best}`,
    avg_players: average(list.map((t) => t.players)),
    list,
  }
}

// 半期ランキング（?term= を省略すると今の半期）。半期内の月間リングのScoreを合計し、合計の降順に並べる
// 参加回数は同じ日の入力を1回と数える。最後の月が確定するまでは暫定
stats.get('/half', async (c) => {
  let term: string | null = null
  if (c.req.query('term') !== undefined) {
    const t = validateTerm(c.req.query('term'))
    if (!t.ok) return errorJson(c, 400, t.error)
    term = t.value
  }
  return c.json(await halfRanking(c.env.DB, term))
})

export type HalfRow = { player_key: string; user_name: string; total: number; days: number }

// 半期ランキングを作る（term が null なら今の半期）。ホーム画面でも、サーバーで埋めて返すために使う
export async function halfRanking(db: D1Database, termOrNull: string | null) {
  const today = todayJst()
  const current = termOf(today.slice(0, 7))
  const term = termOrNull ?? current
  const { from, to } = termRange(term)

  const [rowResult, periodResult] = await db.batch([
    db.prepare(
      `SELECT ${PLAYER_KEY} AS player_key, MAX(${PLAYER_NAME}) AS user_name,
         SUM(s.amount) AS total, COUNT(DISTINCT s.played_on) AS days
       ${MONTHLY_SCORES} AND r.period BETWEEN ? AND ?
       GROUP BY player_key
       ORDER BY total DESC, user_name ASC`
    ).bind(from, to),
    // 選べる半期の一覧を作るため、月間リングのある年月をすべて取る
    db.prepare("SELECT DISTINCT period FROM rankings WHERE kind = 'monthly' AND deleted_at IS NULL AND period IS NOT NULL"),
  ])
  const terms = [...new Set([current, ...(periodResult.results as { period: string }[]).map((r) => termOf(r.period))])]
    .filter((t) => t <= current)
    .sort()
    .reverse()

  return {
    term,
    title: termTitle(term),
    from,
    to,
    closed: termClosed(term, today),
    terms: terms.map((t) => ({ term: t, title: termTitle(t) })),
    rows: rowResult.results as HalfRow[],
  }
}

// 取り込んだ過去の記録（created_by が空のもの）の名前ごとの、現在のひも付け先の一覧（管理者ページ用）
// アプリから入力した記録は最初から本人のものなので、ここには含めない
stats.get('/links', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.user_name AS name, s.discord_id, u.username AS owner,
       COUNT(*) AS count, MIN(s.played_on) AS first_day, MAX(s.played_on) AS last_day
     FROM scores s
     JOIN rankings r ON r.id = s.ranking_id
     LEFT JOIN users u ON u.discord_id = s.discord_id
     WHERE s.created_by IS NULL AND s.deleted_at IS NULL AND r.deleted_at IS NULL
     GROUP BY s.user_name, s.discord_id
     ORDER BY s.discord_id IS NOT NULL, s.user_name COLLATE NOCASE, s.user_name`
  ).all()
  return c.json(results)
})

// ログインしたことのある部員の一覧（管理者が、ひも付け先を選ぶため）
stats.get('/users', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT discord_id, username FROM users ORDER BY username').all()
  return c.json(results)
})

// 取り込んだ過去の記録のひも付け先を変更する（管理者だけ。同じ名前のイベント・トーナメントの参加記録も一緒に付け替える）
// discord_id に部員を指定すると、元のひも付けは外れてその部員の記録になる。null なら未ひも付けに戻す
stats.post('/link', requireAdmin, async (c) => {
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
    // ひも付けは1人1つの名前まで（別の名前がすでにひも付いていたら、先に解除してもらう）
    const linked = await c.env.DB.prepare(
      'SELECT user_name FROM scores WHERE discord_id = ? AND created_by IS NULL AND deleted_at IS NULL AND user_name <> ? LIMIT 1'
    )
      .bind(ownerId, name.value)
      .first<{ user_name: string }>()
    if (linked) {
      return errorJson(c, 400, `${ownerName} さんには、すでに「${linked.user_name}」の記録がひも付いています。先にそちらを「未ひも付け」にしてください`)
    }
  }

  const actor = c.get('user').discord_id
  const target = 'user_name = ? AND created_by IS NULL AND deleted_at IS NULL'
  const before = await c.env.DB.prepare(`SELECT discord_id, COUNT(*) AS count FROM scores WHERE ${target} GROUP BY discord_id`)
    .bind(name.value)
    .all<{ discord_id: string | null; count: number }>()
  if (before.results.length === 0) return errorJson(c, 404, '対象の記録がありません')

  // ひも付け先の変更と操作履歴の記録を1つのトランザクションで行う
  // 同じ名前のイベント・トーナメントの参加記録も一緒に付け替える（entryRelinkStmts）
  const [updated] = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE scores SET discord_id = ?, updated_by = ? WHERE ${target}`).bind(ownerId, actor, name.value),
    ...entryRelinkStmts(c.env.DB, name.value, ownerId),
    auditStmt(c.env.DB, actor, 'claim', 'score', 0, { user_name: name.value, owners: before.results }, { discord_id: ownerId }),
  ])
  return c.json({ ok: true, count: updated.meta.changes, owner: ownerName })
})

// イベント・トーナメントの参加記録のうち、管理者が名前で登録したもの（本人の申し込みではないもの）を付け替える文
// - 本人が自分で申し込んだ記録（created_by が本人）には触らない（名前が同じでも外さないように）
// - 部員に付けるとき、その部員がすでに参加している大会の記録は付け替えない（同じ人が2人分にならないように）
function entryRelinkStmts(db: D1Database, name: string, ownerId: string | null) {
  return [
    ['event_entries', 'ranking_id'],
    ['tournament_entries', 'tournament_id'],
  ].map(([table, parent]) =>
    ownerId
      ? db
          .prepare(
            `UPDATE ${table} SET discord_id = ?1
             WHERE user_name = ?2 AND (discord_id IS NULL OR discord_id <> created_by)
               AND NOT EXISTS (SELECT 1 FROM ${table} o WHERE o.${parent} = ${table}.${parent} AND o.discord_id = ?1 AND o.id <> ${table}.id)`
          )
          .bind(ownerId, name)
      : db
          .prepare(`UPDATE ${table} SET discord_id = NULL WHERE user_name = ? AND discord_id IS NOT NULL AND discord_id <> created_by`)
          .bind(name)
  )
}

export default stats
