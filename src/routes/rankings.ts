import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { validateKind, validatePeriod, validatePlayedOn, validateRankingName } from '../lib/validation'
import { graceEndOf, lastDayOf, monthlyTitle, statusOf, todayJst, type RankingInfo } from '../lib/period'
import { REBUY_CHIPS, START_CHIPS } from '../lib/rules'
import { auditStmt } from '../lib/audit'
import { requireAdmin } from '../lib/session'

// ランキング関連のAPI（/api/rankings）
const rankings = new Hono<AppEnv>()

// 画面表示用に、状態と入力できる期間を付け加える
export function withStatus<T extends RankingInfo>(ranking: T, today = todayJst()) {
  const isMonthly = ranking.kind === 'monthly' && ranking.period
  return {
    ...ranking,
    status: statusOf(ranking, today),
    // 月間リングで入力できる日付の範囲と、入力を受け付ける最終日
    date_min: isMonthly ? `${ranking.period}-01` : null,
    date_max: isMonthly ? lastDayOf(ranking.period!) : null,
    grace_end: isMonthly ? graceEndOf(ranking.period!) : null,
    // 月間リングのチップのルール（画面でScoreを計算して見せるために使う）
    chips: isMonthly ? { start: START_CHIPS, rebuy: REBUY_CHIPS } : null,
  }
}

// ランキング一覧（参加人数つき。イベントは開催日・状態・募集上限・優勝者と、自分が申し込んでいるかも）
// 月間リングは対象の年月、イベントは開催日（未定なら作成日）の年月で、新しい月から並べる。同じ月の中では月間リングを先にする
// ホーム画面でも、サーバーで一覧を埋めて返すために使う
export async function listRankings(db: D1Database, userId: string) {
  const { results } = await db.prepare(
    `SELECT r.id, r.name, r.kind, r.period, r.held_on, r.created_at, r.event_status, r.capacity,
       CASE WHEN r.kind = 'event' THEN (SELECT COUNT(*) FROM event_entries ee WHERE ee.ranking_id = r.id)
         ELSE COUNT(DISTINCT COALESCE(s.discord_id, 'name:' || s.user_name)) END AS participants,
       (SELECT COALESCE(u.username, ee.user_name) FROM event_entries ee LEFT JOIN users u ON u.discord_id = ee.discord_id
        WHERE ee.ranking_id = r.id AND ee.place = 1) AS winner,
       EXISTS (SELECT 1 FROM event_entries ee WHERE ee.ranking_id = r.id AND ee.discord_id = ?) AS entered
     FROM rankings r
     LEFT JOIN scores s ON s.ranking_id = r.id AND s.deleted_at IS NULL
     WHERE r.deleted_at IS NULL
     GROUP BY r.id
     ORDER BY COALESCE(r.period, substr(COALESCE(r.held_on, r.created_at), 1, 7)) DESC, r.kind = 'monthly' DESC,
       COALESCE(r.held_on, r.created_at) DESC, r.id DESC`
  ).bind(userId).all<RankingInfo & { held_on: string | null; created_at: string; participants: number; winner: string | null }>()
  const today = todayJst()
  return results.map((r) => withStatus(r, today))
}

rankings.get('/', async (c) => c.json(await listRankings(c.env.DB, c.get('user').discord_id)))

// ランキング作成（月間リングは年月からタイトルを自動で付ける。管理者だけ）
rankings.post('/', requireAdmin, async (c) => {
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const kind = validateKind(body.kind)
  if (!kind.ok) return errorJson(c, 400, kind.error)

  let name: string
  let period: string | null = null
  let heldOn: string | null = null
  let capacity: number | null = null
  if (kind.value === 'monthly') {
    const p = validatePeriod(body.period)
    if (!p.ok) return errorJson(c, 400, p.error)
    period = p.value
    name = monthlyTitle(period)
    const exists = await c.env.DB.prepare("SELECT id FROM rankings WHERE kind = 'monthly' AND period = ? AND deleted_at IS NULL")
      .bind(period)
      .first()
    if (exists) return errorJson(c, 400, `${name}はすでにあります`)
  } else {
    const n = validateRankingName(body.name, 'イベント名')
    if (!n.ok) return errorJson(c, 400, n.error)
    name = n.value
    // イベントの開催日（空なら未定）
    if (body.held_on !== undefined && body.held_on !== '') {
      const d = validatePlayedOn(body.held_on)
      if (!d.ok) return errorJson(c, 400, '開催日の形式が正しくありません')
      heldOn = d.value
    }
    // イベントの募集上限（空なら上限なし。2〜256人）
    if (body.capacity !== undefined && body.capacity !== null && body.capacity !== '') {
      const n = Number(body.capacity)
      if (!Number.isInteger(n) || n < 2 || n > 256) return errorJson(c, 400, '募集上限は2〜256人の整数で入力してください')
      capacity = n
    }
  }

  const createdAt = new Date().toISOString()
  const actor = c.get('user').discord_id
  try {
    // 作成と操作履歴の記録を1つのトランザクションで行う
    const [inserted] = await c.env.DB.batch<{ id: number }>([
      c.env.DB.prepare(
        'INSERT INTO rankings (name, kind, period, held_on, capacity, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
      ).bind(
        name,
        kind.value,
        period,
        heldOn,
        capacity,
        createdAt,
        actor
      ),
      auditStmt(c.env.DB, actor, 'create', 'ranking', null, null, { name, kind: kind.value, period, held_on: heldOn, capacity }),
    ])
    const id = inserted.results[0].id
    return c.json(withStatus({ id, name, kind: kind.value, period, held_on: heldOn, capacity, event_status: 'entry', created_at: createdAt, participants: 0, winner: null, entered: 0 }), 201)
  } catch (e) {
    // 同時に作成された場合は一意制約で弾かれる
    if (String(e).includes('UNIQUE')) return errorJson(c, 400, `${name}はすでにあります`)
    throw e
  }
})

// ランキング削除（論理削除。データは残し、削除した人と日時を記録する。スコアもランキングと一緒に画面から消える。管理者だけ）
rankings.delete('/:id', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')

  const before = await c.env.DB.prepare('SELECT id, name, kind, period FROM rankings WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first()
  if (!before) return errorJson(c, 404, 'ランキングが見つかりません')

  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE rankings SET deleted_at = ?, deleted_by = ? WHERE id = ?').bind(new Date().toISOString(), actor, id),
    auditStmt(c.env.DB, actor, 'delete', 'ranking', id, before, null),
  ])
  return c.json({ ok: true })
})

export default rankings
