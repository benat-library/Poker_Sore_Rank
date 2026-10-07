// 入力履歴画面：ランキング内の全入力を新しい順に表示し、人で絞り込める（データは history.js が取得・描画する）
export const HistoryPage = ({ id }: { id: number }) => (
  <div id="page" data-ranking-id={String(id)}>
    <header class="page-header">
      <a href={`/ranking/${id}`} class="btn btn-small">← 順位表</a>
    </header>
    <h1>
      入力履歴<span id="ranking-name" class="subtitle"></span>
    </h1>

    <label class="filter">
      表示する人
      <select id="user-filter">
        <option value="">全員</option>
      </select>
    </label>

    {/* 全員分を表示しているときは、日付のタブで1日ずつ切り替える（history.js が描画する） */}
    <nav id="day-tabs" class="pager day-tabs" aria-label="日付の切り替え" hidden></nav>
    <ul id="history-list" class="list"></ul>
    <p id="empty" class="muted" hidden>入力がありません</p>
  </div>
)
