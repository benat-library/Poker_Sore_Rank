import { Hono } from 'hono'
import type { AppEnv } from './types'
import { errorJson } from './lib/http'
import rankings from './routes/rankings'
import { renderer } from './pages/layout'
import { HomePage } from './pages/home'

// アプリ本体
const app = new Hono<AppEnv>()

// API
app.route('/api/rankings', rankings)
app.all('/api/*', (c) => errorJson(c, 404, 'APIが見つかりません'))

// 画面
app.use('*', renderer)
app.get('/', (c) => c.render(<HomePage />, { title: 'ポーカー部 スコア集計', script: 'home.js' }))

// 想定外のエラー（詳細はログにだけ出し、利用者には出さない）
app.onError((err, c) => {
  console.error(err)
  return errorJson(c, 500, 'サーバーでエラーが発生しました')
})

export default app
