// ランキング詳細画面：順位表・推移グラフの表示とスコア入力

const rankingId = currentRankingId();
const form = document.getElementById('score-form');
const amountInput = document.getElementById('amount');
const playedOnInput = document.getElementById('played-on');
const signButtons = document.querySelectorAll('.sign-btn');
const updateWeekday = attachWeekday(playedOnInput, document.getElementById('played-on-weekday'));
const finalChipsInput = document.getElementById('final-chips');
const rebuyCheck = document.getElementById('rebuy-check');
const rebuysInput = document.getElementById('rebuys');
let sign = 1;
let rankingName = '';
// 月間リングのチップのルール（{ start, rebuy }）。イベントは null
let chipRule = null;

// 順位表・グラフ・入力欄を読み込んで描画する
let chartData = null;
let coloredNames = [];
let highlighted = null;

async function loadSummary() {
  try {
    const [data, scores] = await Promise.all([
      api('GET', `/api/rankings/${rankingId}/summary`),
      api('GET', `/api/rankings/${rankingId}/scores`),
    ]);
    const ranking = data.ranking;
    rankingName = ranking.name;
    document.getElementById('ranking-name').textContent = ranking.name;
    document.getElementById('ranking-badge').replaceChildren(statusBadge(ranking));
    document.title = `${ranking.name} | ポーカー部`;
    renderNotice(ranking);
    setupInput(ranking);

    // 合計が同じ人は同順位にする（例：1位, 2位, 2位, 4位）。名前をタップするとグラフで強調する
    let rank = 0;
    const rows = data.rows.map((row, i) => {
      if (i === 0 || row.total !== data.rows[i - 1].total) rank = i + 1;
      return el('tr', null,
        el('td', { class: 'col-rank' }, rank),
        el('td', { class: 'col-name' },
          el('button', { type: 'button', class: 'name-btn', onclick: () => toggleHighlight(row.player_key) }, row.user_name)),
        el('td', { class: `col-num ${amountClass(row.total)}` }, formatAmount(row.total)),
        el('td', { class: 'col-num' }, row.days)
      );
    });
    document.getElementById('standings-body').replaceChildren(...rows);
    document.getElementById('empty').hidden = rows.length > 0;

    // グラフ：上位5人と自分を色付きにする（自分は常に1色目）
    const keys = data.rows.map((r) => r.player_key);
    const mine = keys.includes(me.id);
    coloredNames = [...(mine ? [me.id] : []), ...keys.filter((k) => k !== me.id).slice(0, mine ? 5 : 6)];
    chartData = buildCumulativeSeries(scores);
    if (highlighted && !keys.includes(highlighted)) highlighted = null;
    drawChart();
  } catch (e) {
    document.getElementById('ranking-name').textContent = '';
    showMessage(e.message, true);
  }
}

// グラフを描く（記録が1日分だけのときは案内を出す）
function drawChart() {
  const section = document.getElementById('chart-section');
  section.hidden = !chartData || chartData.dates.length === 0;
  if (section.hidden) return;
  const enough = chartData.dates.length >= 2;
  document.getElementById('chart-wait').hidden = enough;
  document.getElementById('chart-help').hidden = !enough;
  renderCumulativeChart(document.getElementById('chart'), document.getElementById('chart-legend'), chartData, coloredNames, highlighted);
}

function toggleHighlight(name) {
  highlighted = highlighted === name ? null : name;
  drawChart();
}

// 画面幅が変わったらグラフを描き直す
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawChart, 150);
});

// 月間リングの注意事項
function renderNotice(ranking) {
  const notice = document.getElementById('notice');
  if (ranking.kind !== 'monthly') {
    notice.hidden = true;
    return;
  }
  const [y, m] = ranking.period.split('-').map(Number);
  notice.replaceChildren(
    el('p', null, `入力できるのは${y}年${m}月の日付だけです。`),
    el('p', null, `月末（${monthDay(ranking.date_max)}）で締め、${monthDay(ranking.grace_end)}までは入力・修正できます。それ以降は確定となり、変更できません。`)
  );
  notice.hidden = false;
}

