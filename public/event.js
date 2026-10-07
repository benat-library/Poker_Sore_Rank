// イベント画面：申し込み・参加者一覧、開催中の「飛んだ」の記録、順位の表示

const eventId = document.getElementById('page').dataset.eventId;
let data = null; // { event, entries, can_enter }

const STATUS_LABELS = { entry: ['受付中', 'badge-open'], running: ['開催中', 'badge-grace'], finished: ['終了', 'badge-closed'] };

async function load() {
  try {
    data = await api('GET', `/api/events/${eventId}`);
    render();
  } catch (e) {
    document.getElementById('event-name').textContent = '';
    showMessage(e.message, true);
  }
}
// 編集モードを切り替えたら、「飛んだ」を押せるかどうかの表示を変える
document.addEventListener('adminmodechange', () => { if (data) render(); });

function render() {
  const ev = data.event;
  const [label, cls] = STATUS_LABELS[ev.status];
  document.getElementById('event-badge').replaceChildren(el('span', { class: `badge ${cls}` }, label));
  document.getElementById('event-name').textContent = ev.name;
  document.getElementById('event-date').textContent = ev.held_on ? `開催日 ${formatDay(ev.held_on)}` : '開催日 未定';
  document.title = `${ev.name} | ポーカー部`;
  fillInfoForm(ev);
  showBlinds(ev);
  renderCapacity();
  document.getElementById('entry-section').hidden = ev.status !== 'entry';
  document.getElementById('running-section').hidden = ev.status !== 'running';
  if (ev.status === 'entry') renderEntries();
  if (ev.status === 'running') renderRemaining();
  renderPlaces();
}

// 参加人数と募集上限（上限があれば埋まり具合のバーを出す）
function renderCapacity() {
  const { capacity } = data.event;
  const count = data.entries.length;
  document.getElementById('entry-count').textContent = capacity ? `${count} / ${capacity}人` : `${count}人`;
  const bar = document.getElementById('capacity-bar');
  bar.hidden = !capacity || data.event.status !== 'entry';
  if (capacity) {
    document.getElementById('capacity-fill').style.width = `${Math.min(100, (count / capacity) * 100)}%`;
    bar.classList.toggle('full', count >= capacity);
  }
}

// ---- 申し込み受付中 ----

function myEntry() {
  return data.entries.find((e) => e.discord_id === me.id);
}

function renderEntries() {
  const mine = myEntry();
  const { capacity } = data.event;
  const full = capacity !== null && data.entries.length >= capacity;
  const button = document.getElementById('entry-btn');
  const status = document.getElementById('entry-status');
  // 申し込めない理由があれば、ボタンを押せなくして理由を出す
  if (mine) {
    status.textContent = '申し込み済みです';
    button.textContent = '申し込みを取り消す';
    button.className = 'btn tm-entry-btn';
    button.disabled = false;
  } else if (!data.can_enter) {
    status.textContent = '申し込めるのは競技ポーカー部の部員だけです（ロールを付けてもらった直後なら、ログインし直してください）';
    button.textContent = '申し込む';
    button.className = 'btn btn-primary tm-entry-btn';
    button.disabled = true;
  } else if (full) {
    status.textContent = '定員に達したため、受付を終了しました';
    button.textContent = '定員に達しました';
    button.className = 'btn btn-primary tm-entry-btn';
    button.disabled = true;
  } else {
    status.textContent = 'まだ申し込んでいません';
    button.textContent = '申し込む';
    button.className = 'btn btn-primary tm-entry-btn';
    button.disabled = false;
  }

  document.getElementById('entry-empty').hidden = data.entries.length > 0;
  document.getElementById('entry-list').replaceChildren(...data.entries.map((entry, i) =>
    el('li', { class: entry.discord_id === me.id ? 'tm-entry mine' : 'tm-entry' },
      el('span', { class: 'tm-entry-no' }, String(i + 1)),
      el('span', { class: 'tm-entry-name' }, entry.name),
      el('button', { type: 'button', class: 'tm-entry-remove admin-only', 'aria-label': `${entry.name} さんを削除`, onclick: () => removeEntry(entry) }, '×')
    )
  ));
}

document.getElementById('entry-btn').addEventListener('click', async (event) => {
  const mine = myEntry();
  const button = event.currentTarget;
  button.disabled = true;
  try {
    if (mine) {
      if (!confirm('申し込みを取り消しますか？')) return;
      await api('DELETE', `/api/events/${eventId}/entries/${mine.id}`);
      showMessage('申し込みを取り消しました');
    } else {
      await api('POST', `/api/events/${eventId}/entries`, {});
      showMessage('申し込みました');
    }
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    load();
  }
});

