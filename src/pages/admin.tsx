// 管理者ページ：リング・大会の作成と削除、過去の記録のひも付け、削除したものの復元、操作履歴（データは admin.js が取得・描画する）
// 他の人の記録の修正や結果入力は、それぞれの画面で「編集モード」をオンにして行う
export const AdminPage = () => (
  <>
    <h1>管理者ページ</h1>

    {/* 管理者の一覧と、管理者の決まり方 */}
    <h2>管理者</h2>
    <div class="card">
      <ul id="admin-list" class="admin-names"></ul>
      <p class="note">
        42のサーバーとポーカー運営サーバーの両方に入っている人が管理者です。交代するときは、ポーカー運営サーバーに招待する（抜けてもらう）だけで済みます。変更が反映されるのは、その人が次にログインしたときです。
      </p>
      <p class="note">
        「一般部員として表示」を押すと、管理者ではない部員の画面を確認できます（その間は、サーバーも一般部員として扱います）。画面上部の「管理者に戻る」で戻せます。
      </p>
      <button type="button" id="member-view-on" class="btn btn-small">一般部員として表示</button>
      <p class="note">
        他の人の記録の修正・代理入力や、トーナメントの結果入力は、それぞれの画面で右下の「編集モード」をオンにすると行えます。
      </p>
    </div>

    <h2>月間リング・イベントの作成</h2>
    <form id="create-form" class="card form-row" novalidate>
      <div class="segmented" role="group" aria-label="ランキングの種類">
        <button type="button" class="segment active" data-kind="monthly" aria-pressed="true">月間リング</button>
        <button type="button" class="segment" data-kind="event" aria-pressed="false">イベント</button>
      </div>
      <label id="period-field">
        対象の年月
        <input id="ranking-period" type="month" />
      </label>
      <label id="name-field" hidden>
        イベント名
        <input id="ranking-name" type="text" maxlength={50} placeholder="例：秋の部内イベント" />
      </label>
      <label id="held-on-field" hidden>
        開催日（未定なら空欄）
        <input id="ranking-held-on" type="date" />
      </label>
      <label id="capacity-field" hidden>
        募集上限（人数・空欄なら上限なし）
        <input id="ranking-capacity" type="text" inputmode="numeric" pattern="[0-9]*" maxlength={3} placeholder="例：9" autocomplete="off" />
      </label>
      <small id="event-note" class="note" hidden>
        作成すると申し込みの受付が始まります。当日はイベントの画面で編集モードをオンにして「受付を締め切って開始する」を押し、飛んだ（抜けた）人を順にタップすると順位が決まります。
      </small>
      <button type="submit" class="btn btn-primary">作成</button>
    </form>

    <h2>トーナメントの作成</h2>
    <form id="tournament-form" class="card form-row" novalidate>
      <label>
        大会名
        <input id="tournament-name" type="text" maxlength={50} placeholder="例：新歓トーナメント" />
      </label>
      <label>
        開催日（未定なら空欄）
        <input id="tournament-date" type="date" />
      </label>
      <label>
        募集上限（人数・空欄なら上限なし）
        <input id="tournament-capacity" type="text" inputmode="numeric" pattern="[0-9]*" maxlength={3} placeholder="例：16" autocomplete="off" />
      </label>
      <button type="submit" class="btn btn-primary">作成</button>
    </form>

    {/* ここから下は長くなるので、見出しをタップしたときだけ開く */}
    <details class="fold-section">
      <summary>
        <h2>月間リング・イベント・トーナメントの削除</h2>
      </summary>
      <p class="note">削除したものは、下の「削除したものを戻す」から元に戻せます。</p>
      <h3 class="admin-sub">月間リング・イベント</h3>
      <ul id="ranking-list" class="list"></ul>
      <p id="ranking-empty" class="muted" hidden>まだありません</p>
      <h3 class="admin-sub">トーナメント</h3>
      <ul id="tournament-list" class="list"></ul>
      <p id="tournament-empty" class="muted" hidden>まだありません</p>
    </details>

    <details id="claim-section" class="fold-section">
      <summary>
        <h2>過去の記録のひも付け</h2>
      </summary>
      <p class="note">
        取り込んだ過去の記録の、名前ごとのひも付け先です。ひも付け先を選び直して「変更」を押すと、元のひも付けは外れて新しい部員の記録になります。「未ひも付け」を選ぶと解除されます。月間リングの記録と一緒に、管理者が同じ名前で登録したイベント・トーナメントの参加記録もまとめて付け替えます（本人が自分で申し込んだ記録はそのままです）。ひも付けられるのは1人につき1つの名前までです。選べるのは、一度ログインしたことのある部員です。
        並びは、まだひも付いていない名前が先で、その中はそれぞれ名前のアルファベット順（大文字・小文字は区別しない）です。
      </p>
      <ul id="claim-list" class="list"></ul>
      <p id="claim-empty" class="muted" hidden>取り込んだ過去の記録はありません</p>
    </details>

    <details class="fold-section">
      <summary>
        <h2>削除したものを戻す</h2>
      </summary>
      <h3 class="admin-sub">月間リング・イベント</h3>
      <ul id="deleted-rankings" class="list"></ul>
      <h3 class="admin-sub">記録（新しい順に100件まで）</h3>
      <ul id="deleted-scores" class="list"></ul>
      <h3 class="admin-sub">トーナメント</h3>
      <ul id="deleted-tournaments" class="list"></ul>
    </details>

    <details id="log-section" class="fold-section">
      <summary>
        <h2>操作履歴</h2>
      </summary>
      <p class="note">誰が・いつ・何をしたかの記録です（新しい順に20件ずつ）。</p>
      <ul id="log-list" class="card log-list"></ul>
      <nav id="log-pager" class="pager" aria-label="操作履歴のページ切り替え" hidden></nav>
    </details>
  </>
)
