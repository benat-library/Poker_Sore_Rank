import { REBUY_CHIPS, START_CHIPS } from '../lib/rules'
import { GRACE_DAYS } from '../lib/period'

// 説明書ページ（ルールの数値はコードの設定値をそのまま表示する）
export const GuidePage = () => (
  <>
    <header class="page-header">
      <a href="/" class="btn btn-small">← ホーム</a>
    </header>
    <h1>使い方</h1>

    <section class="card guide">
      <h2>ログイン</h2>
      <ul>
        <li>ポーカー部の Discord サーバーのメンバーだけが、Discord アカウントでログインして使えます。</li>
        <li>一度ログインすると30日間はログインしたままです。使うたびに期限が延びます。</li>
        <li>入力した記録は、ログイン中の Discord アカウントの記録になります。表示される名前は、Discord サーバーでのニックネームです。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>月間リングのルール</h2>
      <ul>
        <li>初期チップは{START_CHIPS}、ブラインドは SB 1 / BB 2 です。</li>
        <li>Rebuy は1回につき {REBUY_CHIPS} チップです。</li>
        <li>1日を1戦として数えます。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>Scoreの入力</h2>
      <p>月間リングでは、終了時の<strong>最終チップ数</strong>を入力します。Rebuy した場合は「Rebuyした」にチェックを入れ、回数を入力してください。</p>
      <p>Score は自動で計算されます。</p>
      <p class="guide-formula">Score ＝ 最終チップ数 − {START_CHIPS} − {REBUY_CHIPS} × Rebuy回数</p>
      <table class="guide-table">
        <thead>
          <tr>
            <th>最終チップ数</th>
            <th>Rebuy</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>350</td>
            <td>なし</td>
            <td class="plus">+{350 - START_CHIPS}</td>
          </tr>
          <tr>
            <td>120</td>
            <td>なし</td>
            <td class="minus">{120 - START_CHIPS}</td>
          </tr>
          <tr>
            <td>0（飛び）</td>
            <td>なし</td>
            <td class="minus">{-START_CHIPS}</td>
          </tr>
          <tr>
            <td>0（飛び）</td>
            <td>1回</td>
            <td class="minus">{-START_CHIPS - REBUY_CHIPS}</td>
          </tr>
          <tr>
            <td>500</td>
            <td>1回</td>
            <td class="plus">+{500 - START_CHIPS - REBUY_CHIPS}</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>同じ人が同じ日にもう一度送信すると、前の入力は上書きされます。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>締めと確定</h2>
      <ul>
        <li>月間リングに入力できるのは、その月の日付だけです。</li>
        <li>月末で締め、翌月{GRACE_DAYS}日までは入力・修正できます（猶予期間）。</li>
        <li>翌月{GRACE_DAYS + 1}日以降は確定となり、入力・修正・削除はできません。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>入力履歴</h2>
      <ul>
        <li>ランキング内の全員の入力を、新しい順に表示します。「表示する人」で絞り込めます。</li>
        <li>自分の入力だけ、編集・削除ができます。</li>
        <li>ポーカーはゼロサムなので、その日の全員の Score の合計は 0 になります。0 にならない日は警告が出るので、入力漏れや入力ミスがないか確認してください。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>順位表とグラフ</h2>
      <ul>
        <li>順位は合計 Score の多い順です。合計が同じ人は同じ順位になります。</li>
        <li>参加回数は、同じ日に何回入力しても1回と数えます。</li>
        <li>グラフは累計 Score の推移です。上位5人と自分を色付きで表示し、順位表の名前をタップするとその人の線を強調します。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>マイページ</h2>
      <ul>
        <li>全ての月間リングを通した、自分の成績を表示します。</li>
        <li>ログインすると、Discord サーバーでの名前（ニックネーム）と同じ名前の過去の記録が、自動で自分の記録になります。名前を変えていて記録が見つからない場合は、管理者に相談してください。</li>
        <li>1戦ごとの成績：月間リングの1日を1戦として、1位率・平均順位・平均参加人数などを出します。</li>
        <li>月間リングの成績：確定した月間リングだけを数えます。開催中や猶予期間中のリングは「暫定」として一覧にのみ表示します。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>その他イベント</h2>
      <ul>
        <li>イベントでは、Score（＋/− と数値）を直接入力します。</li>
      </ul>
    </section>
  </>
)
