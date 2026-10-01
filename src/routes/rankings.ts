import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { validateKind, validatePeriod, validateRankingName } from '../lib/validation'
import { graceEndOf, lastDayOf, monthlyTitle, statusOf, todayJst, type RankingInfo } from '../lib/period'
import { REBUY_CHIPS, START_CHIPS } from '../lib/rules'
import { auditStmt } from '../lib/audit'

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

// ランキング一覧（新しい順、参加人数つき）
rankings.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.name, r.kind, r.period, r.created_at,
       COUNT(DISTINCT COALESCE(s.discord_id, 'name:' || s.user_name)) AS participants
     FROM rankings r
     LEFT JOIN scores s ON s.ranking_id = r.id AND s.deleted_at IS NULL
     WHERE r.deleted_at IS NULL
     GROUP BY r.id
     ORDER BY r.created_at DESC, r.id DESC`
  ).all<RankingInfo & { created_at: string; participants: number }>()
  const today = todayJst()
  return c.json(results.map((r) => withStatus(r, today)))
})

// ランキング作成（月間リングは年月からタイトルを自動で付ける）
rankings.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const kind = validateKind(body.kind)
  if (!kind.ok) return errorJson(c, 400, kind.error)

  let name: string
  let period: string | null = null
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
    const n = validateRankingName(body.name)
    if (!n.ok) return errorJson(c, 400, n.error)
    name = n.value
  }

  const createdAt = new Date().toISOString()
  const actor = c.get('user').discord_id
  try {
    // 作成と操作履歴の記録を1つのトランザクションで行う
    const [inserted] = await c.env.DB.batch<{ id: number }>([
      c.env.DB.prepare('INSERT INTO rankings (name, kind, period, created_at, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id').bind(
        name,
        kind.value,
        period,
        createdAt,
        actor
      ),
      auditStmt(c.env.DB, actor, 'create', 'ranking', null, null, { name, kind: kind.value, period }),
    ])
    const id = inserted.results[0].id
    return c.json(withStatus({ id, name, kind: kind.value, period, created_at: createdAt, participants: 0 }), 201)
  } catch (e) {
    // 同時に作成された場合は一意制約で弾かれる
    if (String(e).includes('UNIQUE')) return errorJson(c, 400, `${name}はすでにあります`)
    throw e
  }
})

// ランキング削除（論理削除。データは残し、削除した人と日時を記録する。スコアもランキングと一緒に画面から消える）
rankings.delete('/:id', async (c) => {
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
