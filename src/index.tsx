import { Hono } from 'hono'
import type { AppEnv } from './types'
import { errorJson, parseId } from './lib/http'
import rankings from './routes/rankings'
import { rankingScores, scores } from './routes/scores'
import { renderer } from './pages/layout'
import { HomePage } from './pages/home'
import { RankingPage } from './pages/ranking'
import { HistoryPage } from './pages/history'
import { MyPage } from './pages/me'
import { GuidePage } from './pages/guide'
import stats from './routes/stats'
import { exportCsv } from './routes/export'

// アプリ本体
const app = new Hono<AppEnv>()

// API
app.route('/api/rankings', rankings)
app.route('/api/rankings', rankingScores)
app.route('/api/scores', scores)
app.route('/api/stats', stats)
app.all('/api/*', (c) => errorJson(c, 404, 'APIが見つかりません'))

// CSVエクスポート
app.get('/ranking/:id/export', exportCsv)

// 画面
app.use('*', renderer)
app.get('/', (c) => c.render(<HomePage />, { title: 'ポーカー部 スコア集計', script: 'home.js' }))
app.get('/ranking/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.notFound()
  return c.render(<RankingPage id={id} />, { title: 'ランキング | ポーカー部', script: ['chart.js', 'ranking.js'] })
})
app.get('/ranking/:id/history', (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.notFound()
  return c.render(<HistoryPage id={id} />, { title: '入力履歴 | ポーカー部', script: 'history.js' })
})
app.get('/me', (c) => c.render(<MyPage />, { title: 'マイページ | ポーカー部', script: 'me.js' }))
app.get('/guide', (c) => c.render(<GuidePage />, { title: '使い方 | ポーカー部' }))

// 想定外のエラー（詳細はログにだけ出し、利用者には出さない）
app.onError((err, c) => {
  console.error(err)
  return errorJson(c, 500, 'サーバーでエラーが発生しました')
})

export default app
