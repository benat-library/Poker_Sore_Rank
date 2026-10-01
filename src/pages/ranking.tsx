// ランキング詳細画面：順位表・推移グラフ・入力フォーム（データは ranking.js が取得・描画する）
export const RankingPage = ({ id }: { id: number }) => (
  <div id="page" data-ranking-id={String(id)}>
    <header class="page-header">
      <a href="/" class="btn btn-small">← 一覧</a>
      <div class="header-links">
        <a href="/guide" class="btn btn-small">使い方</a>
        <a href={`/ranking/${id}/history`} class="btn btn-small">入力履歴</a>
      </div>
    </header>
    <h1>
      <span id="ranking-badge"></span>
      <span id="ranking-name">読み込み中…</span>
    </h1>

    {/* 月間リングの注意事項（ranking.js が締め日などを入れて表示する） */}
    <div id="notice" class="notice" hidden></div>

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

    <section id="chart-section" hidden>
      <h2>累計Scoreの推移</h2>
      <div class="card chart-card">
        <div id="chart-legend" class="chart-legend"></div>
        <div id="chart" class="chart"></div>
        <p id="chart-wait" class="muted chart-help">2日分以上の記録があるとグラフを表示します</p>
        <p id="chart-help" class="note chart-help">上位5人と自分を色付きで表示します。順位表の名前をタップすると、その人の線を強調します</p>
      </div>
    </section>

    <section id="input-section">
      <h2>Scoreを入力</h2>
      <form id="score-form" class="card form-row" novalidate>
        <label>
          ユーザー名
          <input id="user-name" type="text" maxlength={30} autocomplete="nickname" required />
        </label>

        {/* 月間リング：最終チップ数とRebuy回数を入力し、Scoreは自動で計算する */}
        <div id="chip-fields" hidden>
          <label>
            最終チップ数
            <input id="final-chips" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="例：350" autocomplete="off" />
          </label>
          <label class="check-row">
            <input id="rebuy-check" type="checkbox" />
            Rebuyした
          </label>
          <div id="rebuy-row" class="stepper-row" hidden>
            Rebuy回数
            <div class="stepper">
              <button type="button" id="rebuy-minus" class="stepper-btn" aria-label="Rebuy回数を減らす">−</button>
              <input id="rebuys" type="text" inputmode="numeric" pattern="[0-9]*" value="1" aria-label="Rebuy回数" />
              <button type="button" id="rebuy-plus" class="stepper-btn" aria-label="Rebuy回数を増やす">＋</button>
            </div>
          </div>
          <div class="score-preview">
            Score <strong id="score-preview">-</strong>
            <span id="score-formula" class="note"></span>
          </div>
        </div>

        {/* イベント：Scoreを直接入力する */}
        <div id="score-fields" hidden>
          Score
          <div class="amount-row">
            <div class="sign-toggle" role="group" aria-label="符号">
              <button type="button" class="sign-btn active" data-sign="1" aria-pressed="true">＋</button>
              <button type="button" class="sign-btn" data-sign="-1" aria-pressed="false">−</button>
            </div>
            <input id="amount" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="例：150" autocomplete="off" />
          </div>
        </div>
        <small class="note">※同じ日に登録したScoreは上書きされます</small>

        <label>
          日付
          <div class="date-row">
            <input id="played-on" type="date" required />
            <span id="played-on-weekday" class="weekday"></span>
          </div>
        </label>

        <button type="submit" class="btn btn-primary">送信</button>
      </form>
    </section>
    <p id="closed-note" class="card muted" hidden>このランキングは確定済みのため、入力・修正はできません</p>

    <div class="page-footer">
      <button id="export-csv" type="button" class="btn btn-small">CSVダウンロード</button>
    </div>
  </div>
)
