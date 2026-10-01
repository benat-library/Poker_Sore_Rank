-- 月間リングの入力内容（最終チップ数とRebuy回数）を残す
-- amount（Score）はこの2つから計算した値を保存する。イベントや取り込みデータでは NULL
ALTER TABLE scores ADD COLUMN final_chips INTEGER;
ALTER TABLE scores ADD COLUMN rebuys INTEGER;
