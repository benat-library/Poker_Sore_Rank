import { Hono } from 'hono'

// Cloudflare から渡される環境（DBや環境変数）の型
type Bindings = {
  DB: D1Database
}

// アプリ本体
const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('Hello Hono!'))

// DB接続確認用（段階3で削除する）
app.get('/dbcheck', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM rankings').first<{ count: number }>()
  return c.json({ rankings: row?.count ?? 0 })
})

export default app
