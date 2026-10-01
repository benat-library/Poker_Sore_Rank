// ホーム画面：ランキング一覧の表示・作成・削除

const listEl = document.getElementById('ranking-list');
const emptyEl = document.getElementById('empty');
const deleteModeBtn = document.getElementById('delete-mode');

// 削除ボタンは誤タップ防止のため、削除モードのときだけ表示する
deleteModeBtn.addEventListener('click', () => {
  const on = !document.body.classList.contains('delete-mode');
  document.body.classList.toggle('delete-mode', on);
  deleteModeBtn.setAttribute('aria-pressed', String(on));
  deleteModeBtn.textContent = on ? '削除モード終了' : '削除モード';
});

// 一覧を読み込んで描画する
async function loadRankings() {
  try {
    const rankings = await api('GET', '/api/rankings');
    listEl.replaceChildren(...rankings.map(renderRanking));
    emptyEl.hidden = rankings.length > 0;
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ランキング1件分の行
function renderRanking(r) {
  return el('li', { class: 'card list-item' },
    el('a', { class: 'list-link', href: `/ranking/${r.id}` },
      el('div', { class: 'list-title' }, r.name),
      el('div', { class: 'list-meta' }, `作成日 ${formatDate(r.created_at)} ・ 参加 ${r.participants}人`)
    ),
    el('button', { type: 'button', class: 'btn btn-danger btn-small delete-btn', onclick: () => deleteRanking(r) }, '削除')
  );
}

// 削除（確認ダイアログを挟む）
async function deleteRanking(r) {
  if (!confirm(`「${r.name}」を削除しますか？\n入力されたスコアもすべて削除され、元に戻せません。`)) return;
  try {
    await api('DELETE', `/api/rankings/${r.id}`);
    showMessage('削除しました');
    loadRankings();
  } catch (e) {
    showMessage(e.message, true);
  }
}

// 作成
document.getElementById('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('ranking-name');
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {
    await api('POST', '/api/rankings', { name: input.value });
    input.value = '';
    showMessage('作成しました');
    loadRankings();
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    button.disabled = false;
  }
});

startPage(loadRankings);
