// 操作履歴（audit_logs）に1行追加する文を作る。操作本体と同じ batch に入れて、一緒に記録する
export type AuditAction = 'create' | 'update' | 'delete' | 'claim' | 'restore' | 'foul'
export type AuditTarget = 'ranking' | 'score' | 'tournament' | 'request'

export function auditStmt(
  db: D1Database,
  actor: string,
  action: AuditAction,
  targetType: AuditTarget,
  // 作成直後で ID がまだ分からないときは null を渡すと、直前に追加した行の ID を使う
  targetId: number | null,
  before: unknown,
  after: unknown
) {
  return db
    .prepare(
      `INSERT INTO audit_logs (actor_discord_id, action, target_type, target_id, before_json, after_json, created_at)
       VALUES (?, ?, ?, COALESCE(?, last_insert_rowid()), ?, ?, ?)`
    )
    .bind(
      actor,
      action,
      targetType,
      targetId,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      new Date().toISOString()
    )
}
