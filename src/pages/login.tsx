// ログイン画面
const ERRORS: Record<string, string> = {
  not_member: 'ポーカー部の Discord サーバーのメンバーだけが利用できます',
  failed: 'ログインに失敗しました。もう一度お試しください',
}

export const LoginPage = ({ error }: { error?: string }) => (
  <div class="login">
    <h1>ポーカー部 スコア集計</h1>
    <div class="card form-row">
      {error && ERRORS[error] && <p class="login-error">{ERRORS[error]}</p>}
      <a href="/auth/login" class="btn btn-discord">
        Discord でログイン
      </a>
      <p class="note">ポーカー部の Discord サーバーのメンバーだけが利用できます。一度ログインすると、30日間はログインしたままになります（使うたびに延長されます）。</p>
    </div>
  </div>
)
