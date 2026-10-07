import { Item } from './guide'

// ログイン画面
const ERRORS: Record<string, string> = {
  not_member: '42公式Discordサーバーのメンバーだけが利用できます',
  failed: 'ログインに失敗しました。もう一度お試しください',
}

export const LoginPage = ({ error }: { error?: string }) => (
  <div class="login">
    <h1>ログイン</h1>
    <div class="card form-row">
      {error && ERRORS[error] && <p class="login-error">{ERRORS[error]}</p>}
      <a href="/auth/login" class="btn btn-discord">
        Discord でログイン
      </a>
      <p class="note">42公式Discordサーバーのメンバーだけが利用できます。一度ログインすると、30日間はログインしたままになります。</p>
      {/* 新入生向けの注意（名前がintra名でないと、過去の記録や代理入力と名前が合わないため） */}
      <p class="login-notice">新入生の方は42公式Discordサーバーの名前をintra名に変更してからログインしてください。</p>
      {/* ログインのしかた（使い方ページはログイン後にしか見られないため、ここに載せる） */}
      <div class="guide guide-list login-help">
        <Item title="はじめてログインする">
          <ol>
            <li>上の「Discord でログイン」を押す</li>
            <li>Discord の画面が出たら「認証」を押す</li>
            <li>ホームが開けば完了です</li>
          </ol>
          <ul>
            <li>表示される名前は、42公式Discordサーバーでのニックネームです。</li>
            <li>はじめてログインしたとき、42公式Discordサーバーのニックネーム（intra名）と同じ名前の過去の記録が、自動で自分の記録になります。</li>
            <li>アプリの使い方は、ログイン後に上の「使い方」から見られます。</li>
          </ul>
        </Item>
      </div>
    </div>
    {/* 新入生向け（ログインしていなくても見られる） */}
    <a href="/howto" class="btn howto-link">
      <span>はじめての人へ</span>
      <span>テキサスホールデムの遊び方</span>
    </a>
  </div>
)
