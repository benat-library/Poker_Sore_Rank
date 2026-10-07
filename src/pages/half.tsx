// 半期ランキング画面：半期（前期4〜9月・後期10〜3月）の月間リングの合計で並べた順位表（データは half.js が取得・描画する）
export const HalfPage = () => (
  <div id="page">
    <header class="page-header">
      <a href="/" class="btn btn-small">← 一覧</a>
    </header>
    <h1>
      <span id="half-badge"></span>
      <span id="half-title">読み込み中…</span>
    </h1>

    <label class="filter">
      表示する半期
      <select id="term-filter"></select>
    </label>

    <div class="notice">
      <p>半期内の月間リングのScoreを合計した順位です。参加回数は、参加した日数です。</p>
      <p id="half-provisional" hidden>集計中の半期は暫定です。最後の月の月間リングが確定すると、この半期の順位も確定します。</p>
    </div>

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
      <p id="empty" class="muted empty-note" hidden>この半期の記録はまだありません</p>
    </div>
  </div>
)
