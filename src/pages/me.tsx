// マイページ：全月間リングを通した通算成績（データは me.js が取得・描画する）
const Stat = ({ id, label, wide }: { id: string; label: string; wide?: boolean }) => (
  <div class={wide ? 'card stat stat-wide' : 'card stat'}>
    <div class="stat-label">{label}</div>
    <div id={id} class="stat-value"></div>
    <div id={`${id}-sub`} class="stat-sub"></div>
  </div>
)

export const MyPage = () => (
  <>
    <header class="page-header">
      <a href="/" class="btn btn-small">← ホーム</a>
    </header>
    <h1>マイページ</h1>

    <label class="filter">
      表示する人
      <select id="user-filter"></select>
    </label>

    <p id="no-data" class="muted" hidden></p>

    <div id="stats" hidden>
      <h2>1戦ごとの成績</h2>
      <p class="note">月間リングの1日を1戦として数えます</p>
      <div class="stat-grid">
        <Stat id="game-count" label="参加" />
        <Stat id="game-firsts" label="1位" />
        <Stat id="game-avg-rank" label="平均順位" />
        <Stat id="game-avg-players" label="平均参加人数" />
        <Stat id="game-total" label="通算Score" />
        <Stat id="game-winrate" label="勝率（プラスで終えた割合）" />
      </div>

      <h2>月間リングの成績</h2>
      <p class="note">確定した月間リングだけを数えます</p>
      <div class="stat-grid">
        <Stat id="ring-count" label="参加" />
        <Stat id="ring-firsts" label="1位" />
        <Stat id="ring-avg-rank" label="平均順位" />
        <Stat id="ring-avg-players" label="平均参加人数" />
      </div>

      <h2>月間リングごとの順位</h2>
      <ul id="ring-list" class="list"></ul>
    </div>
  </>
)
