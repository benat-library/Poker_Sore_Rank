-- イベント（1日のリングトーナメント。リバイなしで飛んだら終わり）の開催日と順位

-- イベントの開催日（YYYY-MM-DD。未定なら NULL。月間リングは使わない）
ALTER TABLE rankings ADD COLUMN held_on TEXT;

-- イベントの順位。管理者が大会後に1位から順にまとめて入力する（入力し直すときは全員分を入れ替える）
-- 部員と名前が一致すれば discord_id 付き、一致しなければ名前だけで記録する
CREATE TABLE event_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ranking_id INTEGER NOT NULL,
  place INTEGER NOT NULL,
  discord_id TEXT,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (ranking_id) REFERENCES rankings(id)
);
CREATE UNIQUE INDEX idx_event_results_place ON event_results(ranking_id, place);
CREATE INDEX idx_event_results_discord ON event_results(discord_id);
