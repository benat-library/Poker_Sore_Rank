-- マイページの集計を軽くするための索引（データの中身は変わらない）
-- 同じ人の判定に使うキー（src/routes/scores.ts の PLAYER_KEY と同じ式）で、その人の記録をすぐ探せるようにする
CREATE INDEX idx_scores_player ON scores(COALESCE(discord_id, 'name:' || user_name));
-- リングの中の、ある日の記録をすぐ探せるようにする（その人が出た日の順位を計算するため）
CREATE INDEX idx_scores_ranking_day ON scores(ranking_id, played_on);
