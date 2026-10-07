-- ブラインドの1レベルの時間（分）。イベント・トーナメントごとに 10 か 12 を選ぶ（最初は 12）
ALTER TABLE rankings ADD COLUMN blind_minutes INTEGER NOT NULL DEFAULT 12;
ALTER TABLE tournaments ADD COLUMN blind_minutes INTEGER NOT NULL DEFAULT 12;
