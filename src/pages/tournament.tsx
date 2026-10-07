import { InfoForm } from './info-form'
import { BlindStructure } from './blinds'

// トーナメント画面：申し込み・参加者一覧・トーナメント表・結果（データは tournament.js が取得・描画する）

// トロフィーの絵（線で描く。色は文字色に合わせる）
export const Trophy = ({ size = 28 }: { size?: number }) => (
  <svg
    class="trophy"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
  </svg>
)

export const TournamentPage = ({ id }: { id: number }) => (
  <div id="page" data-tournament-id={String(id)}>
    <header class="page-header">
      <a href="/" class="btn btn-small">← 一覧</a>
    </header>

    {/* 大会の見出し（名前・開催日・状態・募集の埋まり具合） */}
    <section class="tm-hero">
      <div class="tm-hero-top">
        <span id="tournament-badge"></span>
        <span class="tm-hero-kind">1on1 トーナメント</span>
      </div>
      <h1 class="tm-hero-title">
        <Trophy />
        <span id="tournament-name">読み込み中…</span>
      </h1>
      <p id="tournament-date" class="tm-hero-date"></p>
      <div class="tm-capacity">
        <div class="tm-capacity-text">
          <span>参加者</span>
          <strong id="entry-count"></strong>
        </div>
        <div id="capacity-bar" class="tm-capacity-bar" hidden>
          <span id="capacity-fill"></span>
        </div>
      </div>
    </section>

    <InfoForm label="大会" />

    <BlindStructure />

    {/* 申し込み受付中 */}
    <section id="entry-section" hidden>
      <div class="card tm-entry-card">
        <p id="entry-status" class="tm-entry-status"></p>
        <button id="entry-btn" type="button" class="btn btn-primary tm-entry-btn"></button>
      </div>

      <h2>参加者</h2>
      <ul id="entry-list" class="tm-entries entries-vertical"></ul>
      <p id="entry-empty" class="muted" hidden>まだ申し込みはありません</p>

      {/* 編集モードでは、intra名を手入力して参加者を追加できる */}
      <form id="add-entry-form" class="card form-row admin-only" novalidate>
        <label>
          intra名で参加者を追加（編集モード）
          <input id="add-entry-name" type="text" maxlength={30} autocomplete="off" placeholder="intra名" />
          <small class="note">
            intra名は完全一致で判定します（大文字・小文字も区別）。ログインしたことのある部員と一致すれば、その部員として登録します。募集上限を超えても追加できます
          </small>
        </label>
        <button type="submit" class="btn">追加</button>
      </form>

      <div class="admin-only admin-actions">
        <button id="draw-btn" type="button" class="btn btn-primary">締め切って組み合わせを作る</button>
      </div>
    </section>

    {/* 組み合わせ作成後 */}
    <section id="bracket-section" hidden>
      <div id="result" class="tm-result" hidden></div>
      <h2>トーナメント表</h2>
      <p class="note admin-only">編集モードでは、勝った人の名前をタップすると結果を入れられます（もう一度タップで取り消し）。</p>
      <div class="bk-scroll">
        <div id="bracket" class="bk"></div>
      </div>
      <div class="admin-only admin-actions">
        <button id="redraw-btn" type="button" class="btn">組み合わせを作り直す</button>
        <button id="reopen-btn" type="button" class="btn">受付に戻す</button>
        <p class="note">作り直し・受付に戻すのは、結果をまだ1つも入れていないときだけできます</p>
      </div>
    </section>

    <div class="page-footer admin-only">
      <button id="delete-tournament" type="button" class="btn btn-small btn-danger">大会を削除</button>
    </div>
  </div>
)
