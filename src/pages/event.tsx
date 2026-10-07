// イベント画面：1日のリングトーナメント（リバイなし・飛んだら終わり）の申し込み・進行・順位（データは event.js が取得・描画する）
// 受付中：申し込み → 開催中：管理者が飛んだ順にタップ → 終了：順位を表示

import { InfoForm } from './info-form'
import { BlindStructure } from './blinds'

// 星の絵（イベントの印。線で描く）
export const Star = ({ size = 28 }: { size?: number }) => (
  <svg class="ev-star" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
)

export const EventPage = ({ id }: { id: number }) => (
  <div id="page" data-event-id={String(id)}>
    <header class="page-header">
      <a href="/" class="btn btn-small">← 一覧</a>
    </header>

    {/* イベントの見出し（名前・開催日・状態・募集の埋まり具合） */}
    <section class="ev-hero">
      <div class="tm-hero-top">
        <span id="event-badge"></span>
        <span class="ev-hero-kind">イベント</span>
      </div>
      <h1 class="ev-hero-title">
        <Star />
        <span id="event-name">読み込み中…</span>
      </h1>
      <p id="event-date" class="ev-hero-meta"></p>
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

    <InfoForm label="イベント" />

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
        <button id="close-btn" type="button" class="btn btn-primary">受付を締め切って開始する</button>
      </div>
    </section>

    {/* 開催中：残っている人と、飛んだ人の順位 */}
    <section id="running-section" hidden>
      <h2>
        残り <span id="remaining-count"></span>人
      </h2>
      <p class="note admin-only">飛んだ人をタップしてください。最初に飛んだ人が最下位になり、最後の1人が決まると自動で1位になって終了します。</p>
      <ul id="remaining-list" class="tm-entries entries-vertical ev-remaining"></ul>
      <div class="admin-only admin-actions">
        <button id="undo-btn" type="button" class="btn">1つ戻す</button>
        <button id="reopen-btn" type="button" class="btn">受付に戻す</button>
        <p class="note">受付に戻せるのは、まだ誰も飛んでいないときだけです</p>
      </div>
    </section>

    {/* 終了：表彰台 */}
    <div id="podium" class="tm-podium" hidden></div>

    {/* 順位（開催中は飛んだ人、終了後は全員） */}
    <section id="places-section" hidden>
      <h2>順位</h2>
      <div class="card table-card">
        <table class="standings">
          <tbody id="places-body"></tbody>
        </table>
      </div>
      <div id="finished-actions" class="admin-only admin-actions" hidden>
        <button id="undo-finished-btn" type="button" class="btn">1つ戻す（開催中に戻す）</button>
      </div>
    </section>
  </div>
)