// 入力欄の設定（確定済みなら隠す。月間リングは日付をその月に制限する）
function setupInput(ranking) {
  const closed = ranking.status === 'closed';
  document.getElementById('input-section').hidden = closed;
  document.getElementById('closed-note').hidden = !closed;
  if (closed) return;

  // 月間リングは最終チップ数とRebuy、イベントはScoreを直接入力する
  chipRule = ranking.chips;
  document.getElementById('chip-fields').hidden = !chipRule;
  document.getElementById('score-fields').hidden = !!chipRule;
  updatePreview();

  if (ranking.date_min) {
    playedOnInput.min = ranking.date_min;
    playedOnInput.max = ranking.date_max;
  }
  // 日付が未入力か範囲外なら、今日（その月を過ぎていれば月末）にする
  const value = playedOnInput.value;
  if (!value || (ranking.date_min && (value < ranking.date_min || value > ranking.date_max))) {
    const today = todayString();
    playedOnInput.value = ranking.date_max && today > ranking.date_max ? ranking.date_max
      : ranking.date_min && today < ranking.date_min ? ranking.date_min
      : today;
  }
  updateWeekday();
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

// 入力者はログイン中の本人
document.getElementById('input-user-name').textContent = me.name;

keepDigitsOnly(amountInput);


// ---- 月間リングの入力（最終チップ数とRebuy） ----

keepDigitsOnly(finalChipsInput);
keepDigitsOnly(rebuysInput);

// Rebuyにチェックを入れたときだけ回数を入力できる
rebuyCheck.addEventListener('change', () => {
  document.getElementById('rebuy-row').hidden = !rebuyCheck.checked;
  document.getElementById('rebuy-note').hidden = !rebuyCheck.checked;
  updatePreview();
});
function setRebuys(n) {
  rebuysInput.value = String(Math.min(Math.max(n, 1), 50));
  updatePreview();
}
document.getElementById('rebuy-minus').addEventListener('click', () => setRebuys(Number(rebuysInput.value || 1) - 1));
document.getElementById('rebuy-plus').addEventListener('click', () => setRebuys(Number(rebuysInput.value || 0) + 1));
finalChipsInput.addEventListener('input', updatePreview);
rebuysInput.addEventListener('input', updatePreview);

// 入力中の内容から計算したScoreを表示する
function currentRebuys() {
  return rebuyCheck.checked ? Number(rebuysInput.value || 0) : 0;
}
function updatePreview() {
  const preview = document.getElementById('score-preview');
  const formula = document.getElementById('score-formula');
  if (!chipRule || finalChipsInput.value === '') {
    preview.textContent = '-';
    preview.className = '';
    formula.textContent = '';
    return;
  }
  const finalChips = Number(finalChipsInput.value);
  const rebuys = currentRebuys();
  const score = scoreFromChips(chipRule, finalChips, rebuys);
  preview.textContent = formatAmount(score);
  preview.className = amountClass(score);
  formula.textContent = chipFormula(chipRule, finalChips, rebuys);
}

function resetChipFields() {
  finalChipsInput.value = '';
  rebuyCheck.checked = false;
  rebuysInput.value = '1';
  document.getElementById('rebuy-row').hidden = true;
  document.getElementById('rebuy-note').hidden = true;
  updatePreview();
}

// 送信（最終的な検証はサーバー側で行う）
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = chipRule ? finalChipsInput : amountInput;
  if (input.value === '') {
    showMessage(chipRule ? '最終チップ数を入力してください' : 'Scoreを入力してください', true);
    input.focus();
    return;
  }
  const body = { played_on: playedOnInput.value };
  if (chipRule) {
    body.final_chips = Number(finalChipsInput.value);
    body.rebuys = currentRebuys();
  } else {
    body.amount = sign * Number(amountInput.value);
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('POST', `/api/rankings/${rankingId}/scores`, body);
    showMessage(`${formatAmount(result.amount)} ${result.overwritten ? 'で上書き' : 'を登録'}しました`);
    amountInput.value = '';
    setSign(1);
    resetChipFields();
    loadSummary();
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    button.disabled = false;
  }
});

// CSVダウンロード
document.getElementById('export-csv').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await downloadFile(`/ranking/${rankingId}/export`, `${safeFilename(rankingName)}_${todayString()}.csv`);
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    button.disabled = false;
  }
});

loadSummary();
