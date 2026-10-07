// 管理者ページ：管理者の一覧、リング・大会の作成と削除、過去の記録のひも付け、削除したものの復元、操作履歴

// ---- 管理者の一覧 ----

async function loadAdmins() {
  try {
    const admins = await api('GET', '/api/admin/admins');
    document.getElementById('admin-list').replaceChildren(...admins.map((a) =>
      el('li', null, el('strong', null, a.username), el('span', { class: 'note' }, ` 最終ログイン ${formatDate(a.last_login_at)}`))));
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ---- 月間リング・イベントの作成 ----

const periodInput = document.getElementById('ranking-period');
const nameInput = document.getElementById('ranking-name');
let kind = 'monthly';

// 種類の切り替え（月間リングは年月、イベントは名前を入力する）
document.querySelectorAll('.segment').forEach((btn) => {
  btn.addEventListener('click', () => {
    kind = btn.dataset.kind;
    document.querySelectorAll('.segment').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    document.getElementById('period-field').hidden = kind !== 'monthly';
    document.getElementById('name-field').hidden = kind !== 'event';
    document.getElementById('held-on-field').hidden = kind !== 'event';
    document.getElementById('capacity-field').hidden = kind !== 'event';
    document.getElementById('event-note').hidden = kind !== 'event';
  });
});
periodInput.value = todayString().slice(0, 7);
keepDigitsOnly(document.getElementById('ranking-capacity'));

document.getElementById('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const heldOnInput = document.getElementById('ranking-held-on');
    const capacityInput = document.getElementById('ranking-capacity');
    const body = kind === 'monthly'
      ? { kind, period: periodInput.value }
      : { kind, name: nameInput.value, held_on: heldOnInput.value, capacity: capacityInput.value };
    const created = await api('POST', '/api/rankings', body);
    nameInput.value = '';
    heldOnInput.value = '';
    capacityInput.value = '';
    showMessage(`「${created.name}」を作成しました`);
    loadRankings();
    loadLogs(1);
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    button.disabled = false;
  }
});

// ---- トーナメントの作成 ----

keepDigitsOnly(document.getElementById('tournament-capacity'));
document.getElementById('tournament-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const nameEl = document.getElementById('tournament-name');
  const dateEl = document.getElementById('tournament-date');
  const capacityEl = document.getElementById('tournament-capacity');
  button.disabled = true;
  try {
    const created = await api('POST', '/api/tournaments', { name: nameEl.value, held_on: dateEl.value, capacity: capacityEl.value });
    nameEl.value = '';
    dateEl.value = '';
    capacityEl.value = '';
    showMessage(`「${created.name}」を作成しました`);
    loadTournaments();
    loadLogs(1);
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    button.disabled = false;
  }
});

// ---- 月間リング・イベントの削除 ----

const rankingList = document.getElementById('ranking-list');

async function loadRankings() {
  try {
    const rankings = await api('GET', '/api/rankings');
    renderPaged(rankingList, rankings, renderRanking);
    document.getElementById('ranking-empty').hidden = rankings.length > 0;
  } catch (e) {
    showMessage(e.message, true);
  }
}

function renderRanking(r) {
  return el('li', { class: 'card list-item' },
    el('a', { class: 'list-link', href: `/ranking/${r.id}` },
      el('div', { class: 'list-title' }, statusBadge(r), r.name),
      el('div', { class: 'list-meta' }, `作成日 ${formatDate(r.created_at)} ・ 参加 ${r.participants}人`)
    ),
    el('button', { type: 'button', class: 'btn btn-danger btn-small', onclick: () => deleteRanking(r) }, '削除')
  );
}

