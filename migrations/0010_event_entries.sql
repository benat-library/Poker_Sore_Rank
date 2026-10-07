-- イベントに申し込みを付ける（トーナメントと同じく、受付中 → 開催中 → 終了）
-- 順位は、開催中に管理者が「飛んだ順」にタップして決める（最初に飛んだ人が最下位、最後に残った人が1位）

-- イベントの状態（entry：受付中、running：開催中、finished：終了）と募集上限（NULL なら上限なし）
ALTER TABLE rankings ADD COLUMN event_status TEXT NOT NULL DEFAULT 'entry';
ALTER TABLE rankings ADD COLUMN capacity INTEGER;

-- イベントの参加者。place は順位（飛ぶまでは NULL）
-- 本人の申し込みは discord_id 付き、管理者が名前を手入力した参加者は、部員と一致しなければ discord_id が空
CREATE TABLE event_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ranking_id INTEGER NOT NULL,
  discord_id TEXT,
  user_name TEXT NOT NULL,
  place INTEGER,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (ranking_id) REFERENCES rankings(id)
);
CREATE INDEX idx_event_entries_ranking ON event_entries(ranking_id);
CREATE INDEX idx_event_entries_discord ON event_entries(discord_id);
CREATE UNIQUE INDEX idx_event_entries_place ON event_entries(ranking_id, place) WHERE place IS NOT NULL;

-- これまでの順位（0009 の event_results）を引き継ぎ、順位が入っているイベントは終了にする
INSERT INTO event_entries (ranking_id, discord_id, user_name, place, created_at, created_by)
  SELECT ranking_id, discord_id, user_name, place, created_at, created_by FROM event_results ORDER BY ranking_id, place;
UPDATE rankings SET event_status = 'finished' WHERE id IN (SELECT DISTINCT ranking_id FROM event_results);
DROP TABLE event_results;
