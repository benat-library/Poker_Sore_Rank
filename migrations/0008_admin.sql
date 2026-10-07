-- 管理者かどうか（ログイン時に、ポーカー運営サーバーのメンバーかどうかで判定して入れる）
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
