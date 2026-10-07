import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId, readJson } from '../lib/http'
import { validateBlinds, validateEventInfo, validatePlayedOn, validateRankingName, validateUserName } from '../lib/validation'
import { blindLevelsOf } from '../lib/rules'
import { auditStmt } from '../lib/audit'
import { buildBracket } from '../lib/bracket'
import { requireAdmin } from '../lib/session'
import { foul } from '../lib/foul'

// トーナメント（1対1の勝ち抜き戦）のAPI（/api/tournaments）
// 大会の作成・削除、組み合わせ作成、結果の入力、代理での申し込み・取り消しは管理者だけ
const tournaments = new Hono<AppEnv>()

type Tournament = {
  id: number
  name: string
  held_on: string | null
  capacity: number | null
  blind_minutes: number
  blind_levels: string | null
  status: 'entry' | 'running' | 'finished'
}
type Match = {
  id: number
  round: number
  slot: number
  player1_entry_id: number | null
  player2_entry_id: number | null
  winner_entry_id: number | null
  next_round: number | null
  next_slot: number | null
  next_side: 'player1' | 'player2' | null
}

// 参加者の表示名（本人の申し込みは最新のニックネーム、手入力の参加者は入力した名前）
const ENTRY_NAME = 'COALESCE(u.username, e.user_name)'

function findTournament(db: D1Database, id: number) {
  return db
    .prepare('SELECT id, name, held_on, capacity, blind_minutes, blind_levels, status FROM tournaments WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<Tournament>()
}

// 結果が1つでも入っているか（入っていれば、組み合わせの作り直しや受付に戻すことはできない）
async function hasResults(db: D1Database, id: number) {
  const row = await db
    .prepare('SELECT 1 FROM tournament_matches WHERE tournament_id = ? AND winner_entry_id IS NOT NULL LIMIT 1')
    .bind(id)
    .first()
  return row !== null
}

// 大会の一覧（開催日の新しい順。参加人数と、自分が申し込んでいるか）
// ホーム画面でも、サーバーで一覧を埋めて返すために使う
export async function listTournaments(db: D1Database, me: string) {
  const { results } = await db.prepare(
    `SELECT t.id, t.name, t.held_on, t.capacity, t.status, COUNT(e.id) AS entries, COALESCE(MAX(e.discord_id = ?), 0) AS entered
     FROM tournaments t LEFT JOIN tournament_entries e ON e.tournament_id = t.id
     WHERE t.deleted_at IS NULL
     GROUP BY t.id
     ORDER BY COALESCE(t.held_on, substr(t.created_at, 1, 10)) DESC, t.id DESC`
  )
    .bind(me)
    .all<{ id: number; name: string; held_on: string | null; capacity: number | null; status: Tournament['status']; entries: number; entered: number }>()
  return results
}

tournaments.get('/', async (c) => c.json(await listTournaments(c.env.DB, c.get('user').discord_id)))

// 大会の作成
tournaments.post('/', requireAdmin, async (c) => {
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')
  const name = validateRankingName(body.name, '大会名')
  if (!name.ok) return errorJson(c, 400, name.error)
  let heldOn: string | null = null
  if (body.held_on !== undefined && body.held_on !== '') {
    const d = validatePlayedOn(body.held_on)
    if (!d.ok) return errorJson(c, 400, '開催日の形式が正しくありません')
    heldOn = d.value
  }
  // 募集上限（空なら上限なし。2〜256人）
  let capacity: number | null = null
  if (body.capacity !== undefined && body.capacity !== null && body.capacity !== '') {
    const n = Number(body.capacity)
    if (!Number.isInteger(n) || n < 2 || n > 256) return errorJson(c, 400, '募集上限は2〜256人の整数で入力してください')
    capacity = n
  }

  const actor = c.get('user').discord_id
  const [inserted] = await c.env.DB.batch<{ id: number }>([
    c.env.DB.prepare('INSERT INTO tournaments (name, held_on, capacity, created_at, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id').bind(
      name.value,
      heldOn,
      capacity,
      new Date().toISOString(),
      actor
    ),
    auditStmt(c.env.DB, actor, 'create', 'tournament', null, null, { name: name.value, held_on: heldOn, capacity }),
  ])
  return c.json({ id: inserted.results[0].id, name: name.value, held_on: heldOn, capacity, status: 'entry' }, 201)
})

// 大会の情報（名前・開催日・募集上限）の変更（管理者だけ。上限は今の参加人数より少なくしてもよい）
tournaments.put('/:id', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, '大会IDが正しくありません')
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')
  const info = validateEventInfo(body, '大会名')
  if (!info.ok) return errorJson(c, 400, info.error)
  const t = await findTournament(c.env.DB, id)
  if (!t) return errorJson(c, 404, '大会が見つかりません')
  const v = info.value
  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tournaments SET name = ?, held_on = ?, capacity = ? WHERE id = ?').bind(v.name, v.held_on, v.capacity, id),
    auditStmt(c.env.DB, actor, 'update', 'tournament', id, { name: t.name, held_on: t.held_on, capacity: t.capacity }, { info: v }),
  ])
  return c.json({ ok: true, ...v })
})

