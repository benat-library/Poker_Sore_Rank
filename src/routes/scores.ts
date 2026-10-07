import { Hono } from 'hono'
import type { AppEnv, LoginUser } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { validateAmount, validateFinalChips, validatePlayedOn, validateRebuys, validateUserName, type Result } from '../lib/validation'
import { scoreFromChips } from '../lib/rules'
import { checkWritable, type RankingInfo } from '../lib/period'
import { auditStmt } from '../lib/audit'
import { foul } from '../lib/foul'
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
         s.id AS score_id, s.ranking_id, ${PLAYER_KEY} AS player_key, s.discord_id, s.amount, s.final_chips, s.rebuys, s.played_on
       FROM scores s JOIN rankings r ON r.id = s.ranking_id
       WHERE s.id = ? AND s.deleted_at IS NULL AND r.deleted_at IS NULL`
    )
    .bind(scoreId)
    .first<RankingInfo & ScoreValues & { score_id: number; ranking_id: number; player_key: string; discord_id: string | null; played_on: string }>()
}

type ScoreValues = { amount: number; final_chips: number | null; rebuys: number | null }

// 修正・削除できるのは、本人の記録（ひも付いた Discord ID が自分）か、管理者だけ
function canEdit(user: LoginUser, score: { discord_id: string | null }) {
  return user.is_admin || score.discord_id === user.discord_id
}

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

// 記録する人（discord_id：ひも付け先、user_name：記録上の名前、created_by：入力者。取り込み扱いの記録は空）
type ScoreOwner = { discord_id: string | null; user_name: string; created_by: string | null }

// 管理者が、名前を手入力して他の人の分を登録するときの記録先を決める
// ログインしたことのある部員の名前か、部員にひも付いた過去の記録の名前と一致すれば（1人に決まるときだけ）、その部員の記録にする
// 一致しなければ、取り込んだ過去の記録と同じ扱い（created_by が空）にし、その人の初回ログイン時に自動でひも付くようにする
export async function ownerByName(db: D1Database, name: string, actor: string): Promise<ScoreOwner> {
  const { results } = await db
    .prepare(
      `SELECT discord_id FROM users WHERE username = ?1
       UNION SELECT discord_id FROM scores WHERE user_name = ?1 AND discord_id IS NOT NULL AND deleted_at IS NULL
       LIMIT 2`
    )
    .bind(name)
    .all<{ discord_id: string }>()
  if (results.length === 1) return { discord_id: results[0].discord_id, user_name: name, created_by: actor }
  return { discord_id: null, user_name: name, created_by: null }
}

// スコア登録（ログイン中の本人の記録として登録する。同じ日の入力がすでにあれば上書きする）
// user_name を付けると（管理者）、その名前の人の記録として登録する
rankingScores.post('/:id/scores', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')

  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const ranking = await rankingStmt(c.env.DB, id).first<RankingInfo>()
  if (!ranking) return errorJson(c, 404, 'ランキングが見つかりません')
  // イベントは Score ではなく、管理者が順位で記録する（/api/events）
  if (ranking.kind === 'event') return errorJson(c, 400, 'イベントの結果は、管理者が順位で入力します')

  const values = readScoreValues(body, ranking)
  if (!values.ok) return errorJson(c, 400, values.error)
  const playedOn = validatePlayedOn(body.played_on)
  if (!playedOn.ok) return errorJson(c, 400, playedOn.error)
  const notWritable = checkWritable(ranking, playedOn.value)
  if (notWritable) return errorJson(c, 400, notWritable)

  const user = c.get('user')
  let owner: ScoreOwner = { discord_id: user.discord_id, user_name: user.username, created_by: user.discord_id }
  if (body.user_name !== undefined && body.user_name !== '') {
    // 他の人の分の登録は管理者だけ
    if (!user.is_admin) return foul(c, '他の人の分のスコア登録')
    const name = validateUserName(body.user_name)
    if (!name.ok) return errorJson(c, 400, name.error)
    owner = await ownerByName(c.env.DB, name.value, user.discord_id)
  }

  const now = new Date().toISOString()
  const v = values.value
  // 同じ人・同じ日の入力を探す（ひも付いた人は Discord ID、まだの人は名前で判定する）
  const existing = await (owner.discord_id
    ? c.env.DB.prepare(
        `SELECT id, amount, final_chips, rebuys, played_on FROM scores
         WHERE ranking_id = ? AND discord_id = ? AND played_on = ? AND deleted_at IS NULL`
      ).bind(id, owner.discord_id, playedOn.value)
    : c.env.DB.prepare(
        `SELECT id, amount, final_chips, rebuys, played_on FROM scores
         WHERE ranking_id = ? AND discord_id IS NULL AND user_name = ? AND played_on = ? AND deleted_at IS NULL`
      ).bind(id, owner.user_name, playedOn.value)
  ).first<ScoreValues & { id: number; played_on: string }>()

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
    return c.json({ id: existing.id, user_name: owner.user_name, ...v, played_on: playedOn.value, overwritten: true })
  }

  const [inserted] = await c.env.DB.batch<{ id: number }>([
    c.env.DB.prepare(
      `INSERT INTO scores (ranking_id, user_name, discord_id, amount, final_chips, rebuys, played_on, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(id, owner.user_name, owner.discord_id, v.amount, v.final_chips, v.rebuys, playedOn.value, now, owner.created_by),
    auditStmt(c.env.DB, user.discord_id, 'create', 'score', null, null, {
      ranking_id: id,
      user_name: owner.user_name,
      discord_id: owner.discord_id,
      ...v,
      played_on: playedOn.value,
    }),
  ])
  return c.json({ id: inserted.results[0].id, user_name: owner.user_name, ...v, played_on: playedOn.value, overwritten: false }, 201)
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
  if (!canEdit(c.get('user'), target)) return foul(c, '他の人のスコアの修正')

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
  if (!canEdit(c.get('user'), target)) return foul(c, '他の人のスコアの削除')
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
