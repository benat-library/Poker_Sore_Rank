// ランキング詳細画面：順位表の表示とスコア入力

const rankingId = currentRankingId();
const form = document.getElementById('score-form');
const userNameInput = document.getElementById('user-name');
const amountInput = document.getElementById('amount');
const playedOnInput = document.getElementById('played-on');
const signButtons = document.querySelectorAll('.sign-btn');
let sign = 1;

// 順位表を読み込んで描画する
async function loadSummary() {
  try {
    const data = await api('GET', `/api/rankings/${rankingId}/summary`);
    document.getElementById('ranking-name').textContent = data.ranking.name;
    document.title = `${data.ranking.name} | ポーカー部`;

    // 合計が同じ人は同順位にする（例：1位, 2位, 2位, 4位）
    let rank = 0;
    const rows = data.rows.map((row, i) => {
      if (i === 0 || row.total !== data.rows[i - 1].total) rank = i + 1;
      return el('tr', null,
        el('td', { class: 'col-rank' }, rank),
        el('td', { class: 'col-name' }, row.user_name),
        el('td', { class: `col-num ${amountClass(row.total)}` }, formatAmount(row.total)),
        el('td', { class: 'col-num' }, row.days)
      );
    });
    document.getElementById('standings-body').replaceChildren(...rows);
    document.getElementById('empty').hidden = rows.length > 0;
  } catch (e) {
    document.getElementById('ranking-name').textContent = '';
    showMessage(e.message, true);
  }
}

// 符号の切り替え
function setSign(value) {
  sign = value;
  signButtons.forEach((btn) => {
    const active = Number(btn.dataset.sign) === value;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}
signButtons.forEach((btn) => btn.addEventListener('click', () => setSign(Number(btn.dataset.sign))));

// ユーザー名は端末に保存し、次回から自動で入れておく
userNameInput.value = storageGet(USER_NAME_KEY) || '';
userNameInput.addEventListener('input', () => storageSet(USER_NAME_KEY, userNameInput.value.trim()));

keepDigitsOnly(amountInput);

playedOnInput.value = todayString();

// 送信（最終的な検証はサーバー側で行う）
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (amountInput.value === '') {
    showMessage('Scoreを入力してください', true);
    amountInput.focus();
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const amount = sign * Number(amountInput.value);
    const result = await api('POST', `/api/rankings/${rankingId}/scores`, {
      user_name: userNameInput.value,
      amount,
      played_on: playedOnInput.value,
    });
    showMessage(`${formatAmount(amount)} ${result.overwritten ? 'で上書き' : 'を登録'}しました`);
    amountInput.value = '';
    setSign(1);
    loadSummary();
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    button.disabled = false;
  }
});

startPage(loadSummary);