// ブラインドの編集（管理者だけ）。1レベルの時間と段階。levels が null なら標準の段階に戻す
tournaments.put('/:id/blinds', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, '大会IDが正しくありません')
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')
  const blinds = validateBlinds(body)
  if (!blinds.ok) return errorJson(c, 400, blinds.error)
  const t = await findTournament(c.env.DB, id)
  if (!t) return errorJson(c, 404, '大会が見つかりません')
  const { minutes, levels } = blinds.value
  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tournaments SET blind_minutes = ?, blind_levels = ? WHERE id = ?').bind(minutes, levels && JSON.stringify(levels), id),
    auditStmt(c.env.DB, actor, 'update', 'tournament', id, { blinds: { minutes: t.blind_minutes, levels: blindLevelsOf(t.blind_levels) } }, {
      blinds: { minutes, levels: levels ?? blindLevelsOf(null) },
    }),
  ])
  return c.json({ ok: true })
})

// 大会の削除（論理削除）
tournaments.delete('/:id', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, '大会IDが正しくありません')
  const t = await findTournament(c.env.DB, id)
  if (!t) return errorJson(c, 404, '大会が見つかりません')
  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tournaments SET deleted_at = ?, deleted_by = ? WHERE id = ?').bind(new Date().toISOString(), actor, id),
    auditStmt(c.env.DB, actor, 'delete', 'tournament', id, t, null),
  ])
  return c.json({ ok: true })
})

// 大会の詳細（参加者と対戦）
tournaments.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, '大会IDが正しくありません')
  const [t, entries, matches, member] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, name, held_on, capacity, blind_minutes, blind_levels, status FROM tournaments WHERE id = ? AND deleted_at IS NULL').bind(id),
    c.env.DB.prepare(
      `SELECT e.id, e.discord_id, ${ENTRY_NAME} AS name
       FROM tournament_entries e LEFT JOIN users u ON u.discord_id = e.discord_id
       WHERE e.tournament_id = ? ORDER BY e.id`
    ).bind(id),
    c.env.DB.prepare(
      `SELECT id, round, slot, player1_entry_id, player2_entry_id, winner_entry_id, next_round, next_slot, next_side
       FROM tournament_matches WHERE tournament_id = ? ORDER BY round, slot`
    ).bind(id),
    // 申し込めるのは競技ポーカー部のロールを持っている部員だけ
    c.env.DB.prepare('SELECT is_club_member FROM users WHERE discord_id = ?').bind(c.get('user').discord_id),
  ])
  if (t.results.length === 0) return errorJson(c, 404, '大会が見つかりません')
  const canEnter = (member.results[0] as { is_club_member: number } | undefined)?.is_club_member === 1
  const info = t.results[0] as Tournament
  return c.json({ tournament: { ...info, blind_levels: blindLevelsOf(info.blind_levels) }, entries: entries.results, matches: matches.results, can_enter: canEnter })
})

