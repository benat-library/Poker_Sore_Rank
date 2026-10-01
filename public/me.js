// マイページ：全月間リングを通した通算成績

const filterEl = document.getElementById('user-filter');

// 表示できる人の一覧（管理者モード用）を読み込み、初期表示は自分にする
async function load() {
  try {
    const players = await api('GET', '/api/stats/players');
    const current = filterEl.value || me.id;
    const options = [el('option', { value: me.id }, `自分（${me.name}）`)];
    players.filter((p) => p.player_key !== me.id).forEach((p) => options.push(el('option', { value: p.player_key }, p.name)));
    filterEl.replaceChildren(...options);
    if ([...filterEl.options].some((o) => o.value === current)) filterEl.value = current;
    loadStats();
    loadClaims();
  } catch (e) {
    showMessage(e.message, true);
  }
}
filterEl.addEventListener('change', loadStats);
// 管理者モードをオフにしたら自分の成績に戻す
document.addEventListener('adminmodechange', () => {
  if (!isAdminMode() && filterEl.value !== me.id) {
    filterEl.value = me.id;
    loadStats();
  }
});

// 選んだ人の成績を読み込んで表示する
async function loadStats() {
  const target = filterEl.value || me.id;
  const noData = document.getElementById('no-data');
  const stats = document.getElementById('stats');
  try {
    const data = await api('GET', `/api/stats/player?player=${encodeURIComponent(target)}`);
    document.getElementById('player-name').textContent = data.name;
    if (data.games.count === 0) {
      stats.hidden = true;
      noData.hidden = false;
      noData.textContent = 'まだ月間リングの記録がありません';
      return;
    }
    noData.hidden = true;
    stats.hidden = false;
    renderStats(data);
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ひも付いていない過去の記録の一覧（管理者モード用。ひも付け先の部員を選ぶ）
async function loadClaims() {
  try {
    const [names, users] = await Promise.all([api('GET', '/api/stats/unclaimed'), api('GET', '/api/stats/users')]);
    document.getElementById('claim-section').hidden = names.length === 0;
    document.getElementById('claim-list').replaceChildren(...names.map((n) => {
      const select = el('select', { 'aria-label': `${n.name} のひも付け先` },
        el('option', { value: '' }, 'ひも付け先を選ぶ'),
        ...users.map((u) => el('option', { value: u.discord_id }, u.username)));
      return el('li', { class: 'card history-item' },
        el('div', null,
          el('div', { class: 'history-user' }, n.name),
          el('div', { class: 'history-date' }, `${n.count}件 ・ ${formatDay(n.first_day)} 〜 ${formatDay(n.last_day)}`)
        ),
        el('div', { class: 'claim-row' },
          select,
          el('button', { type: 'button', class: 'btn btn-small', onclick: () => claim(n, select) }, 'ひも付け')
        )
      );
    }));
  } catch (e) {
    showMessage(e.message, true);
  }
}

async function claim(n, select) {
  if (!select.value) {
    showMessage('ひも付け先の部員を選んでください', true);
    return;
  }
  const ownerName = select.selectedOptions[0].textContent;
  if (!confirm(`「${n.name}」の記録 ${n.count}件を、${ownerName} さんの記録にしますか？`)) return;
  try {
    const result = await api('POST', '/api/stats/claim', { name: n.name, discord_id: select.value });
    showMessage(`${result.count}件を ${result.owner} さんの記録にしました`);
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
}

// 数値を表示する（main：大きく表示、sub：補足）
function setStat(id, main, sub, cls) {
  const node = document.getElementById(id);
  node.textContent = main;
  node.className = `stat-value ${cls || ''}`;
  document.getElementById(`${id}-sub`).textContent = sub || '';
}

// 割合（%）。分母が0なら「-」
function percent(part, whole) {
  return whole ? `${Math.round((part / whole) * 100)}%` : '-';
}

// 平均（小数1桁）。値がなければ「-」
function avg(value, unit) {
  return value === null || value === undefined ? '-' : `${value.toFixed(1)}${unit}`;
}

function renderStats(data) {
  const g = data.games;
  setStat('game-count', `${g.count}戦`);
  setStat('game-firsts', `${g.firsts}回`, `1位率 ${percent(g.firsts, g.count)}`);
  setStat('game-avg-rank', avg(g.avg_rank, '位'));
  setStat('game-avg-players', avg(g.avg_players, '人'));
  setStat('game-total', formatAmount(g.total), '', amountClass(g.total));
  setStat('game-winrate', percent(g.wins, g.count), `${g.wins}勝 ${g.losses}敗${g.count - g.wins - g.losses ? ` ${g.count - g.wins - g.losses}分` : ''}`);

  const r = data.rings;
  setStat('ring-count', `${r.count}回`);
  setStat('ring-firsts', `${r.firsts}回`, `1位率 ${percent(r.firsts, r.count)}`);
  setStat('ring-avg-rank', avg(r.avg_rank, '位'));
  setStat('ring-avg-players', avg(r.avg_players, '人'));

  // 月間リングごとの順位（確定前のものは暫定）
  document.getElementById('ring-list').replaceChildren(...data.ring_list.map((ring) =>
    el('li', { class: 'card list-item' },
      el('a', { class: 'list-link ring-row', href: `/ranking/${ring.id}` },
        el('div', null,
          el('div', { class: 'list-title' }, statusBadge(ring), ring.name),
          el('div', { class: 'list-meta' }, `${ring.status === 'closed' ? '' : '暫定 '}${ring.rank}位 / ${ring.players}人 ・ ${ring.days}戦`)
        ),
        el('div', { class: `history-amount ${amountClass(ring.total)}` }, formatAmount(ring.total))
      )
    )
  ));
}

load();