// 編集モード：intra名で参加者を追加
document.getElementById('add-entry-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('add-entry-name');
  if (!input.value.trim()) {
    showMessage('intra名を入力してください', true);
    return;
  }
  try {
    const result = await api('POST', `/api/events/${eventId}/entries`, { user_name: input.value.trim() });
    showMessage(`${result.name} さんを追加しました`);
    input.value = '';
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
});

async function removeEntry(entry) {
  if (!confirm(`${entry.name} さんの申し込みを削除しますか？`)) return;
  try {
    await api('DELETE', `/api/events/${eventId}/entries/${entry.id}`);
    showMessage('削除しました');
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ---- 開催中 ----

// 残っている人（編集モードでは、タップで「飛んだ」を記録する）
function renderRemaining() {
  const remaining = data.entries.filter((e) => e.place === null);
  document.getElementById('remaining-count').textContent = String(remaining.length);
  const admin = isAdminMode();
  document.getElementById('remaining-list').replaceChildren(...remaining.map((entry) => {
    const cls = `tm-entry${entry.discord_id === me.id ? ' mine' : ''}`;
    const content = [el('span', { class: 'tm-entry-name' }, entry.name)];
    if (!admin) return el('li', { class: cls }, ...content);
    return el('li', { class: cls },
      el('button', { type: 'button', class: 'ev-bust-btn', onclick: () => bust(entry, remaining.length) },
        ...content, el('span', { class: 'ev-bust-label' }, '飛んだ')));
  }));
}

async function bust(entry, remaining) {
  const last = remaining === 2;
  const question = last
    ? `${entry.name} さんが飛んで ${remaining}位、残りの1人が優勝で終了します。よろしいですか？`
    : `${entry.name} さんが飛んで ${remaining}位で記録しますか？`;
  if (!confirm(question)) return;
  try {
    const result = await api('POST', `/api/events/${eventId}/bust`, { entry_id: entry.id });
    showMessage(result.winner ? `${result.winner} さんが優勝しました！` : `${entry.name} さん ${result.place}位`);
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
}

// 編集モード：締め切り・受付に戻す・1つ戻す
async function postAction(path, question, done) {
  if (!confirm(question)) return;
  try {
    await api('POST', `/api/events/${eventId}/${path}`, {});
    showMessage(done);
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
}
document.getElementById('close-btn').addEventListener('click', () =>
  postAction('close', '申し込みを締め切って、イベントを開始しますか？', '開始しました'));
document.getElementById('reopen-btn').addEventListener('click', () =>
  postAction('reopen', '申し込みの受付に戻しますか？', '受付に戻しました'));
document.getElementById('undo-btn').addEventListener('click', () =>
  postAction('undo', '最後に記録した「飛んだ」を取り消しますか？', '1つ戻しました'));
document.getElementById('undo-finished-btn').addEventListener('click', () =>
  postAction('undo', '優勝と2位の記録を取り消して、開催中に戻しますか？', '開催中に戻しました'));

// ---- 順位（開催中は飛んだ人、終了後は全員と表彰台） ----

function renderPlaces() {
  const placed = data.entries.filter((e) => e.place !== null).sort((a, b) => a.place - b.place);
  const finished = data.event.status === 'finished';
  document.getElementById('places-section').hidden = placed.length === 0;
  document.getElementById('finished-actions').hidden = !finished;
  document.getElementById('places-body').replaceChildren(...placed.map((e) =>
    el('tr', { class: e.player_key === me.id ? 'mine' : '' },
      el('td', { class: 'col-rank' }, el('span', { class: e.place <= 3 ? `rank-chip rank-${e.place}` : 'rank-chip' }, e.place)),
      el('td', { class: 'col-name' }, e.name)
    )));

  // 表彰台（終了後だけ。トーナメント画面と同じ見た目）
  const podium = document.getElementById('podium');
  podium.hidden = !finished;
  if (!finished) return;
  const STEP = { 1: 'first', 2: 'second', 3: 'third' };
  podium.replaceChildren(...[2, 1, 3].map((place) => {
    const r = placed.find((e) => e.place === place);
    return el('div', { class: `tm-podium-step ${STEP[place]}${r ? '' : ' empty'}` },
      el('div', { class: 'tm-podium-names' }, r ? el('div', { class: r.player_key === me.id ? 'mine' : '' }, r.name) : null),
      el('div', { class: 'tm-podium-block' }, `${place}位`));
  }));
}

bindInfoForm(`/api/events/${eventId}`, load);
bindBlindForm(`/api/events/${eventId}/blinds`, load);
load();
