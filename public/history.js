// 入力履歴画面：全員の入力を表示し、人で絞り込む。自分の行だけ編集・削除できる（編集モードでは全員分）

const rankingId = currentRankingId();
const listEl = document.getElementById('history-list');
const emptyEl = document.getElementById('empty');
const filterEl = document.getElementById('user-filter');
const dayTabsEl = document.getElementById('day-tabs');
let allScores = [];
let selectedDay = null; // 日付のタブで選んでいる日
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
    renderFilter(summary.rows);
    render();
  } catch (e) {
    showMessage(e.message, true);
  }
}

// 絞り込みの選択肢（自分を先頭に、残りは名前順）
function renderFilter(players) {
  const current = filterEl.value;
  const others = players.filter((p) => p.player_key !== me.id).sort((a, b) => a.user_name.localeCompare(b.user_name, 'ja'));
  const options = [el('option', { value: '' }, '全員'), el('option', { value: me.id }, `自分（${me.name}）`)];
  others.forEach((p) => options.push(el('option', { value: p.player_key }, p.user_name)));
  filterEl.replaceChildren(...options);
  // 選択中の人がまだ一覧にいれば選択を保つ
  if ([...filterEl.options].some((o) => o.value === current)) filterEl.value = current;
}
filterEl.addEventListener('change', render);
// 編集モードを切り替えたら、編集・削除ボタンの表示を変える
document.addEventListener('adminmodechange', () => { if (ranking) render(); });

// 一覧を描画する
// 全員分を表示していて記録が複数日あるときは、日付のタブで1日ずつ表示する（人で絞り込んだときは全日分）
// 月間リングを全員分表示しているときは、日ごとに区切って全員の合計を出す（ゼロサムなので本来は 0 になる）
function render() {
  const target = filterEl.value;
  let rows = target ? allScores.filter((s) => s.player_key === target) : allScores;
  const days = [...new Set(rows.map((s) => s.played_on))];
  const paged = !target && days.length > 1;
  if (paged) {
    // 選んでいた日が無くなっていたら（削除・日付の変更など）、いちばん新しい日にする
    if (!days.includes(selectedDay)) selectedDay = days[0];
    rows = rows.filter((s) => s.played_on === selectedDay);
  }
  renderDayTabs(paged ? days : []);
  const items = [];
  rows.forEach((score, i) => {
    if (!target && ranking.kind === 'monthly' && (i === 0 || rows[i - 1].played_on !== score.played_on)) {
      items.push(renderDayHeader(score.played_on, rows.filter((r) => r.played_on === score.played_on)));
    }
    items.push(renderRow(score));
  });
  listEl.replaceChildren(...items);
  emptyEl.hidden = rows.length > 0;
}

// 日付のタブ（例：9/30（火））。days が空ならタブを隠す
function renderDayTabs(days) {
  dayTabsEl.hidden = days.length === 0;
  dayTabsEl.replaceChildren(...days.map((date) => {
    const [, m, d] = date.split('-').map(Number);
    const active = date === selectedDay;
    return el('button', {
      type: 'button',
      class: active ? 'pager-btn active' : 'pager-btn',
      'aria-current': active ? 'page' : 'false',
      onclick: () => {
        selectedDay = date;
        render();
      },
    }, `${m}/${d}（${weekdayOf(date)}）`);
  }));
}

// 日ごとの見出し（人数と全員の合計）
function renderDayHeader(date, dayRows) {
  const total = dayRows.reduce((sum, r) => sum + r.amount, 0);
  return el('li', { class: 'day-header' },
    el('div', { class: 'day-header-main' },
      el('span', { class: 'day-header-date' }, formatDay(date)),
      el('span', null, `${dayRows.length}人 ・ 合計 `, el('strong', { class: total === 0 ? '' : 'minus' }, formatAmount(total)))
    ),
    total === 0 ? null : el('div', { class: 'day-header-warning' }, '⚠ 合計が0になっていません。入力漏れや入力ミスがないか確認してください')
  );
}

