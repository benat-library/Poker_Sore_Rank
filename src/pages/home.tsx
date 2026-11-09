// ホーム画面。月間リング・イベント・トーナメント・半期ランキングを、サーバーで最初から埋めて返す（空の画面が一瞬見えないように）
// 一覧は全件を描き、10件ずつの切り替えは home.js（common.js の paginateList）が見せる・隠すで行う。見た目を作るのはこのファイルだけ
// リングや大会の作成・削除は管理者ページで行う
import { amountClass, formatAmount, formatDay, formatMonthDay } from '../lib/format'
import { todayJst } from '../lib/period'
import { ENTRY_STATUS as STATUS, IconEvent, IconHalf, IconRing, IconTournament, Pager, RingBadge, hiddenAfterFirstPage } from './parts'
import type { listRankings } from '../routes/rankings'
import type { listTournaments } from '../routes/tournaments'
import type { halfRanking } from '../routes/stats'
import type { latestRingChampion } from '../routes/scores'

type Ranking = Awaited<ReturnType<typeof listRankings>>[number]
type Tournament = Awaited<ReturnType<typeof listTournaments>>[number]
type Half = Awaited<ReturnType<typeof halfRanking>>
type Champion = Awaited<ReturnType<typeof latestRingChampion>>
export type HomeData = { rankings: Ranking[]; tournaments: Tournament[]; half: Half; champion: Champion }

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

// 月間リング1件分。状態はカードの枠と地の色で見せる
//   開催中：緑の枠（いちばん目立つ） / 締め間近：オレンジの枠と地 / 確定：灰色の地で控えめに
const RingItem = ({ r, i }: { r: Ranking; i: number }) => (
  <li class={`card list-item ring-card ring-${r.status}`} hidden={hiddenAfterFirstPage(i)}>
    <a class="list-link ring-link" href={`/ranking/${r.id}`}>
      <div class="ring-head">
        <div class="ring-main">
          <div class="list-title">
            <RingBadge status={r.status} />
            {r.name}
          </div>
          <RingDeadline r={r} />
          <RingSaturdays r={r} />
        </div>
        <div class="ring-count">
          <strong>{r.participants}</strong>
          <span>人参加</span>
        </div>
      </div>
    </a>
  </li>
)

// 2つの日付（YYYY-MM-DD）の差の日数
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

// 締め切りの一言（開催中：次の土曜と残り回数 / 締め間近：入力できる最終日 / 確定：確定した日）
const RingDeadline = ({ r }: { r: Ranking }) => {
  if (!r.date_max || !r.grace_end || !r.closed_on) return null
  const today = todayJst()
  const left = (date: string) => {
    const days = daysBetween(today, date)
    return days <= 0 ? '今日まで' : `あと${days}日`
  }
  // 開催中は、次の土曜（定例リング）と今月の残り回数を出す
  if (r.status === 'open' && r.period) {
    const rest = saturdaysOf(r.period).filter((d) => d >= today)
    if (rest.length === 0) {
      return (
        <div class="ring-deadline">
          今月の開催は終了・入力・修正は{formatMonthDay(r.grace_end)}まで
        </div>
      )
    }
    const [m, d] = rest[0].slice(5).split('-').map(Number)
    return (
      <div class="ring-deadline">
        {rest[0] === today ? '今日開催' : `次回 ${m}/${d}（土）`}
        <strong>残り{rest.length}回</strong>
      </div>
    )
  }
  if (r.status === 'grace') {
    return (
      <div class="ring-deadline">
        入力・修正は{formatMonthDay(r.grace_end)}まで<strong>{left(r.grace_end)}</strong>
      </div>
    )
  }
  return <div class="ring-deadline">{formatMonthDay(r.closed_on)}に確定</div>
}

// その月の土曜日（YYYY-MM-DD）の一覧
const saturdaysOf = (period: string) => {
  const [y, m] = period.split('-').map(Number)
  const days: string[] = []
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 6) days.push(d.toISOString().slice(0, 10))
  }
  return days
}

// 定例リング（毎週土曜）の進み具合。土曜ごとのマスが、過ぎた日から埋まっていく（今日が土曜ならそのマスを強調）
// 確定したリングには出さない（カードを控えめにするため）
const RingSaturdays = ({ r }: { r: Ranking }) => {
  if (!r.period || r.status === 'closed') return null
  const today = todayJst()
  const sats = saturdaysOf(r.period)
  const done = sats.filter((d) => d < today).length
  return (
    <div class="ring-sats" role="img" aria-label={`土曜の定例リング ${sats.length}回中${done}回終了`}>
      <ol>
        {sats.map((d) => (
          <li class={d < today ? 'done' : d === today ? 'today' : undefined}>{`${Number(d.slice(5, 7))}/${Number(d.slice(8))}`}</li>
        ))}
      </ol>
    </div>
  )
}

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

// 直近に確定した月間リングの優勝バナー（1位の名前とScore。同点なら全員並べる）
const ChampionBanner = ({ champion, me }: { champion: NonNullable<Champion>; me: string }) => (
  <a class="champ-banner" href={`/ranking/${champion.id}`}>
    <div class="champ-kind">
      <span class="champ-crown" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" />
        </svg>
      </span>
      {champion.name} 優勝
    </div>
    <ul class="champ-winners">
      {champion.winners.map((w) => (
        <li class={w.player_key === me ? 'champ-name mine' : 'champ-name'}>{w.user_name}</li>
      ))}
    </ul>
    <div class={`champ-score ${amountClass(champion.total)}`}>
      <span>Score</span>
      <strong>{formatAmount(champion.total)}</strong>
    </div>
    <div class="champ-foot">
      <span>{formatMonthDay(champion.closed_on)}確定 ・ {champion.participants}人参加</span>
      <span class="champ-more">順位表を見る ›</span>
    </div>
  </a>
)

export const HomePage = ({ data, me }: { data: HomeData; me: string }) => {
  const monthly = data.rankings.filter((r) => r.kind === 'monthly')
  const events = data.rankings.filter((r) => r.kind === 'event')
  const { half, tournaments } = data
  return (
    <>
      {data.champion && <ChampionBanner champion={data.champion} me={me} />}

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
        <SectionHead kind="tournament" title="1on1 トーナメント">
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
