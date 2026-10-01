import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { validateAmount, validateFinalChips, validatePlayedOn, validateRebuys, type Result } from '../lib/validation'
import { scoreFromChips } from '../lib/rules'
import { checkWritable, type RankingInfo } from '../lib/period'
import { auditStmt } from '../lib/audit'
import { withStatus } from './rankings'

// 同じ人の判定に使うキー。Discord とひも付いた記録は Discord ID、まだの記録は名前で判定する
// 表示名は、ひも付いていれば最新の Discord ユーザー名、まだなら入力時の名前
export const PLAYER_KEY = "COALESCE(s.discord_id, 'name:' || s.user_name)"
export const PLAYER_NAME = 'COALESCE(u.username, s.user_name)'
const SCORE_COLUMNS = `s.id, s.ranking_id, ${PLAYER_NAME} AS user_name, ${PLAYER_KEY} AS player_key, s.discord_id,
  s.amount, s.final_chips, s.rebuys, s.played_on, s.created_at`

// ランキング配下のスコアAPI（/api/rankings/:id/...）
export const rankingScores = new Hono<AppEnv>()

// ランキングを取得する文（削除済みは除く）
function rankingStmt(db: D1Database, id: number) {
  return db.prepare('SELECT id, name, kind, period FROM rankings WHERE id = ? AND deleted_at IS NULL').bind(id)
}

// スコアが属するランキングと、スコアの現在の内容を返す（どちらかが削除済みなら null）
async function findScore(db: D1Database, scoreId: number) {
  return db
    .prepare(
      `SELECT r.id, r.name, r.kind, r.period,
         s.id AS score_id, s.ranking_id, ${PLAYER_KEY} AS player_key, s.amount, s.final_chips, s.rebuys, s.played_on
       FROM scores s JOIN rankings r ON r.id = s.ranking_id
       WHERE s.id = ? AND s.deleted_at IS NULL AND r.deleted_at IS NULL`
    )
    .bind(scoreId)
    .first<RankingInfo & ScoreValues & { score_id: number; ranking_id: number; player_key: string; played_on: string }>()
}

type ScoreValues = { amount: number; final_chips: number | null; rebuys: number | null }

// 入力されたScoreを読み取る
// 月間リングは最終チップ数とRebuy回数からScoreを計算し、イベントはScoreをそのまま受け取る
function readScoreValues(body: Record<string, unknown>, ranking: RankingInfo): Result<ScoreValues> {
  if (ranking.kind === 'monthly') {
    const finalChips = validateFinalChips(body.final_chips)
    if (!finalChips.ok) return finalChips
    const rebuys = validateRebuys(body.rebuys ?? 0)
    if (!rebuys.ok) return rebuys
    const amount = validateAmount(scoreFromChips(finalChips.value, rebuys.value))
    if (!amount.ok) return amount
    return { ok: true, value: { amount: amount.value, final_chips: finalChips.value, rebuys: rebuys.value } }
  }
  const amount = validateAmount(body.amount)
  if (!amount.ok) return amount
  return { ok: true, value: { amount: amount.value, final_chips: null, rebuys: null } }
}

// スコア一覧（新しい順）。?player= を付けるとその人の分だけ返す
rankingScores.get('/:id/scores', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')

  const player = c.req.query('player')
  const from = 'FROM scores s LEFT JOIN users u ON u.discord_id = s.discord_id WHERE s.ranking_id = ? AND s.deleted_at IS NULL'
  const order = 'ORDER BY s.played_on DESC, s.created_at DESC, s.id DESC'
  const stmt =
    player === undefined
      ? c.env.DB.prepare(`SELECT ${SCORE_COLUMNS} ${from} ${order}`).bind(id)
      : c.env.DB.prepare(`SELECT ${SCORE_COLUMNS} ${from} AND ${PLAYER_KEY} = ? ${order}`).bind(id, player)
  // DBとの往復を1回にするため、存在確認とスコア取得をまとめて送る
  const [ranking, scores] = await c.env.DB.batch([rankingStmt(c.env.DB, id), stmt])
  if (ranking.results.length === 0) return errorJson(c, 404, 'ランキングが見つかりません')
  return c.json(scores.results)
})

// 集計済み順位表（合計Scoreの降順）。参加回数は同じ日の入力を1回と数える
rankingScores.get('/:id/summary', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')

  // DBとの往復を1回にするため、ランキング取得と集計をまとめて送る
  const [rankingResult, summary] = await c.env.DB.batch([
    rankingStmt(c.env.DB, id),
    c.env.DB.prepare(
      `SELECT ${PLAYER_KEY} AS player_key, MAX(${PLAYER_NAME}) AS user_name,
         SUM(s.amount) AS total, COUNT(DISTINCT s.played_on) AS days
       FROM scores s LEFT JOIN users u ON u.discord_id = s.discord_id
       WHERE s.ranking_id = ? AND s.deleted_at IS NULL
       GROUP BY player_key
       ORDER BY total DESC, user_name ASC`
    ).bind(id),
  ])
  const ranking = rankingResult.results[0] as RankingInfo | undefined
  if (!ranking) return errorJson(c, 404, 'ランキングが見つかりません')
  return c.json({ ranking: withStatus(ranking), rows: summary.results })
})

