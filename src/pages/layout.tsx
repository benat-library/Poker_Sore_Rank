import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import type { LoginUser } from '../types'

// c.render() に渡す追加情報（ページタイトルと、読み込むページ別スクリプト。複数可）
declare module 'hono' {
  interface ContextRenderer {
    (content: string | Promise<string>, props: { title: string; script?: string | string[] }): Response | Promise<Response>
  }
}

// ログイン中の部員を、画面のJSが使えるよう body の data 属性に入れる
function userAttrs() {
  const user = useRequestContext().get('user') as LoginUser | undefined
  return user ? { 'data-user-id': user.discord_id, 'data-user-name': user.username } : {}
}

// 全ページ共通のヘッダー（ロゴ画像 public/logo.png が無い場合は文字表記にする。ナビはログイン中だけ表示）
function SiteHeader() {
  const c = useRequestContext()
  const user = c.get('user') as LoginUser | undefined
  const current = (href: string) => (c.req.path === href ? { 'aria-current': 'page' } : {})
  return (
    <header class="site-header">
      <div class="site-header-inner">
        <a href="/" class="brand">
          <img src="/logo.png" alt="ポーカー部 スコア集計" class="brand-logo" onerror="this.parentElement.classList.add('no-logo')" />
          <span class="brand-text">ポーカー部 スコア集計</span>
        </a>
        {user && (
          <nav class="site-nav">
            <a href="/" {...current('/')}>ホーム</a>
            <a href="/me" {...current('/me')}>マイページ</a>
            <a href="/guide" {...current('/guide')}>使い方</a>
          </nav>
        )}
      </div>
    </header>
  )
}

// 全ページ共通の外枠
export const renderer = jsxRenderer(
  ({ children, title, script }) => (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#0b4a32" />
        <title>{title}</title>
        <link rel="stylesheet" href="/style.css" />
        <script src="/common.js" defer></script>
        {[script ?? []].flat().map((src) => (
          <script src={`/${src}`} defer></script>
        ))}
      </head>
      <body {...userAttrs()}>
        <div id="message" class="message" hidden></div>
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  ),
  { docType: true }
)
