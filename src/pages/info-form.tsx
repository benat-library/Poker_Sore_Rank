// 大会の情報（名前・開催日・募集上限）を変える欄（イベント・トーナメント共通。編集モードでだけ表示する）
// 入力値の読み込みと保存は common.js の fillInfoForm / bindInfoForm が行う
export const InfoForm = ({ label }: { label: string }) => (
  <details class="admin-only fold-section info-fold">
    <summary>
      <h2>{label}の情報を変える（編集モード）</h2>
    </summary>
    <form id="info-form" class="card form-row" novalidate>
      <label>
        {label}名
        <input id="info-name" type="text" maxlength={50} />
      </label>
      <label>
        開催日（未定なら空欄）
        <input id="info-date" type="date" />
      </label>
      <label>
        募集上限（人数・空欄なら上限なし）
        <input id="info-capacity" type="text" inputmode="numeric" pattern="[0-9]*" maxlength={3} autocomplete="off" />
        <small class="note">今の参加人数より少なくしても、すでに申し込んだ人はそのまま残ります</small>
      </label>
      <button type="submit" class="btn btn-primary">保存</button>
    </form>
  </details>
)
