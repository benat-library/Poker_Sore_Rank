// ホーム画面（データは home.js がAPIから取得して描画する）
export const HomePage = () => (
  <>
    <header class="page-header">
      <h1>ポーカー部 スコア集計</h1>
    </header>

    <form id="create-form" class="card form-row">
      <input id="ranking-name" type="text" maxlength={50} placeholder="新しいランキング名" required />
      <button type="submit" class="btn btn-primary">新規ランキング作成</button>
    </form>

    <div class="section-header">
      <h2>ランキング一覧</h2>
      <button id="delete-mode" type="button" class="btn btn-small" aria-pressed="false">削除モード</button>
    </div>
    <ul id="ranking-list" class="list"></ul>
    <p id="empty" class="muted" hidden>まだランキングがありません</p>
  </>
)
