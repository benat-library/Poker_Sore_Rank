// マイページ：全月間リングを通した通算成績（データは me.js が取得・描画する）

// 成績の1行（左に項目名、右に数字と単位）。big は大きく色付きで目立たせる
const Row = ({ id, label, sub, big }: { id: string; label: string; sub?: boolean; big?: boolean }) => (
  <div class={`stat-row${sub ? ' stat-row-sub' : ''}${big ? ' stat-row-big' : ''}`}>
    <span class="stat-label">{label}</span>
    <span id={id} class="stat-value"></span>
  </div>
)

export const MyPage = () => (
  <>
    <div class="me-header">
      <h1>戦績</h1>
      <p class="me-name">
        <span id="player-name"></span> さん
      </p>
    </div>

    {/* 管理者モードでだけ、他の人の成績に切り替えられる */}
    <label class="filter admin-only">
      表示する人（管理者モード）
      <select id="user-filter"></select>
    </label>

    <p id="no-data" class="muted" hidden></p>

    <div id="stats" hidden>
      <h2 class="me-section">1戦ごとの成績</h2>
      <p class="note me-section-note">月間リングの1日を1戦として集計（プラスで終えたら勝ち）</p>
      <div class="stat-list">
        <div class="card stat-card"><Row id="game-count" label="参加" /></div>
        <div class="card stat-card">
          <Row id="game-firsts" label="1位" big />
          <Row id="game-first-rate" label="1位率" sub />
        </div>
        <div class="card stat-card">
          <Row id="game-avg-rank" label="平均順位" />
          <Row id="game-avg-players" label="平均参加人数" sub />
        </div>
        <div class="card stat-card"><Row id="game-total" label="通算Score" /></div>
        <div class="card stat-card">
          <Row id="game-winrate" label="勝率" big />
          <Row id="game-record" label="勝敗" sub />
        </div>
      </div>

      <h2 class="me-section">月間リングの成績</h2>
      <p class="note me-section-note">確定した月間リング戦のみ集計</p>
      <div class="stat-list">
        <div class="card stat-card"><Row id="ring-count" label="参加" /></div>
        <div class="card stat-card">
          <Row id="ring-firsts" label="1位" big />
          <Row id="ring-first-rate" label="1位率" sub />
        </div>
        <div class="card stat-card">
          <Row id="ring-avg-rank" label="平均順位" />
          <Row id="ring-avg-players" label="平均参加人数" sub />
        </div>
      </div>

      <h2 class="me-section">月間リングごとの順位</h2>
      <ul id="ring-list" class="list"></ul>
    </div>

    {/* Discord とひも付いていない過去の記録を、自分の記録として登録する */}
    <section id="claim-section" class="admin-only" hidden>
      <h2>過去の記録のひも付け（管理者モード）</h2>
      <p class="note">
        取り込んだ過去の記録の、名前ごとのひも付け先です。ひも付け先を選び直して「変更」を押すと、元のひも付けは外れて新しい部員の記録になります。「未ひも付け」を選ぶと解除されます。選べるのは、一度ログインしたことのある部員です（操作は記録に残ります）。
      </p>
      <ul id="claim-list" class="list"></ul>
    </section>

    <form method="post" action="/auth/logout" class="page-footer">
      <button type="submit" class="btn btn-small">ログアウト</button>
    </form>
  </>
)