// 申し込み。user_name なしなら本人、ありなら（管理者）その名前の人を参加者に加える
// 名前がログインしたことのある部員と一致すれば、その部員として登録する
tournaments.post('/:id/entries', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, '大会IDが正しくありません')
  const body = (await readJson(c)) ?? {}
  const t = await findTournament(c.env.DB, id)
  if (!t) return errorJson(c, 404, '大会が見つかりません')
  if (t.status !== 'entry') return errorJson(c, 400, '申し込みの受付は終了しています')

  const user = c.get('user')
  let entry = { discord_id: user.discord_id as string | null, user_name: user.username }
  const byAdmin = body.user_name !== undefined && body.user_name !== ''
  if (!byAdmin) {
    // 本人の申し込みは、競技ポーカー部のロールを持っている部員だけ（ロールはログイン時に確認している）
    const member = await c.env.DB.prepare('SELECT is_club_member FROM users WHERE discord_id = ?')
      .bind(user.discord_id)
      .first<{ is_club_member: number }>()
    if (member?.is_club_member !== 1) {
      return errorJson(c, 403, '申し込めるのは競技ポーカー部の部員だけです（ロールを付けてもらった直後なら、ログインし直してください）')
    }
    // 募集上限（管理者による手入力の追加は、上限を超えても登録できる）
    if (t.capacity !== null) {
      const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM tournament_entries WHERE tournament_id = ?').bind(id).first<{ n: number }>()
      if ((count?.n ?? 0) >= t.capacity) return errorJson(c, 400, `定員（${t.capacity}人）に達したため、申し込めません`)
    }
  }
  if (byAdmin) {
    if (!user.is_admin) return foul(c, '他の人のトーナメントへの申し込み')
    const name = validateUserName(body.user_name)
    if (!name.ok) return errorJson(c, 400, name.error)
    const found = await c.env.DB.prepare('SELECT discord_id FROM users WHERE username = ? LIMIT 2').bind(name.value).all<{ discord_id: string }>()
    entry = { discord_id: found.results.length === 1 ? found.results[0].discord_id : null, user_name: name.value }
  }

  // 同じ人の二重登録を防ぐ（部員は Discord ID、手入力の参加者は名前で判定）
  // 部員は、管理者が同じ名前を手入力で先に登録していた場合も申し込み済みとみなす
  const dup = await (entry.discord_id
    ? c.env.DB.prepare(
        'SELECT 1 FROM tournament_entries WHERE tournament_id = ? AND (discord_id = ? OR (discord_id IS NULL AND user_name = ?))'
      ).bind(id, entry.discord_id, entry.user_name)
    : c.env.DB.prepare('SELECT 1 FROM tournament_entries WHERE tournament_id = ? AND discord_id IS NULL AND user_name = ?').bind(id, entry.user_name)
  ).first()
  if (dup) return errorJson(c, 400, `${entry.user_name} さんはすでに申し込んでいます`)

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO tournament_entries (tournament_id, discord_id, user_name, created_at, created_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, entry.discord_id, entry.user_name, new Date().toISOString(), user.discord_id),
    auditStmt(c.env.DB, user.discord_id, 'create', 'tournament', id, null, { entry: entry }),
  ])
  return c.json({ ok: true, name: entry.user_name }, 201)
})

// 申し込みの取り消し（受付中のみ。本人の申し込みか、管理者だけ）
tournaments.delete('/:id/entries/:entryId', async (c) => {
  const id = parseId(c.req.param('id'))
  const entryId = parseId(c.req.param('entryId'))
  if (id === null || entryId === null) return errorJson(c, 400, 'IDが正しくありません')
  const t = await findTournament(c.env.DB, id)
  if (!t) return errorJson(c, 404, '大会が見つかりません')
  if (t.status !== 'entry') return errorJson(c, 400, '組み合わせ作成後は取り消せません')
  const entry = await c.env.DB.prepare('SELECT id, discord_id, user_name FROM tournament_entries WHERE id = ? AND tournament_id = ?')
    .bind(entryId, id)
    .first<{ id: number; discord_id: string | null; user_name: string }>()
  if (!entry) return errorJson(c, 404, '申し込みが見つかりません')
  const user = c.get('user')
  if (!user.is_admin && entry.discord_id !== user.discord_id) return foul(c, '他の人のトーナメントの申し込みの取り消し')

  const actor = user.discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tournament_entries WHERE id = ?').bind(entryId),
    auditStmt(c.env.DB, actor, 'delete', 'tournament', id, { entry }, null),
  ])
  return c.json({ ok: true })
})

