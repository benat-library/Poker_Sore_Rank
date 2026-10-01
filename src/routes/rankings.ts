import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { validateRankingName } from '../lib/validation'

// ランキング関連のAPI（/api/rankings）
const rankings = new Hono<AppEnv>()

// ランキング一覧（新しい順、参加人数つき）
rankings.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.name, r.created_at, COUNT(DISTINCT s.user_name) AS participants
     FROM rankings r
     LEFT JOIN scores s ON s.ranking_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC, r.id DESC`
  ).all()
  return c.json(results)
})

// ランキング作成
rankings.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const name = validateRankingName(body.name)
  if (!name.ok) return errorJson(c, 400, name.error)

  const createdAt = new Date().toISOString()
  const row = await c.env.DB.prepare('INSERT INTO rankings (name, created_at) VALUES (?, ?) RETURNING id')
    .bind(name.value, createdAt)
    .first<{ id: number }>()
  return c.json({ id: row!.id, name: name.value, created_at: createdAt, participants: 0 }, 201)
})

// ランキング削除（そのランキングのスコアもまとめて削除する）
rankings.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')

  // batch は1つのトランザクションとして実行されるため、途中で失敗しても片方だけ消えることはない
  const [, result] = await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM scores WHERE ranking_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM rankings WHERE id = ?').bind(id),
  ])
  if (result.meta.changes === 0) return errorJson(c, 404, 'ランキングが見つかりません')
  return c.json({ ok: true })
})

export default rankings
