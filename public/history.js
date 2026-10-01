// 入力履歴画面：全員の入力を表示し、人で絞り込む。自分の行だけ編集・削除できる

const rankingId = currentRankingId();
const listEl = document.getElementById('history-list');
const emptyEl = document.getElementById('empty');
const filterEl = document.getElementById('user-filter');
const myName = (storageGet(USER_NAME_KEY) || '').trim();
let allScores = [];
let ranking = null;

// データを読み込む（ランキング名・参加者一覧と、全スコア）
async function load() {
  try {
    const [summary, scores] = await Promise.all([
      api('GET', `/api/rankings/${rankingId}/summary`),
      api('GET', `/api/rankings/${rankingId}/scores`),
    ]);
    ranking = summary.ranking;
    document.getElementById('ranking-name').textContent = summary.ranking.name;
    document.title = `入力履歴 - ${summary.ranking.name} | ポーカー部`;
    allScores = scores;
    renderFilter(summary.rows.map((r) => r.user_name));
    render();
  } catch (e) {
    showMessage(e.message, true);
  }
}

// 絞り込みの選択肢（自分を先頭に、残りは名前順）
function renderFilter(names) {
  const current = filterEl.value;
  const others = names.filter((n) => n !== myName).sort((a, b) => a.localeCompare(b, 'ja'));
  const options = [el('option', { value: '' }, '全員')];
  if (myName) options.push(el('option', { value: myName }, `自分（${myName}）`));
  others.forEach((n) => options.push(el('option', { value: n }, n)));
  filterEl.replaceChildren(...options);
  // 選択中の人がまだ一覧にいれば選択を保つ
  if ([...filterEl.options].some((o) => o.value === current)) filterEl.value = current;
}
filterEl.addEventListener('change', render);

// 一覧を描画する
function render() {
  const target = filterEl.value;
  const rows = target ? allScores.filter((s) => s.user_name === target) : allScores;
  listEl.replaceChildren(...rows.map(renderRow));
  emptyEl.hidden = rows.length > 0;
}

// 1行分（表示モード）
function renderRow(score) {
  // 自分の行で、確定前のランキングだけ編集・削除できる
  const isMine = myName !== '' && score.user_name === myName && ranking.status !== 'closed';
  return el('li', { class: 'card history-item' },
    el('div', { class: 'history-main' },
      el('div', null,
        el('div', { class: 'history-date' }, formatDay(score.played_on)),
        el('div', { class: 'history-user' }, score.user_name)
      ),
      el('div', { class: `history-amount ${amountClass(score.amount)}` }, formatAmount(score.amount))
    ),
    isMine
      ? el('div', { class: 'history-actions' },
          el('button', { type: 'button', class: 'btn btn-small', onclick: (e) => startEdit(e.target.closest('li'), score) }, '編集'),
          el('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: () => deleteScore(score) }, '削除')
        )
      : null
  );
}

// 編集モードに切り替える（Score と日付を変更できる）
function startEdit(item, score) {
  let sign = score.amount < 0 ? -1 : 1;
  const plusBtn = el('button', { type: 'button', class: 'sign-btn', 'data-sign': '1' }, '＋');
  const minusBtn = el('button', { type: 'button', class: 'sign-btn', 'data-sign': '-1' }, '−');
  const setSign = (value) => {
    sign = value;
    plusBtn.classList.toggle('active', value === 1);
    minusBtn.classList.toggle('active', value === -1);
  };
  plusBtn.addEventListener('click', () => setSign(1));
  minusBtn.addEventListener('click', () => setSign(-1));
  setSign(sign);

  const amountInput = el('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', 'aria-label': 'Score' });
  amountInput.value = String(Math.abs(score.amount));
  keepDigitsOnly(amountInput);
  const dateInput = el('input', { type: 'date', 'aria-label': '日付' });
  dateInput.value = score.played_on;
  const weekdayLabel = el('span', { class: 'weekday' });
  if (ranking.date_min) {
    dateInput.min = ranking.date_min;
    dateInput.max = ranking.date_max;
  }

  const form = el('form', { class: 'form-row', novalidate: '' },
    el('div', { class: 'history-user' }, score.user_name),
    el('div', { class: 'amount-row' }, el('div', { class: 'sign-toggle' }, plusBtn, minusBtn), amountInput),
    el('div', { class: 'date-row' }, dateInput, weekdayLabel),
    el('div', { class: 'history-actions' },
      el('button', { type: 'button', class: 'btn btn-small', onclick: render }, 'キャンセル'),
      el('button', { type: 'submit', class: 'btn btn-small btn-primary' }, '保存')
    )
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (amountInput.value === '') {
      showMessage('Scoreを入力してください', true);
      return;
    }
    try {
      await api('PUT', `/api/scores/${score.id}`, { amount: sign * Number(amountInput.value), played_on: dateInput.value });
      showMessage('保存しました');
      load();
    } catch (e) {
      showMessage(e.message, true);
    }
  });
  attachWeekday(dateInput, weekdayLabel);
  item.replaceChildren(form);
  amountInput.focus();
}

// 削除（確認ダイアログを挟む）
async function deleteScore(score) {
  if (!confirm(`${formatDay(score.played_on)} の ${formatAmount(score.amount)} を削除しますか？`)) return;
  try {
    await api('DELETE', `/api/scores/${score.id}`);
    showMessage('削除しました');
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
}

load();
