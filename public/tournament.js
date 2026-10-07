// トーナメント画面：申し込み・参加者一覧・トーナメント表・結果

const tournamentId = document.getElementById('page').dataset.tournamentId;
let data = null; // { tournament, entries, matches, can_enter }

const STATUS_LABELS = { entry: ['受付中', 'badge-open'], running: ['開催中', 'badge-grace'], finished: ['終了', 'badge-closed'] };

async function load() {
  try {
    data = await api('GET', `/api/tournaments/${tournamentId}`);
    render();
  } catch (e) {
    showMessage(e.message, true);
  }
}
// 編集モードを切り替えたら、結果を入れられるかどうかの表示を変える
document.addEventListener('adminmodechange', () => { if (data) render(); });

function render() {
  const t = data.tournament;
  const [label, cls] = STATUS_LABELS[t.status];
  document.getElementById('tournament-badge').replaceChildren(el('span', { class: `badge ${cls}` }, label));
  document.getElementById('tournament-name').textContent = t.name;
  document.getElementById('tournament-date').textContent = t.held_on ? `開催日 ${formatDay(t.held_on)}` : '開催日 未定';
  document.title = `${t.name} | ポーカー部`;
  fillInfoForm(t);
  showBlinds(t);
  renderCapacity();
  document.getElementById('entry-section').hidden = t.status !== 'entry';
  document.getElementById('bracket-section').hidden = t.status === 'entry';
  if (t.status === 'entry') renderEntries();
  else {
    renderBracket();
    renderResult();
  }
}

// 参加人数と募集上限（上限があれば埋まり具合のバーを出す）
function renderCapacity() {
  const { capacity } = data.tournament;
  const count = data.entries.length;
  document.getElementById('entry-count').textContent = capacity ? `${count} / ${capacity}人` : `${count}人`;
  const bar = document.getElementById('capacity-bar');
  bar.hidden = !capacity;
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
  const { capacity } = data.tournament;
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
      await api('DELETE', `/api/tournaments/${tournamentId}/entries/${mine.id}`);
      showMessage('申し込みを取り消しました');
    } else {
      await api('POST', `/api/tournaments/${tournamentId}/entries`, {});
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
    const result = await api('POST', `/api/tournaments/${tournamentId}/entries`, { user_name: input.value.trim() });
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
    await api('DELETE', `/api/tournaments/${tournamentId}/entries/${entry.id}`);
    showMessage('削除しました');
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
}

