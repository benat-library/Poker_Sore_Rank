// Cloudflare から渡される環境（DBや環境変数）の型
export type Bindings = {
  DB: D1Database
  // 共通の合言葉（wrangler secret / .dev.vars で設定する）
  APP_PASSWORD: string
}

export type AppEnv = { Bindings: Bindings }
