import { Hono } from 'hono'
import type { AppEnv } from './types'
import { errorJson, parseId } from './lib/http'
import rankings from './routes/rankings'
import { rankingScores, scores } from './routes/scores'
import { renderer } from './pages/layout'
import { HomePage } from './pages/home'
import { listRankings } from './routes/rankings'
import { listTournaments } from './routes/tournaments'
import { halfRanking, listPlayers, playerStats } from './routes/stats'
import { RankingPage } from './pages/ranking'
import { HistoryPage } from './pages/history'
import { MeBody, MyPage } from './pages/me'
import { GuidePage } from './pages/guide'
import { TournamentPage } from './pages/tournament'
import stats from './routes/stats'
import tournaments from './routes/tournaments'
import { exportCsv } from './routes/export'
import auth from './routes/auth'
import { LoginPage } from './pages/login'
import { HowtoPage } from './pages/howto'
import { ErrorPage } from './pages/error'
import { BannedPage } from './pages/banned'
import { HalfPage } from './pages/half'
import { AdminPage } from './pages/admin'
import admin from './routes/admin'
import events from './routes/events'
import { EventPage } from './pages/event'
import { optionalLogin, requireAdmin, requireLogin, sameOriginOnly, setMemberView } from './lib/session'
import { foul } from './lib/foul'

// アプリ本体（URL末尾の「/」の有無はどちらでも同じ画面にする）
const app = new Hono<AppEnv>({ strict: false })

// 他のサイトから送られてきた書き込み操作を拒否する
app.use('*', sameOriginOnly)
app.use('*', renderer)

// ログイン（ここまではログインしていなくても使える）
app.route('/auth', auth)
app.get('/login', (c) => c.render(<LoginPage error={c.req.query('error')} />, { title: 'ログイン | ポーカー部' }))
// 新入生向けのポーカーの遊び方（ログイン画面からリンクする）
app.get('/howto', optionalLogin, (c) => c.render(<HowtoPage />, { title: 'テキサスホールデムのルール・役・遊び方 | ポーカー部' }))

// ここから下はすべてログインが必要
app.use('*', requireLogin)
// 退場処分中の人には、どの画面を開いても退場の画面を出す（API は requireLogin が断る）
app.use('*', async (c, next) => {
  if (!c.get('user').banned) return next()
  c.status(403)
  return c.render(<BannedPage />, { title: '退場処分中 | ポーカー部' })
})

// API
app.route('/api/rankings', rankings)
app.route('/api/rankings', rankingScores)
app.route('/api/scores', scores)
app.route('/api/stats', stats)
app.route('/api/tournaments', tournaments)
app.route('/api/events', events)
// 管理者の「一般部員として表示」の切り替え（表示中でも戻せるよう、requireAdmin は通さない）
app.post('/api/member-view', setMemberView)
app.use('/api/admin/*', requireAdmin)
app.route('/api/admin', admin)
app.all('/api/*', (c) => errorJson(c, 404, 'APIが見つかりません'))

// CSVエクスポート
app.get('/ranking/:id/export', exportCsv)

// 画面
// ホームは、一覧をサーバーで埋めて返す（空の画面が一瞬見えないように）
app.get('/', async (c) => {
  const me = c.get('user').discord_id
  const [rankingList, tournamentList, half] = await Promise.all([listRankings(c.env.DB, me), listTournaments(c.env.DB, me), halfRanking(c.env.DB, null)])
  return c.render(<HomePage data={{ rankings: rankingList, tournaments: tournamentList, half }} me={me} />, { title: 'ポーカー部 スコア集計', script: 'home.js' })
})
app.get('/ranking/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.notFound()
  // イベントは順位で記録する別の画面にする
  const ranking = await c.env.DB.prepare('SELECT kind FROM rankings WHERE id = ?').bind(id).first<{ kind: string }>()
  if (ranking?.kind === 'event') return c.redirect(`/event/${id}`)
  return c.render(<RankingPage id={id} />, { title: 'ランキング | ポーカー部', script: ['chart.js', 'ranking.js'], edit: true })
})
app.get('/ranking/:id/history', (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.notFound()
  return c.render(<HistoryPage id={id} />, { title: '入力履歴 | ポーカー部', script: 'history.js', edit: true })
})
app.get('/event/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.notFound()
  return c.render(<EventPage id={id} />, { title: 'イベント | ポーカー部', script: 'event.js', edit: true })
})
app.get('/tournament/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.notFound()
  return c.render(<TournamentPage id={id} />, { title: 'トーナメント | ポーカー部', script: 'tournament.js', edit: true })
})
app.get('/half', (c) => c.render(<HalfPage />, { title: '半期ランキング | ポーカー部', script: 'half.js' }))
app.get('/guide', (c) => c.render(<GuidePage />, { title: '使い方 | ポーカー部' }))
// 管理者ページ（管理者以外はホームへ戻す）
app.get('/admin', (c) => {
  if (!c.get('user').is_admin) return c.redirect('/')
  return c.render(<AdminPage />, { title: '管理者ページ | ポーカー部', script: 'admin.js' })
})
// マイページは、成績をサーバーで埋めて返す（空の画面が一瞬見えないように）
app.get('/me', async (c) => {
  const user = c.get('user')
  const [data, players] = await Promise.all([
    playerStats(c.env.DB, user.discord_id, user),
    // 他の人に切り替えられるのは管理者だけなので、選択肢も管理者のときだけ
    user.is_admin ? listPlayers(c.env.DB) : Promise.resolve([]),
  ])
  return c.render(<MyPage data={data} players={players} me={{ id: user.discord_id, name: user.username }} />, {
    title: 'マイページ | ポーカー部',
    script: 'me.js',
    edit: true,
  })
})
// マイページで表示する人を切り替えたときの、成績の部分だけのHTML（他の人の成績は管理者だけ）
app.get('/me/stats', async (c) => {
  const user = c.get('user')
  const player = c.req.query('player') || user.discord_id
  if (player !== user.discord_id && !user.is_admin) return foul(c, '他の人の成績の閲覧')
  return c.html(<MeBody data={await playerStats(c.env.DB, player, user)} />)
})

// 見つからないページ（APIは { error } を返し、画面はエラー用の画面を出す）
app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return errorJson(c, 404, 'APIが見つかりません')
  c.status(404)
  return c.render(<ErrorPage status={404} />, { title: 'ページが見つかりません | ポーカー部' })
})

// 想定外のエラー（詳細はログにだけ出し、利用者には出さない。API 以外（画面やログアウトなどのフォーム送信）はエラー用の画面を出す）
app.onError((err, c) => {
  console.error(err)
  if (c.req.path.startsWith('/api/')) return errorJson(c, 500, 'サーバーでエラーが発生しました')
  c.status(500)
  return c.render(<ErrorPage status={500} />, { title: 'エラー | ポーカー部' })
})

export default app
