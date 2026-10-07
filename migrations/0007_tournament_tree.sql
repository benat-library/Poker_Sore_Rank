-- トーナメントの組み合わせを「各回戦で人数が奇数のときだけ1人が不戦勝」にするため、勝者の進み先を対戦ごとに持つ
-- 勝者は (next_round, next_slot) の対戦の next_side（player1 / player2）に進む。決勝は空
ALTER TABLE tournament_matches ADD COLUMN next_round INTEGER;
ALTER TABLE tournament_matches ADD COLUMN next_slot INTEGER;
ALTER TABLE tournament_matches ADD COLUMN next_side TEXT;

-- 募集上限（人数。空なら上限なし）
ALTER TABLE tournaments ADD COLUMN capacity INTEGER;
