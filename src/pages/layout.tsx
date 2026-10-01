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
        <title>{title}</title>
        <link rel="stylesheet" href="/style.css" />
        <script src="/common.js" defer></script>
        {script && <script src={`/${script}`} defer></script>}
      </head>
      <body>
        <div id="message" class="message" hidden></div>
        <main>{children}</main>
      </body>
    </html>
  ),
  { docType: true }
)
