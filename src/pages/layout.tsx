import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import type { LoginUser } from '../types'

// c.render() に渡す追加情報（ページタイトルと、読み込むページ別スクリプト。複数可）
// edit：管理者用の操作がその場にある画面。管理者には編集モードの切り替えボタンを出す
declare module 'hono' {
  interface ContextRenderer {
    (content: string | Promise<string>, props: { title: string; script?: string | string[]; edit?: boolean }): Response | Promise<Response>
  }
}

// ログイン中の部員を、画面のJSが使えるよう body の data 属性に入れる
// data-admin：管理者か、data-edit：編集モードの切り替えボタンを出す画面か（どちらも表示用。操作の可否はサーバーで判定する）
function userAttrs(edit?: boolean) {
  const user = useRequestContext().get('user') as LoginUser | undefined
  if (!user) return {}
  return {
    'data-user-id': user.discord_id,
    'data-user-name': user.username,
    ...(user.is_admin ? { 'data-admin': '1' } : {}),
    ...(user.is_admin && edit ? { 'data-edit': '1' } : {}),
  }
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
            {user.is_admin && (
              <a href="/admin" {...current('/admin')}>管理</a>
            )}
          </nav>
        )}
      </div>
    </header>
  )
}

// 管理者が「一般部員として表示」にしているときの帯（戻すボタンは common.js が動かす）
function MemberViewBar() {
  const user = useRequestContext().get('user') as LoginUser | undefined
  if (!user || !user.real_admin || user.is_admin) return null
  return (
    <div class="member-view-bar">
      一般部員として表示中
      <button type="button" id="member-view-off" class="btn btn-small">管理者に戻る</button>
    </div>
  )
}

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;800&display=swap'

// 全ページ共通の外枠
export const renderer = jsxRenderer(
  ({ children, title, script, edit }) => (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#0b4a32" />
        {/* ファビコン（ポーカーチップ）。iPhone のホーム画面用は apple-touch-icon */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <title>{title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        {/* フォントは読み込みを待たずに画面を出し、読み込めた時点で切り替える（画面の JS が待たされないように） */}
        <link
          rel="preload"
          as="style"
          href={FONT_CSS}
          onload="this.onload=null;this.rel='stylesheet'"
        />
        <noscript>
          <link rel="stylesheet" href={FONT_CSS} />
        </noscript>
        <link rel="stylesheet" href="/style.css" />
        <script src="/common.js" defer></script>
        {[script ?? []].flat().map((src) => (
          <script src={`/${src}`} defer></script>
        ))}
      </head>
      <body {...userAttrs(edit)}>
        <div id="message" class="message" hidden></div>
        <SiteHeader />
        <MemberViewBar />
        <main>{children}</main>
      </body>
    </html>
  ),
  { docType: true }
)