// 組み合わせを作る（受付を締め切る）。結果がまだ入っていなければ、作り直しもできる
tournaments.post('/:id/draw', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, '大会IDが正しくありません')
  const t = await findTournament(c.env.DB, id)
  if (!t) return errorJson(c, 404, '大会が見つかりません')
  if (t.status === 'finished' || (await hasResults(c.env.DB, id))) {
    return errorJson(c, 400, '結果が入っているため、組み合わせは作り直せません')
  }
  const { results: entries } = await c.env.DB.prepare('SELECT id FROM tournament_entries WHERE tournament_id = ?')
    .bind(id)
    .all<{ id: number }>()
  if (entries.length < 2) return errorJson(c, 400, '参加者が2人以上必要です')

  const matches = buildBracket(entries.map((e) => e.id))
  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tournament_matches WHERE tournament_id = ?').bind(id),
    ...matches.map((m) =>
      c.env.DB.prepare(
        `INSERT INTO tournament_matches (tournament_id, round, slot, player1_entry_id, player2_entry_id, next_round, next_slot, next_side)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, m.round, m.slot, m.player1, m.player2, m.next?.round ?? null, m.next?.slot ?? null, m.next?.side ?? null)
    ),
    c.env.DB.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").bind(id),
    auditStmt(c.env.DB, actor, 'update', 'tournament', id, { status: t.status }, { status: 'running', draw: matches }),
  ])
  return c.json({ ok: true })
})

// 組み合わせを取り消して、申し込みの受付に戻す（結果がまだ入っていないときだけ）
tournaments.post('/:id/reopen', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return errorJson(c, 400, '大会IDが正しくありません')
  const t = await findTournament(c.env.DB, id)
  if (!t) return errorJson(c, 404, '大会が見つかりません')
  if (t.status === 'finished' || (await hasResults(c.env.DB, id))) {
    return errorJson(c, 400, '結果が入っているため、受付には戻せません')
  }
  const actor = c.get('user').discord_id
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tournament_matches WHERE tournament_id = ?').bind(id),
    c.env.DB.prepare("UPDATE tournaments SET status = 'entry' WHERE id = ?").bind(id),
    auditStmt(c.env.DB, actor, 'update', 'tournament', id, { status: t.status }, { status: 'entry' }),
  ])
  return c.json({ ok: true })
})

// 対戦結果を入れる（winner_entry_id：勝った参加者。null なら結果を取り消す）
// 勝者は次の回戦に進む。次の対戦の結果がすでに入っているときは、先にそちらを取り消してもらう
tournaments.put('/:id/matches/:matchId', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  const matchId = parseId(c.req.param('matchId'))
  if (id === null || matchId === null) return errorJson(c, 400, 'IDが正しくありません')
  const body = await readJson(c)
  if (!body) return errorJson(c, 400, 'リクエストの形式が正しくありません')

  const t = await findTournament(c.env.DB, id)
  if (!t) return errorJson(c, 404, '大会が見つかりません')
  if (t.status === 'entry') return errorJson(c, 400, 'まだ組み合わせが作られていません')
  const match = await c.env.DB.prepare(
    `SELECT id, round, slot, player1_entry_id, player2_entry_id, winner_entry_id, next_round, next_slot, next_side
     FROM tournament_matches WHERE id = ? AND tournament_id = ?`
  )
    .bind(matchId, id)
    .first<Match>()
  if (!match) return errorJson(c, 404, '対戦が見つかりません')
  if (match.player1_entry_id === null || match.player2_entry_id === null) {
    return errorJson(c, 400, '対戦相手がまだ決まっていません')
  }
  const winner = body.winner_entry_id ?? null
  if (winner !== null && winner !== match.player1_entry_id && winner !== match.player2_entry_id) {
    return errorJson(c, 400, '勝者はこの対戦の参加者から選んでください')
  }

  // 勝者の進み先（決勝なら無し）
  const next =
    match.next_round === null
      ? null
      : await c.env.DB.prepare('SELECT id, winner_entry_id FROM tournament_matches WHERE tournament_id = ? AND round = ? AND slot = ?')
          .bind(id, match.next_round, match.next_slot)
          .first<{ id: number; winner_entry_id: number | null }>()
  if (next && next.winner_entry_id !== null && winner !== match.winner_entry_id) {
    return errorJson(c, 400, '次の対戦の結果が入っているため変更できません。先にそちらを取り消してください')
  }

  const actor = c.get('user').discord_id
  const column = match.next_side === 'player2' ? 'player2_entry_id' : 'player1_entry_id'
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE tournament_matches SET winner_entry_id = ? WHERE id = ?').bind(winner, matchId),
    // 次の回戦があれば勝者を進める。なければ（決勝）大会の状態を更新する
    next
      ? c.env.DB.prepare(`UPDATE tournament_matches SET ${column} = ? WHERE id = ?`).bind(winner, next.id)
      : c.env.DB.prepare('UPDATE tournaments SET status = ? WHERE id = ?').bind(winner === null ? 'running' : 'finished', id),
    auditStmt(c.env.DB, actor, 'update', 'tournament', id, { match: matchId, winner: match.winner_entry_id }, { match: matchId, winner }),
  ])
  return c.json({ ok: true })
})

export default tournaments