async function deleteRanking(r) {
  if (!confirm(`「${r.name}」を削除しますか？\n入力されたスコアも一緒に画面から消えます（「削除したものを戻す」から元に戻せます）。`)) return;
  try {
    await api('DELETE', `/api/rankings/${r.id}`);
    showMessage('削除しました');
    loadRankings();
    loadDeleted();
    loadLogs(1);
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ---- トーナメントの削除 ----

const tournamentList = document.getElementById('tournament-list');
const TOURNAMENT_STATUS = { entry: ['受付中', 'badge-open'], running: ['開催中', 'badge-grace'], finished: ['終了', 'badge-closed'] };

async function loadTournaments() {
  try {
    const list = await api('GET', '/api/tournaments');
    renderPaged(tournamentList, list, renderTournament);
    document.getElementById('tournament-empty').hidden = list.length > 0;
  } catch (e) {
    showMessage(e.message, true);
  }
}

function renderTournament(t) {
  const [label, cls] = TOURNAMENT_STATUS[t.status];
  const entries = t.capacity ? `参加 ${t.entries} / ${t.capacity}人` : `参加 ${t.entries}人`;
  return el('li', { class: 'card list-item' },
    el('a', { class: 'list-link', href: `/tournament/${t.id}` },
      el('div', { class: 'list-title' }, el('span', { class: `badge ${cls}` }, label), t.name),
      el('div', { class: 'list-meta' }, `${t.held_on ? `開催日 ${formatDay(t.held_on)}` : '開催日 未定'} ・ ${entries}`)
    ),
    el('button', { type: 'button', class: 'btn btn-danger btn-small', onclick: () => deleteTournament(t) }, '削除')
  );
}

async function deleteTournament(t) {
  if (!confirm(`大会「${t.name}」を削除しますか？
参加者と対戦結果も一緒に画面から消えます（「削除したものを戻す」から元に戻せます）。`)) return;
  try {
    await api('DELETE', `/api/tournaments/${t.id}`);
    showMessage('削除しました');
    loadTournaments();
    loadDeleted();
    loadLogs(1);
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ---- 過去の記録のひも付け ----

async function loadClaims() {
  try {
    const [links, users] = await Promise.all([api('GET', '/api/stats/links'), api('GET', '/api/stats/users')]);
    document.getElementById('claim-empty').hidden = links.length > 0;
    // 10件ずつのページ切り替え（ひも付けを変えて読み直しても、同じページのまま）
    renderPaged(document.getElementById('claim-list'), links, (link) => {
      const select = el('select', { 'aria-label': `${link.name} のひも付け先` },
        el('option', { value: '' }, '未ひも付け'),
        ...users.map((u) => el('option', { value: u.discord_id }, u.username)));
      select.value = link.discord_id || '';
      return el('li', { class: 'card history-item' },
        el('div', null,
          el('div', { class: 'history-user' }, link.name),
          el('div', { class: 'history-date' },
            `${link.count}件 ・ ${formatDay(link.first_day)} 〜 ${formatDay(link.last_day)} ・ 現在：${link.owner || '未ひも付け'}`)
        ),
        el('div', { class: 'claim-row' },
          select,
          el('button', { type: 'button', class: 'btn btn-small', onclick: () => changeLink(link, select) }, '変更')
        )
      );
    });
  } catch (e) {
    showMessage(e.message, true);
  }
}

async function changeLink(link, select) {
  const next = select.value || null;
  if (next === (link.discord_id || null)) {
    showMessage('ひも付け先が変わっていません', true);
    return;
  }
  const nextName = next ? `${select.selectedOptions[0].textContent} さん` : '未ひも付け';
  if (!confirm(`「${link.name}」の記録 ${link.count}件のひも付け先を、${link.owner || '未ひも付け'} → ${nextName} に変更しますか？`)) return;
  try {
    const result = await api('POST', '/api/stats/link', { name: link.name, discord_id: next });
    showMessage(result.owner ? `${result.count}件を ${result.owner} さんの記録にしました` : `${result.count}件のひも付けを解除しました`);
    loadClaims();
    loadLogs(1);
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ---- 削除したものを戻す ----

async function loadDeleted() {
  try {
    const data = await api('GET', '/api/admin/deleted');
    fillDeleted('deleted-rankings', data.rankings, (r) => ({
      title: r.name,
      meta: `記録 ${r.score_count}件`,
      deleted: r,
      type: 'ranking',
      confirmText: `「${r.name}」を元に戻しますか？`,
    }));
    fillDeleted('deleted-scores', data.scores, (s) => ({
      title: `${s.user_name}　${formatAmount(s.amount)}`,
      meta: `${s.ranking_name} ・ ${formatDay(s.played_on)}`,
      deleted: s,
      type: 'score',
      confirmText: `${s.ranking_name} の ${s.user_name} さんの ${monthDay(s.played_on)}の記録（${formatAmount(s.amount)}）を元に戻しますか？`,
    }));
    fillDeleted('deleted-tournaments', data.tournaments, (t) => ({
      title: t.name,
      meta: t.held_on ? `開催日 ${formatDay(t.held_on)}` : '開催日 未定',
      deleted: t,
      type: 'tournament',
      confirmText: `大会「${t.name}」を元に戻しますか？`,
    }));
  } catch (e) {
    showMessage(e.message, true);
  }
}

// 削除したものの一覧を描く（toItem で、表示する文と戻すときの情報を作る）
function fillDeleted(listId, items, toItem) {
  const list = document.getElementById(listId);
  if (items.length === 0) {
    list.replaceChildren(el('li', { class: 'muted' }, '削除したものはありません'));
    // 前に出していたページ切り替えが残らないようにする
    const pager = list.nextElementSibling;
    if (pager && pager.classList.contains('pager')) pager.hidden = true;
    return;
  }
  list.dataset.page = '';
  renderPaged(list, items, (raw) => {
    const item = toItem(raw);
    return el('li', { class: 'card history-item' },
      el('div', null,
        el('div', { class: 'history-user' }, item.title),
        el('div', { class: 'history-date' }, `${item.meta} ・ ${formatDate(item.deleted.deleted_at)} に ${item.deleted.deleted_by || '不明'} さんが削除`)
      ),
      el('div', { class: 'history-actions' },
        el('button', { type: 'button', class: 'btn btn-small', onclick: () => restore(item) }, '元に戻す'))
    );
  });
}

async function restore(item) {
  if (!confirm(item.confirmText)) return;
  try {
    await api('POST', '/api/admin/restore', { type: item.type, id: item.deleted.id });
    showMessage('元に戻しました');
    loadDeleted();
    loadRankings();
    loadTournaments();
    loadLogs(1);
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ---- 操作履歴 ----

const logList = document.getElementById('log-list');
const logPager = document.getElementById('log-pager');
let logPage = 1;

// 指定したページを読み込む（省略すると今のページを読み直す）
async function loadLogs(page = logPage) {
  try {
    const data = await api('GET', `/api/admin/logs?page=${page}`);
    // 件数が減って今のページが無くなったときは、最後のページを出す
    if (data.logs.length === 0 && data.page > data.pages) return loadLogs(data.pages);
    logPage = data.page;
    logList.replaceChildren(...(data.logs.length ? data.logs.map(renderLog) : [el('li', { class: 'muted' }, 'まだ操作履歴がありません')]));
    renderLogPager(data.page, data.pages);
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ページ番号のタブ（ページが多いときは、最初・最後と今のページの前後2つだけ出す）
function renderLogPager(page, pages) {
  logPager.hidden = pages <= 1;
  const numbers = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const buttons = [];
  numbers.forEach((n, i) => {
    if (i > 0 && n - numbers[i - 1] > 1) buttons.push(el('span', { class: 'pager-gap' }, '…'));
    buttons.push(el('button', {
      type: 'button',
      class: n === page ? 'pager-btn active' : 'pager-btn',
      'aria-current': n === page ? 'page' : 'false',
      onclick: async () => {
        await loadLogs(n);
        document.getElementById('log-section').scrollIntoView({ block: 'start' });
      },
    }, n));
  });
  logPager.replaceChildren(...buttons);
}

// 1行：操作内容と、日時・操作者
function renderLog(log) {
  return el('li', { class: log.action === 'foul' ? 'log-row log-foul' : 'log-row' },
    el('div', { class: 'log-text' }, describeLog(log, parseJson(log.before_json), parseJson(log.after_json))),
    el('div', { class: 'log-meta' }, `${formatDateTime(log.created_at)} ・ ${log.actor}`)
  );
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 「2026/10/04 21:05」形式（端末の時刻帯）
function formatDateTime(iso) {
  const d = new Date(iso);
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 操作履歴の1行を、読める文にする
function describeLog(log, before, after) {
  const b = before || {};
  const a = after || {};
  const name = log.target_name ? `「${log.target_name}」` : '';

  // 反則（権限のない操作を試みた）
  if (log.action === 'foul' && a.banned) return `退場処分：反則を繰り返したため、${a.banned / 60}時間の退場`;
  if (log.action === 'foul') return `反則：権限のない操作を試みました（${a.what}${a.count > 1 ? `・${a.count}回` : ''}）`;

  if (log.target_type === 'ranking') {
    if (log.action === 'create' && !a.entry) return `${name}を作成`;
    if (log.action === 'delete' && !b.entry) return `${name}を削除`;
    if (log.action === 'restore') return `${name}を元に戻した`;
    if (log.action === 'update' && a.blinds) return `イベント${name}のブラインドを変更（1レベル${a.blinds.minutes}分・${a.blinds.levels.length}段階）`;
    if (log.action === 'update' && a.info) return `イベント${name}の情報を変更（${a.info.name}・${a.info.held_on ? monthDay(a.info.held_on) : '開催日未定'}・${a.info.capacity ? `上限${a.info.capacity}人` : '上限なし'}）`;
    // イベントの申し込み・進行
    if (log.action === 'create' && a.entry) return `イベント${name}に ${a.entry.user_name} さんの申し込みを追加`;
    if (log.action === 'delete' && b.entry) return `イベント${name}の ${b.entry.user_name} さんの申し込みを取り消し`;
    if (log.action === 'update' && a.status === 'running') return `イベント${name}の受付を締め切って開始`;
    if (log.action === 'update' && a.status === 'entry') return `イベント${name}を申し込み受付に戻した`;
    if (log.action === 'update' && a.bust) return `イベント${name}で ${a.bust} さんが ${a.place}位${a.winner ? `、${a.winner} さんが優勝` : ''}`;
    if (log.action === 'update' && b.undo) return `イベント${name}の記録を1つ戻した（${b.undo.map((u) => `${u.name} さんの${u.place}位`).join('、')}）`;
    if (log.action === 'update' && 'results' in a) return `イベント${name}の順位を入力（${a.results.length}人）`;
  }

  if (log.target_type === 'score') {
    if (log.action === 'claim') {
      return `過去の記録「${b.user_name}」のひも付け先を ${log.claim_owner ? `${log.claim_owner} さん` : '未ひも付け'} に変更`;
    }
    const who = a.user_name || log.score_player;
    const day = a.played_on || b.played_on || log.score_played_on;
    const subject = `${name}${who ? ` ${who} さんの` : ''}${day ? ` ${monthDay(day)}` : ''}の記録`;
    if (log.action === 'create') return `${subject}を登録（${formatAmount(a.amount)}）`;
    if (log.action === 'delete') return `${subject}を削除（${formatAmount(b.amount)}）`;
    if (log.action === 'restore') return `${subject}を元に戻した`;
    if (log.action === 'update') {
      const changes = [];
      if (b.amount !== a.amount) changes.push(`${formatAmount(b.amount)} → ${formatAmount(a.amount)}`);
      if (b.played_on !== a.played_on) changes.push(`${monthDay(b.played_on)} → ${monthDay(a.played_on)}`);
      return `${subject}を修正（${changes.length ? changes.join('、') : '内容は同じ'}）`;
    }
  }

  if (log.target_type === 'tournament') {
    if (log.action === 'create') return a.entry ? `大会${name}に ${a.entry.user_name} さんの申し込みを追加` : `大会${name}を作成`;
    if (log.action === 'delete') return b.entry ? `大会${name}の ${b.entry.user_name} さんの申し込みを取り消し` : `大会${name}を削除`;
    if (log.action === 'restore') return `大会${name}を元に戻した`;
    if (log.action === 'update') {
      if (a.blinds) return `大会${name}のブラインドを変更（1レベル${a.blinds.minutes}分・${a.blinds.levels.length}段階）`;
      if (a.info) return `大会${name}の情報を変更（${a.info.name}・${a.info.held_on ? monthDay(a.info.held_on) : '開催日未定'}・${a.info.capacity ? `上限${a.info.capacity}人` : '上限なし'}）`;
      if ('match' in a) return a.winner === null ? `大会${name}の対戦結果を取り消し` : `大会${name}の対戦結果を入力`;
      if (a.status === 'running') return `大会${name}の組み合わせを作成`;
      if (a.status === 'entry') return `大会${name}を申し込み受付に戻した`;
    }
  }

  return `${log.target_type} を ${log.action}`;
}

loadAdmins();
loadRankings();
loadTournaments();
loadClaims();
loadDeleted();
loadLogs(1);
