-- トーナメント（1対1の勝ち抜き戦）

-- 大会。status は entry（申し込み受付中）→ running（組み合わせ作成後）→ finished（決勝の勝者が決まった）
CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  held_on TEXT,                    -- 開催日（YYYY-MM-DD。未定なら NULL）
  status TEXT NOT NULL DEFAULT 'entry',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT
);

-- 参加者。本人の申し込みは discord_id 付き、管理者が名前を手入力した参加者は discord_id が空
CREATE TABLE tournament_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  discord_id TEXT,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);
CREATE INDEX idx_entries_tournament ON tournament_entries(tournament_id);

-- 対戦。round は 1 から（1回戦）、slot はその回戦の中の位置（0 から）
-- slot の勝者は、次の回戦の slot / 2 の対戦に進む（slot が偶数なら player1、奇数なら player2）
-- 1回戦で相手のいない対戦（player2 が空）は不戦勝で、player1 が勝者になる
CREATE TABLE tournament_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  player1_entry_id INTEGER,
  player2_entry_id INTEGER,
  winner_entry_id INTEGER,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);
CREATE UNIQUE INDEX idx_matches_position ON tournament_matches(tournament_id, round, slot);
