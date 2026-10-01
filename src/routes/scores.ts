import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { validateAmount, validatePlayedOn, validateUserName } from '../lib/validation'

// ランキング配下のスコアAPI（/api/rankings/:id/...）
export const rankingScores = new Hono<AppEnv>()

// ランキングが存在するか確認し、存在すれば名前を返す
async function findRanking(db: D1Database, id: number) {
  return db.prepare('SELECT id, name FROM rankings WHERE id = ?').bind(id).first<{ id: number; name: string }>()
}

// スコア一覧（新しい順）。?user_name= を付けるとその人の分だけ返す
rankingScores.get('/:id/scores', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')
  if (!(await findRanking(c.env.DB, id))) return errorJson(c, 404, 'ランキングが見つかりません')

  const userName = c.req.query('user_name')
  const columns = 'id, ranking_id, user_name, amount, played_on, created_at'
  const order = 'ORDER BY played_on DESC, created_at DESC, id DESC'
  const stmt =
    userName === undefined
      ? c.env.DB.prepare(`SELECT ${columns} FROM scores WHERE ranking_id = ? ${order}`).bind(id)
      : c.env.DB.prepare(`SELECT ${columns} FROM scores WHERE ranking_id = ? AND user_name = ? ${order}`).bind(id, userName.trim())
  const { results } = await stmt.all()
  return c.json(results)
})

// 集計済み順位表（合計Scoreの降順）。参加回数は同じ日の入力を1回と数える
rankingScores.get('/:id/summary', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')
  const ranking = await findRanking(c.env.DB, id)
  if (!ranking) return errorJson(c, 404, 'ランキングが見つかりません')

  const { results } = await c.env.DB.prepare(
    `SELECT user_name, SUM(amount) AS total, COUNT(DISTINCT played_on) AS days
     FROM scores
     WHERE ranking_id = ?
     GROUP BY user_name
     ORDER BY total DESC, user_name ASC`
  )
    .bind(id)
    .all()
  return c.json({ ranking, rows: results })
})

// スコア登録（同じ人・同じ日の入力がすでにあれば上書きする）
rankingScores.post('/:id/scores', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')

  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const userName = validateUserName(body.user_name)
  if (!userName.ok) return errorJson(c, 400, userName.error)
  const amount = validateAmount(body.amount)
  if (!amount.ok) return errorJson(c, 400, amount.error)
  const playedOn = validatePlayedOn(body.played_on)
  if (!playedOn.ok) return errorJson(c, 400, playedOn.error)

  if (!(await findRanking(c.env.DB, id))) return errorJson(c, 404, 'ランキングが見つかりません')

  const createdAt = new Date().toISOString()
  // 同日の既存分の削除と新規登録を1つのトランザクションで行う（discord_id は第1版では常に NULL）
  const [deleted, inserted] = await c.env.DB.batch<{ id: number }>([
    c.env.DB.prepare('DELETE FROM scores WHERE ranking_id = ? AND user_name = ? AND played_on = ?').bind(
      id,
      userName.value,
      playedOn.value
    ),
    c.env.DB.prepare(
      `INSERT INTO scores (ranking_id, user_name, discord_id, amount, played_on, created_at)
       VALUES (?, ?, NULL, ?, ?, ?) RETURNING id`
    ).bind(id, userName.value, amount.value, playedOn.value, createdAt),
  ])
  const overwritten = deleted.meta.changes > 0
  return c.json(
    {
      id: inserted.results[0].id,
      ranking_id: id,
      user_name: userName.value,
      amount: amount.value,
      played_on: playedOn.value,
      created_at: createdAt,
      overwritten,
    },
    overwritten ? 200 : 201
  )
})

// スコア単体のAPI（/api/scores/:id）
export const scores = new Hono<AppEnv>()

// スコア修正（変更できるのは Score と日付のみ）
scores.put('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'スコアIDが正しくありません')

  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const amount = validateAmount(body.amount)
  if (!amount.ok) return errorJson(c, 400, amount.error)
  const playedOn = validatePlayedOn(body.played_on)
  if (!playedOn.ok) return errorJson(c, 400, playedOn.error)

  // 日付を変えた結果、同じ人・同じ日の入力が2件にならないようにする
  const duplicate = await c.env.DB.prepare(
    `SELECT other.id FROM scores AS target
     JOIN scores AS other
       ON other.ranking_id = target.ranking_id AND other.user_name = target.user_name AND other.id <> target.id
     WHERE target.id = ? AND other.played_on = ?`
  )
    .bind(id, playedOn.value)
    .first()
  if (duplicate) return errorJson(c, 400, 'その日付にはすでに入力があります。そちらを編集してください')

  const row = await c.env.DB.prepare(
    `UPDATE scores SET amount = ?, played_on = ? WHERE id = ?
     RETURNING id, ranking_id, user_name, amount, played_on, created_at`
  )
    .bind(amount.value, playedOn.value, id)
    .first()
  if (!row) return errorJson(c, 404, 'スコアが見つかりません')
  return c.json(row)
})

// スコア削除
scores.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'スコアIDが正しくありません')

  const result = await c.env.DB.prepare('DELETE FROM scores WHERE id = ?').bind(id).run()
  if (result.meta.changes === 0) return errorJson(c, 404, 'スコアが見つかりません')
  return c.json({ ok: true })
})
