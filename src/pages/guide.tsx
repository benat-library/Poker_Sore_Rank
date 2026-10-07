import { REBUY_CHIPS, START_CHIPS } from '../lib/rules'
import { GRACE_DAYS } from '../lib/period'
import { IconEvent, IconHalf, IconMe, IconRing, IconTournament } from './parts'

// タップで開閉する項目（見出しだけ並べて、ページが長く見えないようにする）
export const Item = ({ title, children }: { title: string; children: any }) => (
  <details class="guide-item">
    <summary>{title}</summary>
    <div class="guide-body">{children}</div>
  </details>
)

// 「このアプリでできること」の1項目（左にホームと同じアイコン、右に機能名と説明）
const Feature = ({ kind, title, children, icon }: { kind: string; title: string; children: unknown; icon: unknown }) => (
  <li class="feature">
    <span class={`home-icon home-icon-${kind}`} aria-hidden="true">
      {icon}
    </span>
    <div>
      <p class="feature-title">{title}</p>
      <p class="feature-text">{children}</p>
    </div>
  </li>
)

// 説明書ページ（ルールの数値はコードの設定値をそのまま表示する）
export const GuidePage = () => (
  <>
    <h1>使い方</h1>

    {/* ポーカー自体の遊び方（ログイン画面からも開ける公開ページ） */}
    <a href="/howto" class="btn howto-link guide-howto-link">
      テキサスホールデムの遊び方
    </a>

    {/* アプリの機能の紹介（機能を追加したら、ここにも書き足す） */}
    <section class="card guide">
      <h2>このアプリでできること</h2>
      <ul class="feature-list">
        <Feature kind="ring" title="月間リング" icon={<IconRing />}>
          毎月のリング戦の記録です。最終チップ数を入れるだけで Score を自動で計算し、順位表と累計 Score のグラフで今の順位がわかります。翌月{GRACE_DAYS}日までなら直せます。
        </Feature>
        <Feature kind="half" title="半期ランキング" icon={<IconHalf />}>
          前期（4〜9月）・後期（10〜3月）の月間リングの合計 Score の順位です。ホームの一番下から見られます。
        </Feature>
        <Feature kind="event" title="イベント" icon={<IconEvent />}>
          部で開くイベントです。これまではリングトーナメント（Rebuy なし）を開いていて、今後ほかの形式を開くこともあります。開催するときは、アプリから申し込めます。
        </Feature>
        <Feature kind="tournament" title="トーナメント" icon={<IconTournament />}>
          部で開くトーナメントです。これまでは1対1の勝ち抜き戦を開いています。開催するときは、アプリから申し込めます。
        </Feature>
        <Feature kind="me" title="マイページ" icon={<IconMe />}>
          月間リング・イベント・トーナメントの成績（1位の回数、平均順位、勝率など）を、まとめて見られます。
        </Feature>
      </ul>
      <p class="note">イベントとトーナメントの画面では、ブラインドストラクチャーも確認できます。</p>
    </section>

    <h2>やりたいこと</h2>
    <section class="card guide guide-list">
      <Item title="Scoreを入力する（月間リング）">
        <ol>
          <li>ホームの「月間リング」から、その月の月間リング（「開催中」のラベル）を開く</li>
          <li>下の「Scoreを入力」の「最終チップ数」に、終了時のチップ数を入れる</li>
          <li>Rebuy した場合は「Rebuyした」にチェックを入れ、−／＋で回数を合わせる</li>
          <li>「Score」の欄に計算結果が出るので、合っているか確認する</li>
          <li>日付を確認して「送信」を押す</li>
        </ol>
        <ul>
          <li>日付は最初は今日になっています。別の日の分を入れるときは日付を変えてください（その月の日付だけ選べます）。</li>
          <li>入力できるのは自分の Score だけです。</li>
          <li>同じ日付でもう一度送信すると、前の入力は上書きされます。</li>
        </ul>
      </Item>

      <Item title="入力を間違えた・直したい">
        <ul>
          <li>同じ日付で正しい内容をもう一度送信すれば、上書きされます。</li>
          <li>または、順位表の右上の「入力履歴」を開き、自分の行の「編集」「削除」から直せます。</li>
          <li>直せるのは自分の記録だけです。他の人の記録の間違いに気づいたら、ポーカー部運営に相談してください。</li>
          <li>確定したあとは直せません。ポーカー部運営に相談してください。</li>
        </ul>
      </Item>

      <Item title="順位表・グラフを見る">
        <ul>
          <li>順位は合計 Score の多い順です。合計が同じ人は同じ順位になります。</li>
          <li>参加回数は、入力した日数です。</li>
          <li>グラフは累計 Score の推移です。上位5人と自分を色付きで表示します。</li>
          <li>グラフをタップ（なぞる）と、その日の時点の累計が出ます。グラフ以外をタップすると消えます。</li>
          <li>順位表の名前をタップすると、その人の線を強調します。もう一度タップすると元に戻ります。</li>
          <li>ページの一番下の「CSVダウンロード」で、記録をファイルに保存できます。</li>
        </ul>
      </Item>

      <Item title="みんなの入力を見る（入力履歴）">
        <ul>
          <li>順位表の右上の「入力履歴」で、全員の入力を日付ごとに見られます。上の日付のタブで日を切り替えます。</li>
          <li>「表示する人」で、1人の入力だけに絞り込めます。</li>
          <li>その日の全員の合計が 0 にならないときは、警告が出ます（下の「よくある質問」を見てください）。</li>
        </ul>
      </Item>

      <Item title="自分の成績を見る（マイページ）">
        <ul>
          <li>上の「マイページ」で、全ての月間リングを通した自分の成績を見られます。</li>
          <li>1戦ごとの成績：月間リングの1日を1戦として、参加・1位・平均順位・通算 Score・勝率（プラスで終えた割合）などを集計します。</li>
          <li>月間リングの成績：確定した月間リング戦のみ集計します。</li>
          <li>月間リングごとの順位：各月の順位と合計 Score です。確定前の月は「暫定」と表示します。</li>
          <li>イベントの成績：優勝・上位30%（参加人数の30%を四捨五入した順位まで）・平均順位・平均参加人数と、イベントごとの順位です。終了したイベントだけ集計します。</li>
          <li>トーナメントの成績：優勝・準優勝・最高成績（ベスト4など）・平均参加人数と、大会ごとの成績です。</li>
          <li>記録がない欄は表示されません。</li>
          <li>ログアウトは、マイページの一番下からできます。</li>
        </ul>
      </Item>

      <Item title="半期ランキングを見る">
        <ul>
          <li>ホームの一番下の「半期ランキング」で、前期（4〜9月）・後期（10〜3月）の月間リングの合計 Score の順位を見られます。</li>
          <li>ホームには上位3人が出ます。「順位表を見る」で全員の順位を見られます。</li>
          <li>集計中の半期は「暫定」と表示します。最後の月の月間リングが確定すると「確定」になります。</li>
          <li>順位表の上の「表示する半期」で、過去の半期に切り替えられます。</li>
        </ul>
      </Item>

      <Item title="イベントに申し込む">
        <ol>
          <li>ホームの「イベント」からイベントを開く（「受付中」のラベル）</li>
          <li>「申し込む」を押す</li>
        </ol>
        <ul>
          <li>申し込めるのは、競技ポーカー部のロールを持っている人だけです。定員がある場合は、埋まった時点で締め切りです。</li>
          <li>受付中なら、同じボタンで申し込みを取り消せます。</li>
          <li>当日はポーカー部運営が受付を締め切って開始し、飛んだ人を順に記録します。画面で残りの人数と順位を見られます。</li>
          <li>最後の1人が決まると終了し、表彰台と全員の順位が表示されます。結果はマイページの「イベントの成績」にも入ります。</li>
        </ul>
      </Item>

      <Item title="トーナメントに申し込む">
        <ol>
          <li>ホームの「トーナメント」から大会を開く（「受付中」のラベル）</li>
          <li>「申し込む」を押す</li>
        </ol>
        <ul>
          <li>申し込めるのは、競技ポーカー部のロールを持っている人だけです。定員がある場合は、埋まった時点で締め切りです。</li>
          <li>受付中なら、同じボタンで申し込みを取り消せます。</li>
          <li>受付が締め切られると、ランダムに組み合わせが作られ、トーナメント表が表示されます。自分の名前には金色の印が付きます。</li>
          <li>大会が終わると、優勝・準優勝などの結果が表示されます。結果はマイページの「トーナメントの成績」にも入ります。</li>
        </ul>
      </Item>

      <Item title="締め切りを確認する">
        <ul>
          <li>月間リングは、その月のリング戦の記録が可能です。</li>
          <li>翌月{GRACE_DAYS}日までは入力・修正できます（猶予期間）。</li>
          <li>翌月{GRACE_DAYS + 1}日以降は確定となり、入力・修正・削除はできません。</li>
        </ul>
        <p>月間リング名の横のラベルで、今の状態がわかります。</p>
        <ul>
          <li>
            <span class="badge badge-open">開催中</span>その月の途中です
          </li>
          <li>
            <span class="badge badge-grace">締め間近</span>月が終わり、猶予期間中です
          </li>
          <li>
            <span class="badge badge-closed">確定</span>結果が確定しました
          </li>
        </ul>
      </Item>
    </section>

    <h2>よくある質問</h2>
    <section class="card guide guide-list">
      <Item title="入力し忘れた">
        <p>翌月{GRACE_DAYS}日までなら、日付をその日に変えて入力できます。過ぎてしまった場合は、ポーカー部運営に相談してください。</p>
      </Item>
      <Item title="確定したあとで間違いに気づいた">
        <p>アプリからは直せません。ポーカー部運営に相談してください。</p>
      </Item>
      <Item title="飛んだ（チップがなくなった）ときは？">
        <p>
          そのまま終わった場合は、最終チップ数に 0 を入れてください。Rebuy して続けた場合は、最後に残ったチップ数と Rebuy の回数を入れてください。
        </p>
      </Item>
      <Item title="Rebuyの回数はどう数える？">
        <p>Rebuy した回数をそのまま入れてください。1回につき {REBUY_CHIPS} チップ分が Score から引かれます。</p>
      </Item>
      <Item title="過去の記録が出てこない・名前が違う">
        <p>
          自動で自分の記録になるのは、42公式Discordサーバーのニックネーム（intra名）と同じ名前の記録だけです。名前を変えていて見つからない場合等は、ポーカー部運営に相談してください。
        </p>
      </Item>
      <Item title="ニックネームを変えたのに、名前が古いまま">
        <p>名前はログインしたときに更新されます。マイページの一番下からログアウトして、ログインし直してください。</p>
      </Item>
      <Item title="「合計が0になっていません」と出た">
        <p>
          ポーカーはゼロサムなので、その日の全員の Score の合計は本来 0 になります。入力漏れや入力ミスがないか確認してください。なお、過去の記録には報告漏れなどで 0 にならない日があります。
        </p>
      </Item>
    </section>

    <h2>月間リングのルール</h2>
    <section class="card guide">
      <ul>
        <li>初期チップは{START_CHIPS}、ブラインドは SB 1 / BB 2 です。</li>
        <li>Rebuy は1回につき {REBUY_CHIPS} チップです。</li>
        <li>リング戦は1日を1戦として集計します。</li>
      </ul>
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
    </section>

  </>
)
