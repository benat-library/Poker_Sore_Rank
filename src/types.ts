// Cloudflare から渡される環境（DBや環境変数）の型
export type Bindings = {
  DB: D1Database
}

export type AppEnv = { Bindings: Bindings }
