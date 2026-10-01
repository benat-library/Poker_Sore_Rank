import { jsxRenderer } from 'hono/jsx-renderer'

// c.render() に渡す追加情報（ページタイトルと、読み込むページ別スクリプト）
declare module 'hono' {
  interface ContextRenderer {
    (content: string | Promise<string>, props: { title: string; script?: string }): Response | Promise<Response>
  }
}

// 全ページ共通の外枠
export const renderer = jsxRenderer(
  ({ children, title, script }) => (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{title}</title>
        <link rel="stylesheet" href="/style.css" />
        <script src="/common.js" defer></script>
        {script && <script src={`/${script}`} defer></script>}
      </head>
      <body class="locked">
        <div id="message" class="message" hidden></div>
        {/* 合言葉入力画面（未認証のときだけ表示する） */}
        <section id="login" class="login" hidden>
          <h1>ポーカー部 スコア集計</h1>
          <form id="login-form" class="card form-row">
            <label>
              合言葉
              <input id="login-password" type="password" autocomplete="current-password" required />
            </label>
            <button type="submit" class="btn btn-primary">入る</button>
          </form>
        </section>
        <main>{children}</main>
      </body>
    </html>
  ),
  { docType: true }
)
