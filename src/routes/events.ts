import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { validateBlinds, validateEventInfo, validateUserName } from '../lib/validation'
import { blindLevelsOf } from '../lib/rules'
import { auditStmt } from '../lib/audit'
import { requireAdmin } from '../lib/session'
import { foul } from '../lib/foul'

// イベント（1日のリングトーナメント。リバイなしで飛んだら終わり）のAPI（/api/events）
// 受付中（entry）：部員が申し込む → 開催中（running）：管理者が飛んだ順にタップして順位を決める → 終了（finished）
// 申し込みのルールはトーナメントと同じ（本人の申し込みは競技ポーカー部のロールを持つ部員だけ、募集上限あり、管理者の手入力は上限を超えてもよい）
const events = new Hono<AppEnv>()

type EventInfo = {
  id: number
  name: string
  held_on: string | null
  capacity: number | null
  blind_minutes: number
  blind_levels: string | null
  status: 'entry' | 'running' | 'finished'
}
type Entry = { id: number; discord_id: string | null; user_name: string; place: number | null }

// 参加者の表示名（本人の申し込みは最新のニックネーム、手入力の参加者は入力した名前）
const ENTRY_NAME = 'COALESCE(u.username, e.user_name)'
const EVENT_COLUMNS = 'id, name, held_on, capacity, blind_minutes, blind_levels, event_status AS status'

function findEvent(db: D1Database, id: number) {
  return db
    .prepare(`SELECT ${EVENT_COLUMNS} FROM rankings WHERE id = ? AND kind = 'event' AND deleted_at IS NULL`)
    .bind(id)
    .first<EventInfo>()
}

function entriesOf(db: D1Database, id: number) {
  return db.prepare('SELECT id, discord_id, user_name, place FROM event_entries WHERE ranking_id = ? ORDER BY id').bind(id).all<Entry>()
}

