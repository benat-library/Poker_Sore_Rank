// Cloudflare から渡される環境（DBや環境変数）の型
export type Bindings = {
  DB: D1Database
  // Discord アプリの Client ID と、ログインを許可する部のサーバーID（wrangler.toml の [vars]）
  DISCORD_CLIENT_ID: string
  DISCORD_GUILD_ID: string
  // Discord アプリの Client Secret（wrangler secret / .dev.vars で設定する）
  DISCORD_CLIENT_SECRET: string
}

// ログイン中の部員
export type LoginUser = {
  discord_id: string
  username: string
  global_name: string | null
}

export type AppEnv = { Bindings: Bindings; Variables: { user: LoginUser } }
