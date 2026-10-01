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

// スコア登録
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
  // discord_id は第1版では常に NULL
  const row = await c.env.DB.prepare(
    `INSERT INTO scores (ranking_id, user_name, discord_id, amount, played_on, created_at)
     VALUES (?, ?, NULL, ?, ?, ?) RETURNING id`
  )
    .bind(id, userName.value, amount.value, playedOn.value, createdAt)
    .first<{ id: number }>()
  return c.json(
    { id: row!.id, ranking_id: id, user_name: userName.value, amount: amount.value, played_on: playedOn.value, created_at: createdAt },
    201
  )
})
