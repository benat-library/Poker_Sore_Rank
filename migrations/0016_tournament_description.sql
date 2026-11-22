-- 1on1 トーナメントの説明文（大会画面の見出しの下に出す。改行あり・1000文字まで。NULL なら説明なし）
ALTER TABLE tournaments ADD COLUMN description TEXT;