// 編集モード：組み合わせの作成・作り直し・受付に戻す
async function postAction(path, question, done) {
  if (!confirm(question)) return;
  try {
    await api('POST', `/api/tournaments/${tournamentId}/${path}`, {});
    showMessage(done);
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
}
document.getElementById('draw-btn').addEventListener('click', () =>
  postAction('draw', '申し込みを締め切って、ランダムに組み合わせを作りますか？', '組み合わせを作りました'));
document.getElementById('redraw-btn').addEventListener('click', () =>
  postAction('draw', '今の組み合わせを捨てて、ランダムに作り直しますか？', '組み合わせを作り直しました'));
document.getElementById('reopen-btn').addEventListener('click', () =>
  postAction('reopen', '組み合わせを取り消して、申し込みの受付に戻しますか？', '受付に戻しました'));

// ---- トーナメント表 ----
// 人数が増えても横幅が変わらないよう、隣り合う2つの回戦だけを並べて線でつなぐ（‹ › で回戦を切り替える）
// 列は「その回戦の試合」と「その回戦を不戦勝で通過する人（シード）」でできている

let viewRound = null; // 表示中の左の列の回戦（null なら、まだ結果の入っていない一番早い回戦）

function entryOf(entryId) {
  return data.entries.find((e) => e.id === entryId);
}
function entryName(entryId) {
  return entryOf(entryId)?.name ?? '';
}

// 試合が行われる回戦の名前（後ろから 決勝・準決勝・準々決勝、それより前は「1回戦」など）
function roundName(round, rounds) {
  const fromLast = rounds - round;
  if (fromLast === 0) return '決勝';
  if (fromLast === 1) return '準決勝';
  if (fromLast === 2) return '準々決勝';
  return `${round}回戦`;
}

// この試合に勝者が進んでくる前の試合（player1 側、player2 側。なければ null）
function feedersOf(m) {
  const feeders = data.matches.filter((x) => x.next_round === m.round && x.next_slot === m.slot);
  return ['player1', 'player2'].map((side) => feeders.find((f) => f.next_side === side) ?? null);
}

// 列の項目：{ match }（その回戦の試合）、{ carry: 試合 }（その試合の勝者が不戦勝で通過中）、{ entry }（参加者が不戦勝で通過中）
// 回戦 c の列の項目について、1つ前の回戦（c − 1）の列で、そこへつながる項目を返す
function childrenOf(item, c) {
  if (c === 1) return [];
  if (item.match) {
    const m = item.match;
    if (m.round !== c) return [];
    return feedersOf(m).map((f, i) => {
      if (f) return f.round === c - 1 ? { match: f } : { carry: f };
      const entry = i === 0 ? m.player1_entry_id : m.player2_entry_id;
      return entry !== null ? { entry } : null; // 1回戦の試合でない限り、ここに来るのは不戦勝の参加者
    }).filter(Boolean);
  }
  if (item.carry) return [item.carry.round === c - 1 ? { match: item.carry } : { carry: item.carry }];
  return c - 1 >= 1 ? [{ entry: item.entry }] : [];
}

// 回戦ごとの列（決勝から順に、つながる項目をさかのぼって並べる。上下の並びがそのまま線のつながりになる）
function buildColumns() {
  const rounds = Math.max(...data.matches.map((m) => m.round));
  const final = data.matches.find((m) => m.next_round === null);
  const columns = { [rounds]: [{ match: final }] };
  for (let c = rounds; c > 1; c--) columns[c - 1] = columns[c].flatMap((item) => childrenOf(item, c));
  return { rounds, columns };
}

// まだ結果の入っていない一番早い回戦（全部終わっていれば決勝）
function currentRound(rounds) {
  const open = data.matches.filter((m) => m.winner_entry_id === null).map((m) => m.round);
  return open.length ? Math.min(...open) : rounds;
}

function renderBracket() {
  const { rounds, columns } = buildColumns();
  if (viewRound === null || viewRound > rounds) viewRound = currentRound(rounds);
  const admin = isAdminMode();
  const left = columns[viewRound];
  const isFinal = viewRound === rounds;
  const rightName = isFinal ? '優勝' : roundName(viewRound + 1, rounds);

  // 回戦の切り替え（‹ 1回戦 → 2回戦 ›）
  const prev = el('button', { type: 'button', class: 'bk-nav-btn', 'aria-label': '前の回戦', onclick: () => { viewRound--; renderBracket(); } }, '‹');
  const next = el('button', { type: 'button', class: 'bk-nav-btn', 'aria-label': '次の回戦', onclick: () => { viewRound++; renderBracket(); } }, '›');
  prev.disabled = viewRound === 1;
  next.disabled = isFinal;
  const nav = el('div', { class: 'bk-nav' },
    prev,
    el('div', { class: 'bk-nav-title' },
      el('span', null, roundName(viewRound, rounds)), el('span', { class: 'bk-nav-arrow' }, '→'), el('span', null, rightName)),
    next
  );
  const dots = el('div', { class: 'bk-dots' }, ...Array.from({ length: rounds }, (_, i) =>
    el('button', { type: 'button', class: i + 1 === viewRound ? 'bk-dot active' : 'bk-dot', 'aria-label': roundName(i + 1, rounds),
      onclick: () => { viewRound = i + 1; renderBracket(); } })));

  // 左の列は1行に1項目、右の列の項目はつながる左の項目の行にまたがって置く
  const cells = [];
  left.forEach((item, i) => cells.push(el('div', { class: 'bk-cell', style: `grid-column:1;grid-row:${i + 1}` }, renderItem(item, rounds, admin))));
  if (isFinal) {
    const final = left[0].match;
    const decided = final.winner_entry_id !== null;
    cells.push(el('div', { class: decided ? 'bk-conn span1 won' : 'bk-conn span1', style: 'grid-column:2;grid-row:1' }));
    cells.push(el('div', { class: 'bk-cell', style: 'grid-column:3;grid-row:1' },
      el('div', { class: decided ? 'bk-champion decided' : 'bk-champion' },
        trophyIcon(),
        el('div', { class: 'bk-champion-label' }, '優勝'),
        el('div', { class: 'bk-champion-name' }, decided ? entryName(final.winner_entry_id) : '？')
      )));
  } else {
    let row = 1;
    for (const item of columns[viewRound + 1]) {
      const children = childrenOf(item, viewRound + 1);
      const span = Math.max(1, children.length);
      const won = children.length > 0 && children.every((ch) => itemWinner(ch) !== null);
      const area = `grid-row:${row} / span ${span}`;
      cells.push(el('div', { class: `bk-conn span${span}${won ? ' won' : ''}`, style: `grid-column:2;${area}` }));
      cells.push(el('div', { class: 'bk-cell', style: `grid-column:3;${area}` }, renderItem(item, rounds, admin)));
      row += span;
    }
  }
  document.getElementById('bracket').replaceChildren(
    nav,
    dots,
    el('div', { class: 'bk-heads' }, el('span', null, roundName(viewRound, rounds)), el('span'), el('span', null, rightName)),
    el('div', { class: 'bk-grid' }, ...cells)
  );
}

// 項目の勝ち上がった人（試合なら勝者、不戦勝なら通過する人。まだなら null）
function itemWinner(item) {
  if (item.match) return item.match.winner_entry_id;
  if (item.carry) return item.carry.winner_entry_id;
  return item.entry;
}

function renderItem(item, rounds, admin) {
  if (item.match) return renderMatch(item.match, rounds, admin);
  // 不戦勝で通過中の人（シード）
  const entryId = itemWinner(item);
  const mine = entryId !== null && entryOf(entryId)?.discord_id === me.id;
  return el('div', { class: mine ? 'bk-carry mine' : 'bk-carry' },
    el('span', { class: 'bk-carry-label' }, 'シード'),
    el('span', { class: 'bk-carry-name' }, entryId !== null ? entryName(entryId) : '未定')
  );
}

// 試合の枠（2人の名前。勝者は金色、敗者は薄く）
function renderMatch(m, rounds, admin) {
  const ready = m.player1_entry_id !== null && m.player2_entry_id !== null;
  const row = (entryId, otherId) => {
    const state = m.winner_entry_id === null ? '' : m.winner_entry_id === entryId ? ' win' : ' lose';
    const mine = entryId !== null && entryOf(entryId)?.discord_id === me.id ? ' mine' : '';
    const cls = `bk-player${state}${mine}${entryId === null ? ' waiting' : ''}`;
    const content = [el('span', { class: 'bk-name' }, entryId !== null ? entryName(entryId) : '未定')];
    if (state === ' win') content.push(el('span', { class: 'bk-win' }, 'WIN'));
    if (!admin || !ready) return el('div', { class: cls }, ...content);
    return el('button', { type: 'button', class: `${cls} selectable`, onclick: () => setWinner(m, entryId, otherId) }, ...content);
  };
  return el('div', { class: m.winner_entry_id !== null ? 'bk-match done' : 'bk-match' },
    el('div', { class: 'bk-label' }, `${roundName(m.round, rounds)} 第${m.slot + 1}試合`),
    row(m.player1_entry_id, m.player2_entry_id),
    row(m.player2_entry_id, m.player1_entry_id)
  );
}

// トロフィーの絵（サーバー側の Trophy と同じ形）
function trophyIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    class: 'trophy', width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  })) svg.setAttribute(k, v);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4');
  svg.append(path);
  return svg;
}

