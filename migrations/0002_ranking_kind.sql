-- ランキングの種類を追加する
-- kind: 'monthly'（月間リング）または 'event'（その他イベント）。既存のランキングはイベント扱いにする
-- period: 月間リングの対象年月（YYYY-MM）。イベントは NULL
ALTER TABLE rankings ADD COLUMN kind TEXT NOT NULL DEFAULT 'event';
ALTER TABLE rankings ADD COLUMN period TEXT;

-- 同じ年月の月間リングは1つまで
CREATE UNIQUE INDEX idx_rankings_monthly_period ON rankings(period) WHERE kind = 'monthly';
