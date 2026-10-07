import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { auditStmt } from '../lib/audit'
import { PLAYER_KEY } from './scores'

// 管理者ページ用のAPI（/api/admin）。index.tsx で requireAdmin を通してから使う
const admin = new Hono<AppEnv>()

const LOG_PAGE = 20

// 操作履歴（新しい順に20件ずつ。?page= でページを指定する。1ページ目から）
// 対象の名前（ランキング名・大会名・記録の持ち主）も一緒に返し、画面で読める文にする
admin.get('/logs', async (c) => {
  const raw = c.req.query('page')
  const page = raw === undefined ? 1 : parseId(raw)
  if (page === null) return errorJson(c, 400, 'ページの指定が正しくありません')
  const [list, count] = await c.env.DB.batch([c.env.DB.prepare(
    `SELECT l.id, l.action, l.target_type, l.target_id, l.before_json, l.after_json, l.created_at,
       COALESCE(a.username, l.actor_discord_id) AS actor,
       CASE l.target_type WHEN 'ranking' THEN rk.name WHEN 'score' THEN sr.name WHEN 'tournament' THEN t.name END AS target_name,
       COALESCE(su.username, sc.user_name) AS score_player,
       sc.played_on AS score_played_on,
       cu.username AS claim_owner
     FROM audit_logs l
     LEFT JOIN users a ON a.discord_id = l.actor_discord_id
     LEFT JOIN rankings rk ON l.target_type = 'ranking' AND rk.id = l.target_id
     LEFT JOIN scores sc ON l.target_type = 'score' AND sc.id = l.target_id
     LEFT JOIN rankings sr ON sr.id = sc.ranking_id
     LEFT JOIN users su ON su.discord_id = sc.discord_id
     LEFT JOIN tournaments t ON l.target_type = 'tournament' AND t.id = l.target_id
     LEFT JOIN users cu ON l.action = 'claim' AND cu.discord_id = json_extract(l.after_json, '$.discord_id')
     ORDER BY l.id DESC
     LIMIT ? OFFSET ?`
  ).bind(LOG_PAGE, (page - 1) * LOG_PAGE),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM audit_logs'),
  ])
  const total = (count.results[0] as { n: number }).n
  return c.json({ logs: list.results, page, pages: Math.max(1, Math.ceil(total / LOG_PAGE)) })
})

// 削除したもの（リング・イベント、記録、大会）。記録は、リングが残っているものの新しい順に100件まで
admin.get('/deleted', async (c) => {
  const [rankings, scores, tournaments] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT r.id, r.name, r.kind, r.period, r.deleted_at, COALESCE(u.username, r.deleted_by) AS deleted_by,
         (SELECT COUNT(*) FROM scores s WHERE s.ranking_id = r.id AND s.deleted_at IS NULL) AS score_count
       FROM rankings r LEFT JOIN users u ON u.discord_id = r.deleted_by
       WHERE r.deleted_at IS NOT NULL ORDER BY r.deleted_at DESC`
    ),
    c.env.DB.prepare(
      `SELECT s.id, r.name AS ranking_name, COALESCE(o.username, s.user_name) AS user_name, s.played_on, s.amount,
         s.deleted_at, COALESCE(u.username, s.deleted_by) AS deleted_by
       FROM scores s
       JOIN rankings r ON r.id = s.ranking_id AND r.deleted_at IS NULL
       LEFT JOIN users o ON o.discord_id = s.discord_id
       LEFT JOIN users u ON u.discord_id = s.deleted_by
       WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC LIMIT 100`
    ),
    c.env.DB.prepare(
      `SELECT t.id, t.name, t.held_on, t.deleted_at, COALESCE(u.username, t.deleted_by) AS deleted_by
       FROM tournaments t LEFT JOIN users u ON u.discord_id = t.deleted_by
       WHERE t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC`
    ),
  ])
  return c.json({ rankings: rankings.results, scores: scores.results, tournaments: tournaments.results })
})

// 削除したものを元に戻す（type：ranking / score / tournament）
admin.post('/restore', async (c) => {
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')
  const id = typeof body.id === 'number' ? parseId(String(body.id)) : null
  if (id === null) return errorJson(c, 400, 'IDが正しくありません')
  const actor = c.get('user').discord_id
  const db = c.env.DB

  if (body.type === 'ranking') {
    const r = await db.prepare('SELECT id, name, kind, period FROM rankings WHERE id = ? AND deleted_at IS NOT NULL')
      .bind(id)
      .first<{ id: number; name: string; kind: string; period: string | null }>()
    if (!r) return errorJson(c, 404, '削除されたリングが見つかりません')
    // 同じ年月の月間リングは1つまで
    if (r.kind === 'monthly') {
      const exists = await db.prepare("SELECT 1 FROM rankings WHERE kind = 'monthly' AND period = ? AND deleted_at IS NULL")
        .bind(r.period)
        .first()
      if (exists) return errorJson(c, 400, `${r.name}がすでにあるため戻せません。先にそちらを削除してください`)
    }
    await db.batch([
      db.prepare('UPDATE rankings SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').bind(id),
      auditStmt(db, actor, 'restore', 'ranking', id, null, r),
    ])
    return c.json({ ok: true, name: r.name })
  }

  if (body.type === 'score') {
    const s = await db.prepare(
      `SELECT s.id, s.ranking_id, ${PLAYER_KEY} AS player_key, s.amount, s.final_chips, s.rebuys, s.played_on
       FROM scores s JOIN rankings r ON r.id = s.ranking_id AND r.deleted_at IS NULL
       WHERE s.id = ? AND s.deleted_at IS NOT NULL`
    )
      .bind(id)
      .first<{ id: number; ranking_id: number; player_key: string; amount: number; final_chips: number | null; rebuys: number | null; played_on: string }>()
    if (!s) return errorJson(c, 404, '削除された記録が見つかりません')
    // 同じ人・同じ日の記録が2件にならないようにする
    const dup = await db.prepare(
      `SELECT 1 FROM scores s WHERE s.ranking_id = ? AND ${PLAYER_KEY} = ? AND s.played_on = ? AND s.deleted_at IS NULL`
    )
      .bind(s.ranking_id, s.player_key, s.played_on)
      .first()
    if (dup) return errorJson(c, 400, '同じ人・同じ日の記録がすでにあるため戻せません')
    const { player_key: _, ...after } = s
    await db.batch([
      db.prepare('UPDATE scores SET deleted_at = NULL, deleted_by = NULL, updated_by = ? WHERE id = ?').bind(actor, id),
      auditStmt(db, actor, 'restore', 'score', id, null, after),
    ])
    return c.json({ ok: true })
  }

  if (body.type === 'tournament') {
    const t = await db.prepare('SELECT id, name, held_on, status FROM tournaments WHERE id = ? AND deleted_at IS NOT NULL')
      .bind(id)
      .first<{ id: number; name: string }>()
    if (!t) return errorJson(c, 404, '削除された大会が見つかりません')
    await db.batch([
      db.prepare('UPDATE tournaments SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').bind(id),
      auditStmt(db, actor, 'restore', 'tournament', id, null, t),
    ])
    return c.json({ ok: true, name: t.name })
  }

  return errorJson(c, 400, '戻す対象の種類が正しくありません')
})

// 管理者の一覧（最後にログインしたときに、運営サーバーのメンバーだった人）
admin.get('/admins', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT discord_id, username, last_login_at FROM users WHERE is_admin = 1 ORDER BY username'
  ).all()
  return c.json(results)
})

export default admin