// スコア登録（ログイン中の本人の記録として登録する。同じ日の入力がすでにあれば上書きする）
rankingScores.post('/:id/scores', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')

  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const ranking = await rankingStmt(c.env.DB, id).first<RankingInfo>()
  if (!ranking) return errorJson(c, 404, 'ランキングが見つかりません')

  const values = readScoreValues(body, ranking)
  if (!values.ok) return errorJson(c, 400, values.error)
  const playedOn = validatePlayedOn(body.played_on)
  if (!playedOn.ok) return errorJson(c, 400, playedOn.error)
  const notWritable = checkWritable(ranking, playedOn.value)
  if (notWritable) return errorJson(c, 400, notWritable)

  const user = c.get('user')
  const now = new Date().toISOString()
  const v = values.value
  const existing = await c.env.DB.prepare(
    `SELECT id, amount, final_chips, rebuys, played_on FROM scores
     WHERE ranking_id = ? AND discord_id = ? AND played_on = ? AND deleted_at IS NULL`
  )
    .bind(id, user.discord_id, playedOn.value)
    .first<ScoreValues & { id: number; played_on: string }>()

  if (existing) {
    // 同じ日の入力を上書きする（変更前の内容は操作履歴に残る）
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE scores SET amount = ?, final_chips = ?, rebuys = ?, updated_by = ? WHERE id = ?').bind(
        v.amount,
        v.final_chips,
        v.rebuys,
        user.discord_id,
        existing.id
      ),
      auditStmt(c.env.DB, user.discord_id, 'update', 'score', existing.id, existing, { ...v, played_on: playedOn.value }),
    ])
    return c.json({ id: existing.id, ...v, played_on: playedOn.value, overwritten: true })
  }

  const [inserted] = await c.env.DB.batch<{ id: number }>([
    c.env.DB.prepare(
      `INSERT INTO scores (ranking_id, user_name, discord_id, amount, final_chips, rebuys, played_on, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(id, user.username, user.discord_id, v.amount, v.final_chips, v.rebuys, playedOn.value, now, user.discord_id),
    auditStmt(c.env.DB, user.discord_id, 'create', 'score', null, null, {
      ranking_id: id,
      user_name: user.username,
      ...v,
      played_on: playedOn.value,
    }),
  ])
  return c.json({ id: inserted.results[0].id, ...v, played_on: playedOn.value, overwritten: false }, 201)
})

// スコア単体のAPI（/api/scores/:id）
export const scores = new Hono<AppEnv>()

// スコア修正（変更できるのは Score（月間リングは最終チップ数・Rebuy回数）と日付のみ）
scores.put('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'スコアIDが正しくありません')

  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const target = await findScore(c.env.DB, id)
  if (!target) return errorJson(c, 404, 'スコアが見つかりません')

  const values = readScoreValues(body, target)
  if (!values.ok) return errorJson(c, 400, values.error)
  const playedOn = validatePlayedOn(body.played_on)
  if (!playedOn.ok) return errorJson(c, 400, playedOn.error)
  const notWritable = checkWritable(target, playedOn.value)
  if (notWritable) return errorJson(c, 400, notWritable)

  // 日付を変えた結果、同じ人・同じ日の入力が2件にならないようにする
  const duplicate = await c.env.DB.prepare(
    `SELECT s.id FROM scores s
     WHERE s.ranking_id = ? AND ${PLAYER_KEY} = ? AND s.played_on = ? AND s.id <> ? AND s.deleted_at IS NULL`
  )
    .bind(target.ranking_id, target.player_key, playedOn.value, id)
    .first()
  if (duplicate) return errorJson(c, 400, 'その日付にはすでに入力があります。そちらを編集してください')

  const actor = c.get('user').discord_id
  const v = values.value
  const before = { amount: target.amount, final_chips: target.final_chips, rebuys: target.rebuys, played_on: target.played_on }
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE scores SET amount = ?, final_chips = ?, rebuys = ?, played_on = ?, updated_by = ? WHERE id = ?').bind(
      v.amount,
      v.final_chips,
      v.rebuys,
      playedOn.value,
      actor,
      id
    ),
    auditStmt(c.env.DB, actor, 'update', 'score', id, before, { ...v, played_on: playedOn.value }),
  ])
  return c.json({ id, ...v, played_on: playedOn.value })
})

// スコア削除（論理削除。データは残し、削除した人と日時を記録する）
scores.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'スコアIDが正しくありません')

  const target = await findScore(c.env.DB, id)
  if (!target) return errorJson(c, 404, 'スコアが見つかりません')
  const notWritable = checkWritable(target, null)
  if (notWritable) return errorJson(c, 400, notWritable)

  const actor = c.get('user').discord_id
  const before = { amount: target.amount, final_chips: target.final_chips, rebuys: target.rebuys, played_on: target.played_on }
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE scores SET deleted_at = ?, deleted_by = ? WHERE id = ?').bind(new Date().toISOString(), actor, id),
    auditStmt(c.env.DB, actor, 'delete', 'score', id, before, null),
  ])
  return c.json({ ok: true })
})