// 編集モード：勝者を入れる（いまの勝者をもう一度タップすると取り消し）
async function setWinner(m, entryId, otherId) {
  const clear = m.winner_entry_id === entryId;
  const question = clear
    ? `${entryName(entryId)} さんの勝ちを取り消しますか？`
    : `${entryName(entryId)} さん（vs ${entryName(otherId)} さん）の勝ちにしますか？`;
  if (!confirm(question)) return;
  try {
    await api('PUT', `/api/tournaments/${tournamentId}/matches/${m.id}`, { winner_entry_id: clear ? null : entryId });
    load();
  } catch (e) {
    showMessage(e.message, true);
  }
}

// ---- 結果（終了したら表彰台と順位） ----
// 決勝で負けた人が2位、決勝から k 試合さかのぼった試合で負けた人が (2^k + 1) 位（例：準決勝で負けた人は3位）

function renderResult() {
  const box = document.getElementById('result');
  if (data.tournament.status !== 'finished') {
    box.hidden = true;
    return;
  }
  const final = data.matches.find((m) => m.next_round === null);
  const loserOf = (m) => (m.winner_entry_id === m.player1_entry_id ? m.player2_entry_id : m.player1_entry_id);
  const places = new Map(); // 順位 → 参加者の一覧
  const walk = (m, depth) => {
    const place = 2 ** depth + 1;
    places.set(place, [...(places.get(place) ?? []), loserOf(m)]);
    feedersOf(m).filter(Boolean).forEach((f) => walk(f, depth + 1));
  };
  walk(final, 0);

  const podium = (place, ids, cls) =>
    el('div', { class: `tm-podium-step ${cls}` },
      el('div', { class: 'tm-podium-names' }, ...ids.map((id) => el('div', { class: entryOf(id)?.discord_id === me.id ? 'mine' : '' }, entryName(id)))),
      el('div', { class: 'tm-podium-block' }, el('span', null, place === 1 ? '優勝' : `${place}位`))
    );
  const others = [...places.entries()].filter(([place]) => place > 3).sort((a, b) => a[0] - b[0]);
  box.replaceChildren(
    el('h2', null, '結果'),
    el('div', { class: 'tm-podium' },
      podium(2, places.get(2) ?? [], 'second'),
      podium(1, [final.winner_entry_id], 'first'),
      places.has(3) ? podium(3, places.get(3), 'third') : el('div', { class: 'tm-podium-step third empty' })
    ),
    others.length ? el('dl', { class: 'tm-places' }, ...others.flatMap(([place, ids]) => [
      el('dt', null, `${place}位`),
      el('dd', null, ids.map(entryName).join('、')),
    ])) : ''
  );
  box.hidden = false;
}

// 編集モード：大会の削除
document.getElementById('delete-tournament').addEventListener('click', async () => {
  if (!confirm(`「${data?.tournament.name ?? ''}」を削除しますか？`)) return;
  try {
    await api('DELETE', `/api/tournaments/${tournamentId}`);
    location.href = '/';
  } catch (e) {
    showMessage(e.message, true);
  }
});

bindInfoForm(`/api/tournaments/${tournamentId}`, load);
bindBlindForm(`/api/tournaments/${tournamentId}/blinds`, load);
load();
