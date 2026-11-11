// 複数の画面で使う部品（サーバーで画面を作るとき用）

// 一覧は10件ずつ表示する（public/common.js の PAGE_SIZE と同じ）
// サーバーは全件を描き、2ページ目以降には hidden を付けておく。切り替えは common.js の paginateList が行う
// 件数を変える一覧は、ここの size と paginateList の size に同じ値を渡す
export const PAGE_SIZE = 10
// 月間リングは1ページ半期分（6か月）ずつ表示する（public/home.js と同じ）
// 新しい順に並んだ一覧を古い側から6件ずつ区切るので、各ページがちょうど半期になる。最初は最新のページを見せる
export const RING_PAGE_SIZE = 6
export const hiddenAfterFirstPage = (index: number, size = PAGE_SIZE) => index >= size
// 末尾（いちばん古いもの）から size 件ずつ区切ったとき、最新のページ（先頭を含むページ）以外を隠す
export const hiddenOutsideLatestPage = (index: number, count: number, size = PAGE_SIZE) =>
  Math.floor((count - 1 - index) / size) !== Math.floor((count - 1) / size)

// 最初に開くページのページ番号タブ（2ページ以上になるときだけ。押したときの処理は paginateList が付け直す）
// latest：古い順に番号を振り、最後のページ（最新）を選んだ状態にする
export const Pager = ({ count, size = PAGE_SIZE, latest = false }: { count: number; size?: number; latest?: boolean }) => {
  const pages = Math.ceil(count / size)
  if (pages <= 1) return null
  const current = latest ? pages - 1 : 0
  return (
    <nav class="pager" aria-label="ページ切り替え">
      {Array.from({ length: pages }, (_, i) => (
        <button type="button" class={i === current ? 'pager-btn active' : 'pager-btn'} aria-current={i === current ? 'page' : 'false'}>
          {i + 1}
        </button>
      ))}
    </nav>
  )
}

// 受付中・開催中・終了のラベル（イベント・トーナメント共通）
export const ENTRY_STATUS = { entry: ['受付中', 'badge-open'], running: ['開催中', 'badge-grace'], finished: ['終了', 'badge-closed'] } as const

// 月間リングの状態ラベル（開催中・締め間近・確定）
export const RingBadge = ({ status }: { status: string }) =>
  status === 'open' ? (
    <span class="badge badge-open">開催中</span>
  ) : status === 'grace' ? (
    <span class="badge badge-grace">締め間近</span>
  ) : (
    <span class="badge badge-closed">確定</span>
  )

// 機能ごとのアイコン（ホームの見出し・使い方ページで使う。線で描き、色は CSS の .home-icon-* で付ける）
const Svg = ({ children }: { children: unknown }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    {children}
  </svg>
)
// ポーカーチップ（月間リング）
export const IconRing = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </Svg>
)
// 星（イベント）
export const IconEvent = () => (
  <Svg>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </Svg>
)
// トロフィー（トーナメント）
export const IconTournament = () => (
  <Svg>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
  </Svg>
)
// 表彰台（半期ランキング）
export const IconHalf = () => (
  <Svg>
    <path d="M3 21h18M5 21v-6h4v6M10 21V9h4v12M15 21v-9h4v9M12 3l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 5.3l2-.3z" />
  </Svg>
)
// 人（マイページ）
export const IconMe = () => (
  <Svg>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </Svg>
)
