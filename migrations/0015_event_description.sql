-- イベントの説明文（イベント画面の見出しの下に出す。改行あり・1000文字まで。NULL なら説明なし）
ALTER TABLE rankings ADD COLUMN description TEXT;
