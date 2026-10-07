-- 競技ポーカー部のロールを持っているか（1：持っている）。ログインのたびに Discord のロールから更新する
ALTER TABLE users ADD COLUMN is_club_member INTEGER NOT NULL DEFAULT 0;
