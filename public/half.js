// 半期ランキング画面：順位表の表示と半期の切り替え

const termFilter = document.getElementById('term-filter');

// 表示する半期は URL の ?term= で決める（共有やブラウザの戻るに対応するため）
async function load() {
  const term = new URLSearchParams(location.search).get('term');
  try {
    const data = await api('GET', term ? `/api/stats/half?term=${encodeURIComponent(term)}` : '/api/stats/half');
    document.getElementById('half-title').textContent = data.title;
    document.getElementById('half-badge').replaceChildren(halfBadge(data.closed));
    document.getElementById('half-provisional').hidden = data.closed;
    document.title = `半期ランキング ${data.title} | ポーカー部`;

    termFilter.replaceChildren(...data.terms.map((t) => el('option', { value: t.term }, t.title)));
    termFilter.value = data.term;

    // 合計が同じ人は同順位にする（例：1位, 2位, 2位, 4位）
    let rank = 0;
    const rows = data.rows.map((row, i) => {
      if (i === 0 || row.total !== data.rows[i - 1].total) rank = i + 1;
      return el('tr', { class: row.player_key === me.id ? 'mine' : '' },
        el('td', { class: 'col-rank' }, el('span', { class: rank <= 3 ? `rank-chip rank-${rank}` : 'rank-chip' }, rank)),
        el('td', { class: 'col-name' }, row.user_name),
        el('td', { class: `col-num ${amountClass(row.total)}` }, formatAmount(row.total)),
        el('td', { class: 'col-num' }, row.days)
      );
    });
    document.getElementById('standings-body').replaceChildren(...rows);
    document.getElementById('empty').hidden = rows.length > 0;
  } catch (e) {
    document.getElementById('half-title').textContent = '';
    showMessage(e.message, true);
  }
}

// 確定・暫定のラベル
function halfBadge(closed) {
  return closed ? el('span', { class: 'badge badge-closed' }, '確定') : el('span', { class: 'badge badge-grace' }, '暫定');
}

termFilter.addEventListener('change', () => {
  history.pushState(null, '', `/half?term=${encodeURIComponent(termFilter.value)}`);
  load();
});
window.addEventListener('popstate', load);

load();
