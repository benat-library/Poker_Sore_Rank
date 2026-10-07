-- ブラインドの段階（[[SB, BB], ...] の JSON）。イベント・トーナメントごとに管理者が画面から編集する。NULL なら標準の段階
ALTER TABLE rankings ADD COLUMN blind_levels TEXT;
ALTER TABLE tournaments ADD COLUMN blind_levels TEXT;
