// マイページ：月間リング・イベント・トーナメントの通算成績。サーバーで最初から埋めて返す（空の画面が一瞬見えないように）
// 管理者が「表示する人」を切り替えたときは、成績の部分（MeBody）だけをサーバーで作り直して差し替える（/me/stats。URLは変わらない）
// 一覧の10件ずつの切り替えは me.js（common.js の paginateList）が見せる・隠すで行う。見た目を作るのはこのファイルだけ
import { amountClass, formatAmount, formatDay } from '../lib/format'
import type { PlayerStats } from '../routes/stats'
import { Pager, RingBadge, hiddenAfterFirstPage } from './parts'

// 成績の1行（左に項目名、右に数字と単位）。big は大きく色付きで目立たせる
const Row = ({ id, label, sub, big, value, unit, cls }: {
  id: string
  label: string
  sub?: boolean
  big?: boolean
  value: string
  unit?: string
  cls?: string
}) => (
  <div class={`stat-row${sub ? ' stat-row-sub' : ''}${big ? ' stat-row-big' : ''}`}>
    <span class="stat-label">{label}</span>
    <span id={id} class={`stat-value ${cls ?? ''}`}>
      <span class="stat-num">{value}</span>
      {unit && value !== '-' && <span class="stat-unit">{unit}</span>}
    </span>
  </div>
)

// 割合（%の数字だけ）。分母が0なら「-」
const percent = (part: number, whole: number) => (whole ? String(Math.round((part / whole) * 100)) : '-')
// 平均（小数1桁の数字だけ）。値がなければ「-」
const avg = (value: number | null | undefined) => (value === null || value === undefined ? '-' : value.toFixed(1))

