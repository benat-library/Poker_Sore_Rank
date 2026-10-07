import { REBUY_CHIPS, START_CHIPS } from '../lib/rules'
import { Item } from './guide'

// テキサスホールデムのルール・役・遊び方（新入生向け。ログインしていなくても見られる）

// トランプ1枚（例：<Card c="A♠" />。♥♦は赤で表示する）
const Card = ({ c }: { c: string }) => <span class={/[♥♦]/.test(c) ? 'pcard red' : 'pcard'}>{c}</span>
const Cards = ({ cs }: { cs: string }) => (
  <span class="pcards">
    {cs.split(' ').map((c) => (
      <Card c={c} />
    ))}
  </span>
)

// 役の一覧（強い順）
const HANDS: { name: string; desc: string; example: string }[] = [
  { name: 'ロイヤルフラッシュ', desc: '同じマークの 10・J・Q・K・A', example: '10♠ J♠ Q♠ K♠ A♠' },
  { name: 'ストレートフラッシュ', desc: '同じマークで数字が5つ連続', example: '5♥ 6♥ 7♥ 8♥ 9♥' },
  { name: 'フォーカード', desc: '同じ数字が4枚', example: '9♠ 9♥ 9♦ 9♣ K♠' },
  { name: 'フルハウス', desc: 'スリーカード ＋ ワンペア', example: 'Q♠ Q♥ Q♦ 4♣ 4♠' },
  { name: 'フラッシュ', desc: '同じマークが5枚', example: '2♦ 6♦ 9♦ J♦ K♦' },
  { name: 'ストレート', desc: '数字が5つ連続（マークは何でもよい）', example: '6♣ 7♦ 8♠ 9♥ 10♣' },
  { name: 'スリーカード', desc: '同じ数字が3枚', example: '7♠ 7♥ 7♣ K♦ 2♠' },
  { name: 'ツーペア', desc: '同じ数字2枚の組が2つ', example: 'J♠ J♦ 5♥ 5♣ A♠' },
  { name: 'ワンペア', desc: '同じ数字2枚の組が1つ', example: '10♥ 10♣ A♦ 8♠ 3♥' },
  { name: 'ハイカード', desc: '役なし。いちばん高いカードで比べる', example: 'A♣ J♥ 8♦ 6♠ 2♣' },
]

// レンジ表（参加してよいスターティングハンドの目安）。自分より前の全員が降りていて、最初にレイズで参加するとき
// 1：どの席からでも、2：真ん中より後ろの席から、3：ボタン付近の後ろの席から。載っていない手は降りる
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const RANGE_TIERS: Record<string, number> = Object.fromEntries([
  ...'AA KK QQ JJ TT 99 88 77 AKs AQs AJs ATs KQs KJs KTs QJs QTs JTs AKo AQo AJo KQo'.split(' ').map((h) => [h, 1]),
  ...'66 55 A9s A8s A7s A6s A5s A4s A3s A2s K9s Q9s J9s T9s 98s ATo KJo QJo'.split(' ').map((h) => [h, 2]),
  ...('44 33 22 K8s K7s K6s K5s K4s K3s K2s Q8s Q7s Q6s J8s J7s T8s T7s 97s 87s 86s 76s 75s 65s 54s ' +
    'A9o A8o A7o A6o A5o A4o A3o A2o KTo K9o QTo Q9o JTo J9o T9o').split(' ').map((h) => [h, 3]),
])

// 表の1マス分の手の名前（対角線はペア、右上は同じマーク s、左下は違うマーク o）
function handAt(row: number, col: number): string {
  if (row === col) return RANKS[row] + RANKS[col]
  return row < col ? `${RANKS[row]}${RANKS[col]}s` : `${RANKS[col]}${RANKS[row]}o`
}

const RangeChart = () => (
  <div class="range-chart" role="table" aria-label="レンジ表">
    {RANKS.map((_, row) =>
      RANKS.map((_, col) => {
        const hand = handAt(row, col)
        return <span class={`range-cell tier-${RANGE_TIERS[hand] ?? 0}`}>{hand}</span>
      })
    )}
  </div>
)