// イベントの詳細（参加者と順位、自分が申し込めるか）
events.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'イベントIDが正しくありません')
  const [event, entries, member] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ${EVENT_COLUMNS} FROM rankings WHERE id = ? AND kind = 'event' AND deleted_at IS NULL`).bind(id),
    c.env.DB.prepare(
      `SELECT e.id, e.discord_id, ${ENTRY_NAME} AS name, e.place, COALESCE(e.discord_id, 'name:' || e.user_name) AS player_key
       FROM event_entries e LEFT JOIN users u ON u.discord_id = e.discord_id
       WHERE e.ranking_id = ? ORDER BY e.id`
    ).bind(id),
    c.env.DB.prepare('SELECT is_club_member FROM users WHERE discord_id = ?').bind(c.get('user').discord_id),
  ])
  if (event.results.length === 0) return errorJson(c, 404, 'イベントが見つかりません')
  const canEnter = (member.results[0] as { is_club_member: number } | undefined)?.is_club_member === 1
  const ev = event.results[0] as EventInfo
  return c.json({ event: { ...ev, blind_levels: blindLevelsOf(ev.blind_levels) }, entries: entries.results, can_enter: canEnter })
})

// イベントの情報（名前・開催日・募集上限）の変更（管理者だけ。上限は今の参加人数より少なくしてもよい）
events.put('/:id', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'イベントIDが正しくありません')
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')
  const info = validateEventInfo(body, 'イベント名')
  if (!info.ok) return errorJson(c, 400, info.error)
  const ev = await findEvent(c.env.DB, id)
  if (!ev) return errorJson(c, 404, 'イベントが見つかりません')
  const v = info.value
  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE rankings SET name = ?, held_on = ?, capacity = ? WHERE id = ?').bind(v.name, v.held_on, v.capacity, id),
    auditStmt(c.env.DB, actor, 'update', 'ranking', id, { name: ev.name, held_on: ev.held_on, capacity: ev.capacity }, { info: v }),
  ])
  return c.json({ ok: true, ...v })
})

// ブラインドの編集（管理者だけ）。1レベルの時間と段階。levels が null なら標準の段階に戻す
events.put('/:id/blinds', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'イベントIDが正しくありません')
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')
  const blinds = validateBlinds(body)
  if (!blinds.ok) return errorJson(c, 400, blinds.error)
  const ev = await findEvent(c.env.DB, id)
  if (!ev) return errorJson(c, 404, 'イベントが見つかりません')
  const { minutes, levels } = blinds.value
  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE rankings SET blind_minutes = ?, blind_levels = ? WHERE id = ?').bind(minutes, levels && JSON.stringify(levels), id),
    auditStmt(c.env.DB, actor, 'update', 'ranking', id, { blinds: { minutes: ev.blind_minutes, levels: blindLevelsOf(ev.blind_levels) } }, {
      blinds: { minutes, levels: levels ?? blindLevelsOf(null) },
    }),
  ])
  return c.json({ ok: true })
})

// 申し込み。user_name なしなら本人、ありなら（管理者）その名前の人を参加者に加える
events.post('/:id/entries', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'イベントIDが正しくありません')
  const body = (await readJson(c)) ?? {}
  const ev = await findEvent(c.env.DB, id)
  if (!ev) return errorJson(c, 404, 'イベントが見つかりません')
  if (ev.status !== 'entry') return errorJson(c, 400, '申し込みの受付は終了しています')

  const user = c.get('user')
  let entry = { discord_id: user.discord_id as string | null, user_name: user.username }
  const byAdmin = body.user_name !== undefined && body.user_name !== ''
  if (byAdmin) {
    if (!user.is_admin) return foul(c, '他の人のイベントへの申し込み')
    const name = validateUserName(body.user_name)
    if (!name.ok) return errorJson(c, 400, name.error)
    const found = await c.env.DB.prepare('SELECT discord_id FROM users WHERE username = ? LIMIT 2').bind(name.value).all<{ discord_id: string }>()
    entry = { discord_id: found.results.length === 1 ? found.results[0].discord_id : null, user_name: name.value }
  } else {
    // 本人の申し込みは、競技ポーカー部のロールを持っている部員だけ（ロールはログイン時に確認している）
    const member = await c.env.DB.prepare('SELECT is_club_member FROM users WHERE discord_id = ?')
      .bind(user.discord_id)
      .first<{ is_club_member: number }>()
    if (member?.is_club_member !== 1) {
      return errorJson(c, 403, '申し込めるのは競技ポーカー部の部員だけです（ロールを付けてもらった直後なら、ログインし直してください）')
    }
    if (ev.capacity !== null) {
      const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM event_entries WHERE ranking_id = ?').bind(id).first<{ n: number }>()
      if ((count?.n ?? 0) >= ev.capacity) return errorJson(c, 400, `定員（${ev.capacity}人）に達したため、申し込めません`)
    }
  }

  // 同じ人の二重登録を防ぐ（部員は Discord ID、手入力の参加者は名前で判定。管理者が同じ名前を先に手入力していた場合も申し込み済み）
  const dup = await (entry.discord_id
    ? c.env.DB.prepare('SELECT 1 FROM event_entries WHERE ranking_id = ? AND (discord_id = ? OR (discord_id IS NULL AND user_name = ?))').bind(
        id,
        entry.discord_id,
        entry.user_name
      )
    : c.env.DB.prepare('SELECT 1 FROM event_entries WHERE ranking_id = ? AND discord_id IS NULL AND user_name = ?').bind(id, entry.user_name)
  ).first()
  if (dup) return errorJson(c, 400, `${entry.user_name} さんはすでに申し込んでいます`)

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO event_entries (ranking_id, discord_id, user_name, created_at, created_by) VALUES (?, ?, ?, ?, ?)').bind(
      id,
      entry.discord_id,
      entry.user_name,
      new Date().toISOString(),
      user.discord_id
    ),
    auditStmt(c.env.DB, user.discord_id, 'create', 'ranking', id, null, { entry }),
  ])
  return c.json({ ok: true, name: entry.user_name }, 201)
})

// 申し込みの取り消し（受付中のみ。本人の申し込みか、管理者だけ）
events.delete('/:id/entries/:entryId', async (c) => {
  const id = parseId(c.req.param('id'))
  const entryId = parseId(c.req.param('entryId'))
  if (id === null || entryId === null) return errorJson(c, 400, 'IDが正しくありません')
  const ev = await findEvent(c.env.DB, id)
  if (!ev) return errorJson(c, 404, 'イベントが見つかりません')
  if (ev.status !== 'entry') return errorJson(c, 400, '受付を締め切ったあとは取り消せません')
  const entry = await c.env.DB.prepare('SELECT id, discord_id, user_name FROM event_entries WHERE id = ? AND ranking_id = ?')
    .bind(entryId, id)
    .first<{ id: number; discord_id: string | null; user_name: string }>()
  if (!entry) return errorJson(c, 404, '申し込みが見つかりません')
  const user = c.get('user')
  if (!user.is_admin && entry.discord_id !== user.discord_id) return foul(c, '他の人のイベントの申し込みの取り消し')

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM event_entries WHERE id = ?').bind(entryId),
    auditStmt(c.env.DB, user.discord_id, 'delete', 'ranking', id, { entry }, null),
  ])
  return c.json({ ok: true })
})

// 受付を締め切って開催中にする（管理者だけ。参加者が2人以上必要）
events.post('/:id/close', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'イベントIDが正しくありません')
  const ev = await findEvent(c.env.DB, id)
  if (!ev) return errorJson(c, 404, 'イベントが見つかりません')
  if (ev.status !== 'entry') return errorJson(c, 400, 'すでに締め切っています')
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM event_entries WHERE ranking_id = ?').bind(id).first<{ n: number }>()
  if ((count?.n ?? 0) < 2) return errorJson(c, 400, '参加者が2人以上必要です')
  await setStatus(c.env.DB, c.get('user').discord_id, id, ev.status, 'running')
  return c.json({ ok: true })
})

// 受付に戻す（管理者だけ。まだ誰も飛んでいないときだけ）
events.post('/:id/reopen', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'イベントIDが正しくありません')
  const ev = await findEvent(c.env.DB, id)
  if (!ev) return errorJson(c, 404, 'イベントが見つかりません')
  if (ev.status !== 'running') return errorJson(c, 400, '開催中のときだけ受付に戻せます')
  const placed = await c.env.DB.prepare('SELECT 1 FROM event_entries WHERE ranking_id = ? AND place IS NOT NULL LIMIT 1').bind(id).first()
  if (placed) return errorJson(c, 400, '順位が入っているため受付に戻せません。先に「1つ戻す」で取り消してください')
  await setStatus(c.env.DB, c.get('user').discord_id, id, ev.status, 'entry')
  return c.json({ ok: true })
})

function setStatus(db: D1Database, actor: string, id: number, before: string, after: string) {
  return db.batch([
    db.prepare('UPDATE rankings SET event_status = ? WHERE id = ?').bind(after, id),
    auditStmt(db, actor, 'update', 'ranking', id, { status: before }, { status: after }),
  ])
}

// 飛んだ人を記録する（管理者だけ）。残っている人数がその人の順位になり、残りが1人になったらその人が1位で終了
events.post('/:id/bust', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'イベントIDが正しくありません')
  const body = await readJson(c)
  const entryId = typeof body?.entry_id === 'number' ? parseId(String(body.entry_id)) : null
  if (entryId === null) return errorJson(c, 400, '参加者の指定が正しくありません')
  const ev = await findEvent(c.env.DB, id)
  if (!ev) return errorJson(c, 404, 'イベントが見つかりません')
  if (ev.status !== 'running') return errorJson(c, 400, '開催中のときだけ記録できます')

  const { results: entries } = await entriesOf(c.env.DB, id)
  const target = entries.find((e) => e.id === entryId)
  if (!target) return errorJson(c, 404, '参加者が見つかりません')
  if (target.place !== null) return errorJson(c, 400, `${target.user_name} さんはすでに飛んでいます`)
  const remaining = entries.filter((e) => e.place === null)
  const place = remaining.length
  const actor = c.get('user').discord_id

  const stmts = [c.env.DB.prepare('UPDATE event_entries SET place = ? WHERE id = ?').bind(place, entryId)]
  // 残りが1人になったら、その人が1位で終了
  const winner = place === 2 ? remaining.find((e) => e.id !== entryId) : undefined
  if (winner) {
    stmts.push(c.env.DB.prepare('UPDATE event_entries SET place = 1 WHERE id = ?').bind(winner.id))
    stmts.push(c.env.DB.prepare("UPDATE rankings SET event_status = 'finished' WHERE id = ?").bind(id))
  }
  stmts.push(auditStmt(c.env.DB, actor, 'update', 'ranking', id, null, { bust: target.user_name, place, winner: winner?.user_name ?? null }))
  try {
    await c.env.DB.batch(stmts)
  } catch (e) {
    // 別の管理者がほぼ同時に記録すると、同じ順位が2人分にならないよう DB が止める
    if (String(e).includes('UNIQUE')) return errorJson(c, 400, '先にほかの人が記録しました。画面を読み直してください')
    throw e
  }
  return c.json({ ok: true, place, winner: winner?.user_name ?? null })
})

// 最後に記録した「飛んだ」を1つ取り消す（管理者だけ）。終了していたら、1位と2位を取り消して開催中に戻す
events.post('/:id/undo', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, 'イベントIDが正しくありません')
  const ev = await findEvent(c.env.DB, id)
  if (!ev) return errorJson(c, 404, 'イベントが見つかりません')
  if (ev.status === 'entry') return errorJson(c, 400, 'まだ開催されていません')

  const { results: entries } = await entriesOf(c.env.DB, id)
  const placed = entries.filter((e) => e.place !== null).sort((a, b) => (a.place as number) - (b.place as number))
  if (placed.length === 0) return errorJson(c, 400, '取り消す記録がありません')
  // 終了していれば1位と2位（最後に飛んだ人）、開催中なら最後に飛んだ人（いちばん順位の良い人）
  const undo = ev.status === 'finished' ? placed.filter((e) => e.place! <= 2) : [placed[0]]
  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    ...undo.map((e) => c.env.DB.prepare('UPDATE event_entries SET place = NULL WHERE id = ?').bind(e.id)),
    c.env.DB.prepare("UPDATE rankings SET event_status = 'running' WHERE id = ?").bind(id),
    auditStmt(c.env.DB, actor, 'update', 'ranking', id, { undo: undo.map((e) => ({ name: e.user_name, place: e.place })) }, null),
  ])
  return c.json({ ok: true })
})

export default events
