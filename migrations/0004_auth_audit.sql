-- Discordログイン・操作履歴・論理削除

-- ログインしたことのある部員（Discord のユーザー情報）
CREATE TABLE users (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,       -- Discord のユーザー名（記録の表示名に使う）
  global_name TEXT,             -- Discord の表示名
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

-- ログイン状態（Cookie のトークンは SHA-256 にしてから保存し、生の値は持たない）
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (discord_id) REFERENCES users(discord_id)
);
CREATE INDEX idx_sessions_user ON sessions(discord_id);

-- 誰が作成・削除したか（論理削除：deleted_at が入っているものは画面に出さない）
ALTER TABLE rankings ADD COLUMN created_by TEXT;
ALTER TABLE rankings ADD COLUMN deleted_at TEXT;
ALTER TABLE rankings ADD COLUMN deleted_by TEXT;
ALTER TABLE scores ADD COLUMN created_by TEXT;
ALTER TABLE scores ADD COLUMN updated_by TEXT;
ALTER TABLE scores ADD COLUMN deleted_at TEXT;
ALTER TABLE scores ADD COLUMN deleted_by TEXT;

-- 同じ年月の月間リングは1つまで（削除済みのものは数えない）
DROP INDEX idx_rankings_monthly_period;
CREATE UNIQUE INDEX idx_rankings_monthly_period ON rankings(period) WHERE kind = 'monthly' AND deleted_at IS NULL;

CREATE INDEX idx_scores_discord ON scores(discord_id);

-- 操作履歴（作成・修正・削除・記録のひも付けのたびに1行追加する）
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_discord_id TEXT NOT NULL,  -- 操作した人
  action TEXT NOT NULL,            -- create / update / delete / claim
  target_type TEXT NOT NULL,       -- ranking / score
  target_id INTEGER,
  before_json TEXT,                -- 変更前の内容
  after_json TEXT,                 -- 変更後の内容
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id);
