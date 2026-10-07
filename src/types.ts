// Cloudflare から渡される環境（DBや環境変数）の型
export type Bindings = {
  DB: D1Database
  // Discord アプリの Client ID と、ログインを許可する部のサーバーID（wrangler.toml の [vars]）
  DISCORD_CLIENT_ID: string
  DISCORD_GUILD_ID: string
  // 競技ポーカー部のロールID（wrangler.toml の [vars]。空ならロールの判定をしない）
  CLUB_ROLE_ID: string
  // ポーカー運営サーバーのID（wrangler.toml の [vars]。このサーバーのメンバーを管理者にする。空なら管理者なし）
  ADMIN_GUILD_ID: string
  // 42のサーバーに入っていなくてもログインできる Discord ユーザーID（wrangler secret / .dev.vars で設定する。カンマ区切り。未設定なら例外なし）
  LOGIN_ALLOW_IDS?: string
  // Discord アプリの Client Secret（wrangler secret / .dev.vars で設定する）
  DISCORD_CLIENT_SECRET: string
}

// ログイン中の部員
export type LoginUser = {
  discord_id: string
  username: string
  global_name: string | null
  // 管理者として扱うか（「一般部員として表示」中の管理者は false）
  is_admin: boolean
  // 本当に管理者か（ログイン時にポーカー運営サーバーのメンバーかどうかで決まる。表示の切り替えに関係なく true）
  real_admin: boolean
  // 退場処分中か（反則を繰り返した人。期限までは API も画面も使えない）
  banned: boolean
}

export type AppEnv = { Bindings: Bindings; Variables: { user: LoginUser } }