// 選んだ人の成績（名前・印と、記録がある欄だけ）
export const MeBody = ({ data }: { data: PlayerStats }) => {
  const g = data.games
  const r = data.rings
  const ev = data.events
  const tm = data.tournaments
  const draws = Number(g.count) - Number(g.wins) - Number(g.losses)
  const nothing = Number(g.count) + ev.count + tm.count === 0
  return (
    <>
      <p class="me-name">
        <span id="player-name">{data.name}</span> さん
        {/* 競技ポーカー部のロールを持っている人だけ */}
        {data.club_member && <span class="club-badge">部員</span>}
        {/* 管理者（ポーカー運営サーバーのメンバー）だけ */}
        {data.admin && <span class="club-badge admin-role-badge">管理者</span>}
      </p>

      {nothing && <p class="muted">まだ記録がありません</p>}

      {/* 月間リングの成績（記録がある人だけ） */}
      {Number(g.count) > 0 && (
        <div>
          <h2 class="me-section">1戦ごとの成績</h2>
          <p class="note me-section-note">月間リングの1日を1戦として集計（プラスで終えたら勝ち）</p>
          <div class="stat-list">
            <div class="card stat-card"><Row id="game-count" label="参加" value={String(g.count)} unit="戦" /></div>
            <div class="card stat-card">
              <Row id="game-firsts" label="1位" big value={String(g.firsts)} unit="回" />
              <Row id="game-first-rate" label="1位率" sub value={percent(Number(g.firsts), Number(g.count))} unit="%" />
            </div>
            <div class="card stat-card">
              <Row id="game-avg-rank" label="平均順位" value={avg(g.avg_rank)} unit="位" />
              <Row id="game-avg-players" label="平均参加人数" sub value={avg(g.avg_players)} unit="人" />
            </div>
            <div class="card stat-card">
              <Row id="game-total" label="通算Score" value={formatAmount(Number(g.total))} cls={amountClass(Number(g.total))} />
            </div>
            <div class="card stat-card">
              <Row id="game-winrate" label="勝率" big value={percent(Number(g.wins), Number(g.count))} unit="%" />
              <Row id="game-record" label="勝敗" sub value={`${g.wins}勝 ${g.losses}敗${draws ? ` ${draws}分` : ''}`} />
            </div>
          </div>

          <h2 class="me-section">月間リングの成績</h2>
          <p class="note me-section-note">確定した月間リング戦のみ集計</p>
          <div class="stat-list">
            <div class="card stat-card"><Row id="ring-count" label="参加" value={String(r.count)} unit="回" /></div>
            <div class="card stat-card">
              <Row id="ring-firsts" label="1位" big value={String(r.firsts)} unit="回" />
              <Row id="ring-first-rate" label="1位率" sub value={percent(r.firsts, r.count)} unit="%" />
            </div>
            <div class="card stat-card">
              <Row id="ring-avg-rank" label="平均順位" value={avg(r.avg_rank)} unit="位" />
              <Row id="ring-avg-players" label="平均参加人数" sub value={avg(r.avg_players)} unit="人" />
            </div>
          </div>

          {/* 月間リングごとの順位（確定前のものは暫定） */}
          <h2 class="me-section">月間リングごとの順位</h2>
          <ul id="ring-list" class="list">
            {data.ring_list.map((ring, i) => (
              <li class="card list-item" hidden={hiddenAfterFirstPage(i)}>
                <a class="list-link ring-row" href={`/ranking/${ring.id}`}>
                  <div>
                    <div class="list-title">
                      <RingBadge status={ring.status} />
                      {ring.name}
                    </div>
                    <div class="list-meta">
                      {`${ring.status === 'closed' ? '' : '暫定 '}${ring.rank}位 / ${ring.players}人 ・ ${ring.days}戦`}
                    </div>
                  </div>
                  <div class={`history-amount ${amountClass(ring.total)}`}>{formatAmount(ring.total)}</div>
                </a>
              </li>
            ))}
          </ul>
          <Pager count={data.ring_list.length} />
        </div>
      )}

      {/* イベント（1日のリングトーナメント）の成績（記録がある人だけ） */}
      {ev.count > 0 && (
        <div>
          <h2 class="me-section">イベントの成績</h2>
          <div class="stat-list">
            <div class="card stat-card"><Row id="event-count" label="参加" value={String(ev.count)} unit="回" /></div>
            <div class="card stat-card">
              <Row id="event-firsts" label="優勝" big value={String(ev.firsts)} unit="回" />
              <Row id="event-top30" label="上位30%" sub value={String(ev.top30)} unit="回" />
            </div>
            <div class="card stat-card">
              <Row id="event-avg-place" label="平均順位" value={avg(ev.avg_place)} unit="位" />
              <Row id="event-avg-players" label="平均参加人数" sub value={avg(ev.avg_players)} unit="人" />
            </div>
          </div>
          <ul id="event-list" class="list me-list">
            {ev.list.map((e, i) => (
              <li class="card list-item ev-card" hidden={hiddenAfterFirstPage(i)}>
                <a class="list-link ev-link" href={`/event/${e.id}`}>
                  <div class="ev-main">
                    <div class="list-title">{e.name}</div>
                    <div class="list-meta">{`${e.held_on ? formatDay(e.held_on) : '開催日 未定'} ・ ${e.players}人参加`}</div>
                  </div>
                  <div class="me-place">
                    {e.place <= 3 ? <span class={`rank-chip rank-${e.place}`}>{e.place}</span> : <strong>{e.place}</strong>}
                    <span>位</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
          <Pager count={ev.list.length} />
        </div>
      )}

      {/* トーナメント（1対1の勝ち抜き戦）の成績（組み合わせが決まった大会に出た人だけ） */}
      {tm.count > 0 && (
        <div>
          <h2 class="me-section">トーナメントの成績</h2>
          <div class="stat-list">
            <div class="card stat-card"><Row id="tm-count" label="参加" value={String(tm.count)} unit="回" /></div>
            <div class="card stat-card">
              <Row id="tm-firsts" label="優勝" big value={String(tm.firsts)} unit="回" />
              <Row id="tm-seconds" label="準優勝" sub value={String(tm.seconds)} unit="回" />
            </div>
            <div class="card stat-card">
              <Row id="tm-best" label="最高成績" value={tm.best ?? '-'} />
              <Row id="tm-avg-players" label="平均参加人数" sub value={avg(tm.avg_players)} unit="人" />
            </div>
          </div>
          <ul id="tournament-list" class="list me-list">
            {tm.list.map((t, i) => (
              <li class="tm-card" hidden={hiddenAfterFirstPage(i)}>
                <a class="tm-card-link me-tm-link" href={`/tournament/${t.id}`}>
                  <div class="ev-main">
                    <div class="tm-card-title">{t.name}</div>
                    <div class="tm-card-meta">{`${t.held_on ? formatDay(t.held_on) : '開催日 未定'} ・ ${t.players}人参加`}</div>
                  </div>
                  <div class={t.best === 1 ? 'me-tm-result champion' : 'me-tm-result'}>{t.result}</div>
                </a>
              </li>
            ))}
          </ul>
          <Pager count={tm.list.length} />
        </div>
      )}
    </>
  )
}

export const MyPage = ({ data, players, me }: { data: PlayerStats; players: { player_key: string; name: string }[]; me: { id: string; name: string } }) => (
  <>
    <div class="me-header">
      <h1>戦績</h1>
    </div>

    {/* 編集モードでだけ、他の人の成績に切り替えられる（選択肢は管理者のときだけサーバーが入れる） */}
    <label class="filter admin-only">
      表示する人（編集モード）
      <select id="user-filter">
        <option value={me.id}>自分（{me.name}）</option>
        {players
          .filter((p) => p.player_key !== me.id)
          .map((p) => (
            <option value={p.player_key}>{p.name}</option>
          ))}
      </select>
    </label>

    {/* 成績の部分（人を切り替えると me.js がここだけ差し替える） */}
    <div id="me-body" class="me-body">
      <MeBody data={data} />
    </div>

    <form method="post" action="/auth/logout" class="page-footer">
      <button type="submit" class="btn btn-small">ログアウト</button>
    </form>
  </>
)
