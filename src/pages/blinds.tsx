// ブラインドストラクチャー（イベント・トーナメント共通。タップで開く）
// 段階と1レベルの時間は大会ごとに違うので、表と編集欄の中身は common.js の showBlinds が入れる
// 編集モードでは、表の下の編集欄で段階（SB / BB）と1レベルの時間を変えられる（保存は bindBlindForm）
export const BlindStructure = () => (
  <details class="fold-section blind-fold">
    <summary>
      <h2>ブラインドストラクチャー</h2>
    </summary>
    <div class="card table-card">
      <p class="blind-head">
        1レベル <strong id="blind-minutes"></strong>分
      </p>
      <table class="standings blind-table">
        <thead>
          <tr>
            <th class="col-rank">Lv</th>
            <th>SB / BB</th>
          </tr>
        </thead>
        <tbody id="blind-body"></tbody>
      </table>
    </div>

    {/* 編集モード：段階と1レベルの時間の編集 */}
    <form id="blind-form" class="card form-row admin-only blind-form" novalidate>
      <p class="blind-form-title">ブラインドを編集（編集モード）</p>
      <label>
        1レベルの時間
        <span class="blind-minutes-row">
          <input id="blind-minutes-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength={2} autocomplete="off" />
          分
        </span>
      </label>
      <div id="blind-rows" class="blind-rows"></div>
      <div class="blind-form-actions">
        <button type="button" id="blind-add" class="btn btn-small">＋ レベルを追加</button>
        <button type="button" id="blind-reset" class="btn btn-small">標準に戻す</button>
      </div>
      <button type="submit" class="btn btn-primary">保存</button>
    </form>
  </details>
)
