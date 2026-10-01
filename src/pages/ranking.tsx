// ランキング詳細画面：上部に順位表、下部に入力フォーム（データは ranking.js が取得・描画する）
export const RankingPage = ({ id }: { id: number }) => (
  <div id="page" data-ranking-id={String(id)}>
    <header class="page-header">
      <a href="/" class="btn btn-small">← 一覧</a>
      <a href={`/ranking/${id}/history`} class="btn btn-small">入力履歴</a>
    </header>
    <h1 id="ranking-name">読み込み中…</h1>

    <h2>順位表</h2>
    <div class="card table-card">
      <table class="standings">
        <thead>
          <tr>
            <th class="col-rank">順位</th>
            <th>名前</th>
            <th class="col-num">合計Score</th>
            <th class="col-num">参加回数</th>
          </tr>
        </thead>
        <tbody id="standings-body"></tbody>
      </table>
      <p id="empty" class="muted empty-note" hidden>まだ入力がありません</p>
    </div>

    <h2>Scoreを入力</h2>
    <form id="score-form" class="card form-row" novalidate>
      <label>
        ユーザー名
        <input id="user-name" type="text" maxlength={30} autocomplete="nickname" required />
      </label>

      <div>
        Score
        <div class="amount-row">
          <div class="sign-toggle" role="group" aria-label="符号">
            <button type="button" class="sign-btn active" data-sign="1" aria-pressed="true">＋</button>
            <button type="button" class="sign-btn" data-sign="-1" aria-pressed="false">−</button>
          </div>
          <input id="amount" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Score" autocomplete="off" required />
        </div>
      </div>

      <label>
        日付
        <input id="played-on" type="date" required />
      </label>

      <button type="submit" class="btn btn-primary">送信</button>
    </form>
  </div>
)
