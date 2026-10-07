// エラー用の画面（ページが見つからない・サーバーでエラーが起きたとき）。APIは画面ではなく { error } を返す
export const ErrorPage = ({ status }: { status: 404 | 500 }) => (
  <section class="error-page">
    <p class="error-code">{status}</p>
    <h1>{status === 404 ? 'ページが見つかりません' : 'エラーが発生しました'}</h1>
    <p class="error-text">
      {status === 404
        ? 'URLが間違っているか、削除されたページです。'
        : 'しばらくしてから、もう一度開いてください。何度も起きる場合は、ポーカー部運営に知らせてください。'}
    </p>
    <a href="/" class="btn btn-primary error-home">
      ホームに戻る
    </a>
  </section>
)