export const HowtoPage = () => (
  <>
    <h1>テキサスホールデムのルール・役・遊び方</h1>
    <p class="muted">部で遊んでいるポーカー「テキサスホールデム」の基本です。はじめての人はここから読んでください。</p>

    <section class="card guide">
      <h2>どんなゲーム？</h2>
      <ul>
        <li>
          自分だけの手札 <strong>2枚</strong> と、全員で共有する場のカード <strong>5枚</strong> の計7枚から、いちばん強い <strong>5枚の組み合わせ（役）</strong> を作ります。
        </li>
        <li>チップを賭けながら進め、最後にいちばん強い役を持っていた人が、賭けられたチップ（ポット）をもらえます。</li>
        <li>役が弱くても、賭けで相手を全員降ろせば、その時点でポットをもらえます。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>1ゲームの流れ</h2>
      <ol class="howto-flow">
        <li>
          <strong>ブラインド</strong>
          <span>ディーラーボタンの左の2人が、最初に決まった額を賭けます（スモールブラインド・ビッグブラインド）。</span>
        </li>
        <li>
          <strong>プリフロップ</strong>
          <span>全員に手札が2枚ずつ配られ、1回目の賭けをします。</span>
        </li>
        <li>
          <strong>フロップ</strong>
          <span>場にカードが3枚開かれ、2回目の賭けをします。</span>
        </li>
        <li>
          <strong>ターン</strong>
          <span>場に4枚目が開かれ、3回目の賭けをします。</span>
        </li>
        <li>
          <strong>リバー</strong>
          <span>場に5枚目が開かれ、最後の賭けをします。</span>
        </li>
        <li>
          <strong>ショーダウン</strong>
          <span>残った人で手札を見せ合い、いちばん強い役の人がポットをもらいます。</span>
        </li>
      </ol>
      <p class="note">1ゲームごとに、ディーラーボタンが左へ1つ移ります。</p>
    </section>

    <section class="card guide">
      <h2>自分の番でできること</h2>
      <dl class="howto-points">
        <dt>チェック</dt>
        <dd>賭けずに次の人へ回す（まだ誰も賭けていないときだけ）</dd>
        <dt>ベット</dt>
        <dd>最初にチップを賭ける</dd>
        <dt>コール</dt>
        <dd>前の人と同じ額を賭けてついていく</dd>
        <dt>レイズ</dt>
        <dd>前の人より多く賭けて、額を引き上げる</dd>
        <dt>フォールド</dt>
        <dd>降りる（そのゲームはおしまい。賭けたチップは戻りません）</dd>
        <dt>オールイン</dt>
        <dd>手持ちのチップを全部賭ける</dd>
      </dl>
      <p class="note">賭けは時計回りに進み、全員の賭け額がそろったら次のカードへ進みます。</p>
    </section>

    <section class="card guide">
      <h2>役の強さ（上ほど強い）</h2>
      <ol class="howto-hands">
        {HANDS.map((h) => (
          <li>
            <div class="howto-hand-head">
              <strong>{h.name}</strong>
              <span class="note">{h.desc}</span>
            </div>
            <Cards cs={h.example} />
          </li>
        ))}
      </ol>
      <ul>
        <li>数字の強さは 2 が最弱、A が最強です。A は「A・2・3・4・5」のストレートでは 1 としても使えます。</li>
        <li>マーク（♠♥♦♣）に強さの違いはありません。</li>
        <li>同じ役どうしなら、より大きい数字の人が勝ちです。まったく同じならポットを分けます。</li>
        <li>7枚のうち、どの5枚を使ってもかまいません（手札を使わなくてもよい）。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>参加する手の目安（レンジ表）</h2>
      <p>
        配られた2枚で参加するかどうかの目安です。自分より前の人が全員降りていて、自分が最初にレイズで参加するときに使います。
      </p>
      <RangeChart />
      <ul class="range-legend">
        <li>
          <span class="range-swatch tier-1"></span>どの席からでも参加
        </li>
        <li>
          <span class="range-swatch tier-2"></span>真ん中より後ろの席なら参加
        </li>
        <li>
          <span class="range-swatch tier-3"></span>ディーラーボタン付近（後ろの席）なら参加
        </li>
        <li>
          <span class="range-swatch tier-0"></span>降りる
        </li>
      </ul>
      <ul>
        <li>斜めの列はペア（例：AA）、右上は2枚が同じマーク（s）、左下は違うマーク（o）です。T は 10 のことです。</li>
        <li>後ろの席ほど、あとから参加する人が少ないので、広く参加できます。</li>
        <li>前の人がすでにレイズしているときは、濃い緑の中でも強い手（AA〜TT、AK など）に絞りましょう。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>賭ける額の目安（サイズ感）</h2>
      <p>決まりではありませんが、迷ったらこのくらいが目安です。</p>
      <dl class="howto-points">
        <dt>最初の賭け</dt>
        <dd>
          プリフロップで自分から参加するなら、BB（ビッグブラインド）の 3倍程度（部のリング戦なら 6）にレイズするのが基本です。
        </dd>
        <dt>フロップ以降</dt>
        <dd>
          場に出ているチップ（ポット）の <strong>1/2〜1/3</strong> くらい。迷ったら <strong>1/3</strong> にしましょう。
        </dd>
        <dt>大きすぎる・小さすぎる</dt>
        <dd>大きすぎると相手が降りてしまい、小さすぎると相手に安く参加されてしまいます。</dd>
      </dl>
      <p class="note">
        例：ポットが 20 のときは 7-10 前後をベット。初期チップ {START_CHIPS} は、BB（ビッグブラインド） {START_CHIPS / 2} 回分です。
      </p>
    </section>

    <section class="card guide">
      <h2>部のリング戦のルール</h2>
      <ul>
        <li>初期チップは {START_CHIPS}、ブラインドは SB 1 / BB 2 です。</li>
        <li>チップがなくなっても、Rebuy（1回につき {REBUY_CHIPS} チップを追加でもらう）をして続けられます。</li>
        <li>終わったときのチップ数で Score が決まります。記録の付け方は、ログイン後の「使い方」ページで説明しています。</li>
      </ul>
    </section>

    <section class="card guide">
      <h2>はじめての人へ</h2>
      <ul>
        <li>最初は、レンジ表の濃い緑の手だけで参加し、それ以外は降りるのがおすすめです。</li>
        <li>自分の番が来るまでは、カードを捨てたり賭けたりしないようにしましょう。</li>
        <li>わからないことは、遠慮なくまわりの部員に聞いてください。</li>
      </ul>
    </section>

    <h2>よくある質問</h2>
    <section class="card guide guide-list">
      <Item title="自分の番はいつ来る？">
        <p>
          賭けは時計回りに進みます。プリフロップ（カードが配られた直後）はBBの左の人から、フロップ以降はディーラーボタンの左の人（まだ残っている人）から始まります。
        </p>
      </Item>
      <Item title="チェックとフォールドの違いは？">
        <p>
          チェックは「賭けずに続ける」、フォールドは「降りる」です。誰も賭けていないときはチェックすればタダで続けられるので、フォールドする必要はありません。
        </p>
      </Item>
      <Item title="チェックで参加はあり？">
        <p>
          プリフロップでは、ビッグブラインドの人以外はチェックできません。参加するには、少なくともビッグブラインドと同じ額をコールする必要があります（これを「リンプ」といいます）。
        </p>
        <p>
          ルール上はありですが、はじめのうちは、レンジ表の手でレイズして参加するのがおすすめです。ビッグブラインドの人は、誰もレイズしていなければ、チェックでそのまま次へ進めます。
        </p>
      </Item>
      <Item title="リンプって何？">
        <p>プリフロップで、レイズせずにビッグブラインドと同じ額だけをコールして参加することです。</p>
        <p>
          安く参加できる反面、後ろの人にレイズされやすく、主導権も握りにくくなります。はじめのうちは「レイズして参加するか、降りるか」の2択にするのがおすすめです。
        </p>
      </Item>
      <Item title="レイズはいくらからできる？">
        <p>
          前の人が上乗せした額以上を、倍以上に上乗せする必要があります（例：2 に対して 6 でレイズされたら、次にレイズするなら 12 以上）。上限はなく、手持ちのチップ全部まで賭けられます。
        </p>
      </Item>
      <Item title="同じ役どうしだったら？">
        <p>
          役を作る5枚の数字を、大きい順に比べます。たとえば同じワンペアなら、ペアの数字が大きいほうが勝ち。ペアも同じなら、残りのカードで比べます。5枚とも同じ強さなら、ポットを分けます。
        </p>
      </Item>
      <Item title="場の5枚だけでいちばん強い役ができたら？">
        <p>手札を使わずに、場の5枚をそのまま自分の役にできます。残った全員が同じ役になるので、ポットを分けます。</p>
      </Item>
      <Item title="誰かがオールインしたら？">
        <p>
          オールインした人がもらえるのは、自分が賭けた額までの分です。それを超えて賭けられたチップは別のポット（サイドポット）になり、残りの人で争います。
        </p>
      </Item>
      <Item title="ショーダウンはどちらから見せる？">
        <p>
          ディーラーボタンの左の人からです。負けがわかったら、見せずに捨てても構いません。
        </p>
      </Item>
      <Item title="ブラインドはなぜ払うの？">
        <p>毎回最初からチップが場にあることで、強い手を待って降り続けるだけでは勝てないようにするためです。順番に全員が払います。</p>
      </Item>
      <Item title="手札を見られたり、話したりしていい？">
        <p>手札を人に見られないようにするのは、自分の責任です。特定の人に見えてしまった場合は、不公平にならないよう全員に公開してください。</p>
        <p>ゲーム中に話すのは構いません。</p>
      </Item>
      <Item title="ゲーム中にスマホを触っていい？">
        <p>
          自分がまだ降りずに参加している間は、スマホなどの電子機器を触らないでください。不正（チート）とみなされることがあります。降りたあとなら構いません。
        </p>
      </Item>
    </section>
  </>
)
