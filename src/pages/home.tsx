// ホーム画面（データは home.js がAPIから取得して描画する）
export const HomePage = () => (
  <>
    <p class="admin-only"><span class="admin-badge">管理者モード</span></p>

    <div class="section-header section-header-first">
      <h2>ランキング一覧</h2>
      <button id="delete-mode" type="button" class="btn btn-small admin-only" aria-pressed="false">削除モード</button>
    </div>
    <ul id="ranking-list" class="list"></ul>
    <p id="empty" class="muted" hidden>まだランキングがありません</p>

    {/* ランキングを作るのは一部の部員だけなので、一覧の下に置く */}
    <h2>ランキング作成</h2>
    <form id="create-form" class="card form-row" novalidate>
      <div class="segmented" role="group" aria-label="ランキングの種類">
        <button type="button" class="segment active" data-kind="monthly" aria-pressed="true">月間リング</button>
        <button type="button" class="segment" data-kind="event" aria-pressed="false">その他イベント</button>
      </div>
      <label id="period-field">
        対象の年月
        <input id="ranking-period" type="month" />
      </label>
      <label id="name-field" hidden>
        イベント名
        <input id="ranking-name" type="text" maxlength={50} />
      </label>
      <button type="submit" class="btn btn-primary">新規ランキング作成</button>
    </form>
  </>
)
