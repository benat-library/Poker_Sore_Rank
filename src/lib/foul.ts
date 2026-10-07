import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { auditStmt } from './audit'

// 反則（画面では押せないはずの操作を、API を直接叩いて実行しようとした）への対応
// - 操作履歴に「権限のない操作を試みた」と記録する（管理ページで目立つ色で表示される）
// - 画面には「反則行為を検知しました」の画面を出させる（common.js が code: 'foul' を見て出す）
// 正しい使い方でも断られる場面（競技ポーカー部のロールが無い人の申し込みなど）には使わない
// 管理者（「一般部員として表示」中を含む）も同じく記録・退場の対象にする（管理者からの攻撃も見逃さないため）

const FOUL_LOG_INTERVAL_MS = 10 * 60 * 1000
// 10分以内にこの回数反則したら退場、退場の長さは1時間
const FOUL_LIMIT = 10
const BAN_MS = 60 * 60 * 1000

export async function foul(c: Context<AppEnv>, what: string) {
  const user = c.get('user')
  // 連打で履歴が溜まらないよう、10分以内の同じ人の反則は新しい行を足さず、最初の行の回数を増やす
  // 10分以内に FOUL_LIMIT 回反則したら、1時間の退場処分にする（退場中は requireLogin が断るので、DB に書き込まない）
  const now = Date.now()
  const since = new Date(now - FOUL_LOG_INTERVAL_MS).toISOString()
  const recent = await c.env.DB.prepare(
    `SELECT id, COALESCE(json_extract(after_json, '$.count'), 1) AS count FROM audit_logs
     WHERE action = 'foul' AND actor_discord_id = ? AND created_at > ? AND json_extract(after_json, '$.banned') IS NULL
     ORDER BY id DESC LIMIT 1`
  )
    .bind(user.discord_id, since)
    .first<{ id: number; count: number }>()
  if (!recent) {
    await auditStmt(c.env.DB, user.discord_id, 'foul', 'request', 0, null, { what, method: c.req.method, path: c.req.path, count: 1 }).run()
  } else {
    const count = recent.count + 1
    const stmts = [c.env.DB.prepare("UPDATE audit_logs SET after_json = json_set(after_json, '$.count', ?) WHERE id = ?").bind(count, recent.id)]
    if (count >= FOUL_LIMIT) {
      stmts.push(c.env.DB.prepare('UPDATE users SET banned_until = ? WHERE discord_id = ?').bind(new Date(now + BAN_MS).toISOString(), user.discord_id))
      stmts.push(auditStmt(c.env.DB, user.discord_id, 'foul', 'request', 0, null, { banned: BAN_MS / 60000 }))
    }
    await c.env.DB.batch(stmts)
    if (count >= FOUL_LIMIT) return c.json({ error: '退場処分になりました。しばらくの間このアプリは使えません', code: 'banned' }, 403)
  }

  return c.json({ error: '反則です。権限のない操作は、ポーカー部運営に通報されました', code: 'foul' }, 403)
}
