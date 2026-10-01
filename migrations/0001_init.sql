-- ランキング（大会・シーズンなどの単位）
CREATE TABLE rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 各部員の収支記録
-- discord_id は将来のDiscord連携用（第1版では常にNULL）
-- played_on は記録対象日（YYYY-MM-DD）、created_at は実際の入力日時（ISO 8601）
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ranking_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  discord_id TEXT,
  amount INTEGER NOT NULL,
  played_on TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ranking_id) REFERENCES rankings(id)
);

CREATE INDEX idx_scores_ranking ON scores(ranking_id);
