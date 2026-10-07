// ホーム画面。月間リング・イベント・トーナメント・半期ランキングを、サーバーで最初から埋めて返す（空の画面が一瞬見えないように）
// 一覧は全件を描き、10件ずつの切り替えは home.js（common.js の paginateList）が見せる・隠すで行う。見た目を作るのはこのファイルだけ
// リングや大会の作成・削除は管理者ページで行う
import { amountClass, formatAmount, formatDate, formatDay } from '../lib/format'
import { ENTRY_STATUS as STATUS, IconEvent, IconHalf, IconRing, IconTournament, Pager, RingBadge, hiddenAfterFirstPage } from './parts'
import type { listRankings } from '../routes/rankings'
import type { listTournaments } from '../routes/tournaments'
import type { halfRanking } from '../routes/stats'

type Ranking = Awaited<ReturnType<typeof listRankings>>[number]
type Tournament = Awaited<ReturnType<typeof listTournaments>>[number]
type Half = Awaited<ReturnType<typeof halfRanking>>
export type HomeData = { rankings: Ranking[]; tournaments: Tournament[]; half: Half }

// 見出し（左に丸いアイコン、下にひとこと説明。説明は無くてもよい）
const SectionHead = ({ kind, title, sub, children }: { kind: string; title: string; sub?: string; children: unknown }) => (
  <div class="home-head">
    <span class={`home-icon home-icon-${kind}`} aria-hidden="true">
      {children}
    </span>
    <div>
      <h2>{title}</h2>
      {sub && <p class="home-sub">{sub}</p>}
    </div>
  </div>
)

// 月間リング1件分
const RingItem = ({ r, i }: { r: Ranking; i: number }) => (
  <li class="card list-item ring-card" hidden={hiddenAfterFirstPage(i)}>
    <a class="list-link ring-link" href={`/ranking/${r.id}`}>
      <div class="ring-main">
        <div class="list-title">
          <RingBadge status={r.status} />
          {r.name}
        </div>
        <div class="list-meta">作成日 {formatDate(r.created_at)}</div>
      </div>
      <div class="ring-count">
        <strong>{r.participants}</strong>
        <span>人参加</span>
      </div>
    </a>
  </li>
)

// イベント1件分
const EventItem = ({ r, i }: { r: Ranking & { event_status?: keyof typeof STATUS; capacity?: number | null; entered?: number }; i: number }) => {
  const [label, cls] = STATUS[r.event_status ?? 'entry'] ?? STATUS.entry
  const count = r.capacity ? `参加 ${r.participants} / ${r.capacity}人` : `参加 ${r.participants}人`
  const meta = [r.held_on ? `開催日 ${formatDay(r.held_on)}` : '開催日 未定', count, r.entered ? '申し込み済み' : ''].filter(Boolean)
  return (
    <li class="card list-item ev-card" hidden={hiddenAfterFirstPage(i)}>
      <a class="list-link ev-link" href={`/event/${r.id}`}>
        <div class="ev-main">
          <div class="list-title">
            <span class={`badge ${cls}`}>{label}</span>
            {r.name}
          </div>
          <div class="list-meta">{meta.join(' ・ ')}</div>
        </div>
        {r.winner && (
          <div class="ev-winner">
            <span>優勝</span>
            <strong>{r.winner}</strong>
          </div>
        )}
      </a>
    </li>
  )
}

// トーナメント1件分
const TournamentItem = ({ t, i }: { t: Tournament; i: number }) => {
  const [label, cls] = STATUS[t.status]
  const entries = t.capacity ? `参加 ${t.entries} / ${t.capacity}人` : `参加 ${t.entries}人`
  return (
    <li class="tm-card" hidden={hiddenAfterFirstPage(i)}>
      <a class="tm-card-link" href={`/tournament/${t.id}`}>
        <div class="tm-card-top">
          <span class={`badge ${cls}`}>{label}</span>
          {t.entered ? <span class="tm-card-entered">申し込み済み</span> : null}
        </div>
        <div class="tm-card-title">{t.name}</div>
        <div class="tm-card-meta">{[t.held_on ? `開催日 ${formatDay(t.held_on)}` : '開催日 未定', entries].join(' ・ ')}</div>
      </a>
    </li>
  )
}

// 半期ランキングの上位3人（同点は同順位）
const HalfTop = ({ half, me }: { half: Half; me: string }) => {
  let rank = 0
  const rows = half.rows.slice(0, 3).map((row, i) => {
    if (i === 0 || row.total !== half.rows[i - 1].total) rank = i + 1
    return (
      <li class={row.player_key === me ? 'half-top-row mine' : 'half-top-row'}>
        <span class={`rank-chip rank-${rank}`}>{rank}</span>
        <span class="half-top-name">{row.user_name}</span>
        <span class={`half-top-total ${amountClass(row.total)}`}>{formatAmount(row.total)}</span>
      </li>
    )
  })
  return (
    <ol id="half-top" class="half-top" hidden={rows.length === 0}>
      {rows}
    </ol>
  )
}

export const HomePage = ({ data, me }: { data: HomeData; me: string }) => {
  const monthly = data.rankings.filter((r) => r.kind === 'monthly')
  const events = data.rankings.filter((r) => r.kind === 'event')
  const { half, tournaments } = data
  return (
    <>
      <section class="home-section">
        <SectionHead kind="ring" title="月間リング" sub="毎月のリング戦。順位の確認とScoreの入力はここから">
          <IconRing />
        </SectionHead>
        <ul id="ranking-list" class="list">
          {monthly.map((r, i) => (
            <RingItem r={r} i={i} />
          ))}
        </ul>
        <Pager count={monthly.length} />
        <p id="empty" class="muted" hidden={monthly.length > 0}>
          まだ月間リングがありません
        </p>
      </section>

      {/* イベント（1つもなければ見出しごと隠す） */}
      <section id="event-section" class="home-section" hidden={events.length === 0}>
        <SectionHead kind="event" title="イベント">
          <IconEvent />
        </SectionHead>
        <ul id="event-list" class="list">
          {events.map((r, i) => (
            <EventItem r={r} i={i} />
          ))}
        </ul>
        <Pager count={events.length} />
      </section>

      {/* トーナメント（1つもなければ見出しごと隠す） */}
      <section id="tournament-section" class="home-section" hidden={tournaments.length === 0}>
        <SectionHead kind="tournament" title="トーナメント">
          <IconTournament />
        </SectionHead>
        <ul id="tournament-list" class="list">
          {tournaments.map((t, i) => (
            <TournamentItem t={t} i={i} />
          ))}
        </ul>
        <Pager count={tournaments.length} />
      </section>

      {/* 半期ランキング（今の半期の上位3人） */}
      <section class="home-section">
        <SectionHead kind="half" title="半期ランキング" sub="前期（4〜9月）・後期（10〜3月）の月間リングの合計">
          <IconHalf />
        </SectionHead>
        <a class="half-card" href="/half">
          <div class="half-card-head">
            <span class={half.closed ? 'badge badge-closed' : 'badge badge-grace'}>{half.closed ? '確定' : '暫定'}</span>
            <span>{half.title}</span>
          </div>
          <HalfTop half={half} me={me} />
          <div class="half-card-foot">
            <span>{half.rows.length ? `${half.rows.length}人参加` : 'まだ記録がありません'}</span>
            <span class="half-more">順位表を見る ›</span>
          </div>
        </a>
      </section>
    </>
  )
}