// 1行分（表示モード）
function renderRow(score) {
  // 自分の行（編集モードでは全員の行）で、確定前のランキングだけ編集・削除できる
  const isMine = (score.player_key === me.id || isAdminMode()) && ranking.status !== 'closed';
  return el('li', { class: 'card history-item' },
    el('div', { class: 'history-main' },
      el('div', null,
        el('div', { class: 'history-date' }, formatDay(score.played_on)),
        el('div', { class: 'history-user' }, score.user_name),
        score.final_chips !== null && score.final_chips !== undefined
          ? el('div', { class: 'history-date' }, `最終 ${score.final_chips}チップ${score.rebuys ? ` ・ Rebuy ${score.rebuys}回` : ''}`)
          : null
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

// 最終チップ数とRebuy回数が記録されていないデータ（過去の取り込み分）は、Scoreから推定して編集欄に入れる
function guessChips(score, rule) {
  if (score.final_chips !== null && score.final_chips !== undefined) {
    return { finalChips: score.final_chips, rebuys: score.rebuys || 0 };
  }
  const rebuys = score.amount >= -rule.start ? 0 : Math.ceil((-rule.start - score.amount) / rule.rebuy);
  return { finalChips: score.amount + rule.start + rule.rebuy * rebuys, rebuys };
}

// 編集モードに切り替える（月間リングは最終チップ数・Rebuy回数、イベントはScore。どちらも日付を変更できる）
function startEdit(item, score) {
  const rule = ranking.chips;
  const dateInput = el('input', { type: 'date', 'aria-label': '日付' });
  dateInput.value = score.played_on;
  const weekdayLabel = el('span', { class: 'weekday' });
  if (ranking.date_min) {
    dateInput.min = ranking.date_min;
    dateInput.max = ranking.date_max;
  }

  let fields;
  let readValues;
  if (rule) {
    const guess = guessChips(score, rule);
    const chipsInput = el('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', 'aria-label': '最終チップ数' });
    chipsInput.value = String(guess.finalChips);
    keepDigitsOnly(chipsInput);
    const rebuysInput = el('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', 'aria-label': 'Rebuy回数' });
    rebuysInput.value = String(guess.rebuys);
    keepDigitsOnly(rebuysInput);
    const preview = el('strong');
    const updatePreview = () => {
      if (chipsInput.value === '') {
        preview.textContent = '-';
        preview.className = '';
        return;
      }
      const value = scoreFromChips(rule, Number(chipsInput.value), Number(rebuysInput.value || 0));
      preview.textContent = formatAmount(value);
      preview.className = amountClass(value);
    };
    chipsInput.addEventListener('input', updatePreview);
    rebuysInput.addEventListener('input', updatePreview);
    updatePreview();
    fields = [
      el('label', null, '最終チップ数', chipsInput),
      el('label', null, 'Rebuy回数（しなかった場合は0）', rebuysInput),
      el('div', { class: 'score-preview' }, 'Score ', preview),
    ];
    readValues = () => (chipsInput.value === ''
      ? null
      : { final_chips: Number(chipsInput.value), rebuys: Number(rebuysInput.value || 0) });
  } else {
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
    fields = [el('div', { class: 'amount-row' }, el('div', { class: 'sign-toggle' }, plusBtn, minusBtn), amountInput)];
    readValues = () => (amountInput.value === '' ? null : { amount: sign * Number(amountInput.value) });
  }

  const form = el('form', { class: 'form-row', novalidate: '' },
    el('div', { class: 'history-user' }, score.user_name),
    ...fields,
    el('div', { class: 'date-row' }, dateInput, weekdayLabel),
    el('div', { class: 'history-actions' },
      el('button', { type: 'button', class: 'btn btn-small', onclick: render }, 'キャンセル'),
      el('button', { type: 'submit', class: 'btn btn-small btn-primary' }, '保存')
    )
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = readValues();
    if (!values) {
      showMessage(rule ? '最終チップ数を入力してください' : 'Scoreを入力してください', true);
      return;
    }
    try {
      await api('PUT', `/api/scores/${score.id}`, { ...values, played_on: dateInput.value });
      showMessage('保存しました');
      load();
    } catch (e) {
      showMessage(e.message, true);
    }
  });
  attachWeekday(dateInput, weekdayLabel);
  item.replaceChildren(form);
  form.querySelector('input').focus();
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
