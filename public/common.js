// 全ページ共通の処理

// リクエストを送る。失敗時はサーバーが返した日本語の理由を持つ Error を投げる
async function request(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error('通信できませんでした。電波の状態を確認してください');
  }
  if (res.status === 401) {
    // ログインが切れている場合はログイン画面へ
    location.href = '/login';
    throw new Error('ログインしてください');
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      // JSON以外の応答は無視する
    }
    // 権限のない操作をしようとした（反則）ときは、反則の画面を出す
    if (data && data.code === 'foul') showFoul();
    // 退場処分中（反則を繰り返した）なら、退場の画面にする
    if (data && data.code === 'banned') location.reload();
    throw new Error(data && data.error ? data.error : `エラーが発生しました（${res.status}）`);
  }
  return res;
}

// APIを呼び出し、結果のJSONを返す
async function api(method, path, body) {
  const res = await request(method, path, body);
  return res.json();
}

// ファイルを取得し、指定したファイル名で保存する
async function downloadFile(path, filename) {
  const res = await request('GET', path);
  const url = URL.createObjectURL(await res.blob());
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ファイル名に使えない文字を置き換える
function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|\r\n]/g, '_').trim() || 'ranking';
}

// 要素を作る。文字列は textContent として入るため、HTMLとして解釈されない（XSS対策）
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? String(child) : child);
  }
  return node;
}

// 画面上部にお知らせを数秒表示する
let messageTimer;
function showMessage(text, isError) {
  const box = document.getElementById('message');
  box.textContent = text;
  box.classList.toggle('error', !!isError);
  box.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { box.hidden = true; }, isError ? 5000 : 2500);
}

// ISO 8601 の日時を「2026/10/01」形式（端末の時刻帯）にする
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// localStorage の読み書き（プライベートモード等で使えない場合も画面が止まらないようにする）
function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても動作は続ける
  }
}

// ログイン中の部員（サーバーが body の data 属性に入れている）
const me = { id: document.body.dataset.userId || '', name: document.body.dataset.userName || '' };

// 端末の時刻帯での今日の日付（YYYY-MM-DD）
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Scoreを「+1,200」「-300」形式にする
function formatAmount(n) {
  return (n > 0 ? '+' : n < 0 ? '-' : '±') + Math.abs(n).toLocaleString('ja-JP');
}

// Scoreの符号に応じた色クラス
function amountClass(n) {
  return n > 0 ? 'plus' : n < 0 ? 'minus' : '';
}

// 画面の data-ranking-id からランキングIDを取り出す
function currentRankingId() {
  return document.getElementById('page').dataset.rankingId;
}

// Score欄は数字以外を取り除く（全角数字は半角に直す）
function keepDigitsOnly(input) {
  input.addEventListener('input', () => {
    const normalized = input.value
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9]/g, '');
    if (normalized !== input.value) input.value = normalized;
  });
}

// ランキングの状態を表す小さなラベル
function statusBadge(ranking) {
  if (ranking.kind !== 'monthly') return el('span', { class: 'badge badge-event' }, 'イベント');
  if (ranking.status === 'open') return el('span', { class: 'badge badge-open' }, '開催中');
  if (ranking.status === 'grace') return el('span', { class: 'badge badge-grace' }, '締め間近');
  return el('span', { class: 'badge badge-closed' }, '確定');
}

// 一覧を PAGE_SIZE 件ずつに分け、一覧の下にページ番号のタブを出す
// 表示中のページは listEl.dataset.page に覚えておき、削除などで描き直しても同じページを保つ
const PAGE_SIZE = 10;
function renderPaged(listEl, items, renderItem) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Number(listEl.dataset.page) || 1, pages);
  listEl.dataset.page = String(page);
  listEl.replaceChildren(...items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(renderItem));

  let pager = listEl.nextElementSibling;
  if (!pager || !pager.classList.contains('pager')) {
    pager = el('nav', { class: 'pager', 'aria-label': 'ページ切り替え' });
    listEl.after(pager);
  }
  pager.hidden = pages === 1;
  pager.replaceChildren(...Array.from({ length: pages }, (_, i) => {
    const n = i + 1;
    return el('button', {
      type: 'button',
      class: n === page ? 'pager-btn active' : 'pager-btn',
      'aria-current': n === page ? 'page' : 'false',
      onclick: () => {
        listEl.dataset.page = String(n);
        renderPaged(listEl, items, renderItem);
        // 切り替えたページの先頭が見えるようにする
        if (listEl.getBoundingClientRect().top < 0) listEl.scrollIntoView({ block: 'start' });
      },
    }, n);
  }));
}

// サーバーが全件を描いて返した一覧（11件目以降は hidden 付き）を、10件ずつ見せたり隠したりする
// 見た目はサーバー側（src/pages）だけで作り、ここでは表示の切り替えとページ番号のタブだけを扱う
function paginateList(listEl) {
  const items = [...listEl.children];
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  let pager = listEl.nextElementSibling;
  if (!pager || !pager.classList.contains('pager')) {
    pager = el('nav', { class: 'pager', 'aria-label': 'ページ切り替え' });
    listEl.after(pager);
  }
  const show = (page) => {
    items.forEach((item, i) => { item.hidden = Math.floor(i / PAGE_SIZE) !== page - 1; });
    pager.hidden = pages === 1;
    pager.replaceChildren(...Array.from({ length: pages }, (_, i) => {
      const n = i + 1;
      return el('button', {
        type: 'button',
        class: n === page ? 'pager-btn active' : 'pager-btn',
        'aria-current': n === page ? 'page' : 'false',
        onclick: () => {
          show(n);
          // 切り替えたページの先頭が見えるようにする
          if (listEl.getBoundingClientRect().top < 0) listEl.scrollIntoView({ block: 'start' });
        },
      }, n);
    }));
  };
  show(1);
}

// 「2026-10-03」を「10月3日」にする
function monthDay(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}月${d}日`;
}

// 「2026-10-01」を「2026/10/01（木）」にする
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function formatDay(date) {
  return `${date.replaceAll('-', '/')}（${weekdayOf(date)}）`;
}

// 日付入力欄の横に曜日を表示する（入力欄そのものには曜日を出せないため）
function attachWeekday(input, label) {
  const update = () => { label.textContent = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? `（${weekdayOf(input.value)}）` : ''; };
  input.addEventListener('input', update);
  input.addEventListener('change', update);
  update();
  return update;
}

// 月間リングのScore（最終チップ数 − 初期チップ − Rebuy分）
function scoreFromChips(rule, finalChips, rebuys) {
  return finalChips - rule.start - rule.rebuy * rebuys;
}

// Scoreの計算式の説明（例：350 − 200 − Rebuy 200×1）
function chipFormula(rule, finalChips, rebuys) {
  return `（${finalChips} − 初期${rule.start}${rebuys ? ` − Rebuy ${rule.rebuy}×${rebuys}` : ''}）`;
}

// ---- 反則の画面（権限のない操作を API で実行しようとしたとき） ----
// 画面いっぱいに出し、数秒は閉じられないようにする。そのあと「反省して戻る」で閉じる
function showFoul() {
  if (document.querySelector('.foul')) return;
  const back = el('button', { type: 'button', class: 'btn foul-back', hidden: '', onclick: () => overlay.remove() }, '反省して戻る');
  const overlay = el('div', { class: 'foul', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'foul-title' },
    el('div', { class: 'foul-card' },
      el('div', { class: 'foul-mark', 'aria-hidden': 'true' }),
      el('h2', { id: 'foul-title', class: 'foul-title' }, '反則行為を検知しました'),
      el('p', { class: 'foul-text' }, '権限のない操作は、ポーカー部運営に通報されました。'),
      back));
  document.body.append(overlay);
  setTimeout(() => back.removeAttribute('hidden'), 3000);
}

// ---- 大会の情報を変える欄（イベント・トーナメント共通。編集モード） ----
// 読み込んだ大会の情報を入力欄に入れる（入力中に読み直しても、書きかけを消さないよう、欄が閉じているときだけ入れ直す）
function fillInfoForm(info) {
  const form = document.getElementById('info-form');
  if (!form || form.closest('details').open) return;
  document.getElementById('info-name').value = info.name;
  document.getElementById('info-date').value = info.held_on || '';
  document.getElementById('info-capacity').value = info.capacity ?? '';
}

// ---- ブラインドストラクチャー（イベント・トーナメント共通） ----
// 表に段階と1レベルの時間を入れる。編集欄は、書きかけでなければ今の内容に入れ直す
let blindDirty = false;
function showBlinds(info) {
  if (!document.getElementById('blind-body')) return;
  document.getElementById('blind-minutes').textContent = String(info.blind_minutes);
  document.getElementById('blind-body').replaceChildren(...info.blind_levels.map(([sb, bb], i) =>
    el('tr', null, el('td', { class: 'col-rank' }, i + 1), el('td', { class: 'blind-amount' }, `${sb} / ${bb}`))));
  if (blindDirty) return;
  document.getElementById('blind-minutes-input').value = String(info.blind_minutes);
  document.getElementById('blind-rows').replaceChildren(...info.blind_levels.map(([sb, bb]) => blindRow(sb, bb)));
  numberBlindRows();
}

// 編集欄の1行（Lv・SB・BB・削除）
function blindRow(sb, bb) {
  const input = (value, label) => {
    const node = el('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '7', autocomplete: 'off', 'aria-label': label, value: value ?? '' });
    keepDigitsOnly(node);
    node.addEventListener('input', () => { blindDirty = true; });
    return node;
  };
  const row = el('div', { class: 'blind-row' },
    el('span', { class: 'blind-row-lv' }),
    input(sb, 'SB'), el('span', { class: 'blind-row-sep' }, '/'), input(bb, 'BB'),
    el('button', { type: 'button', class: 'blind-row-remove', 'aria-label': 'このレベルを削除', onclick: () => {
      row.remove();
      blindDirty = true;
      numberBlindRows();
    } }, '×'));
  return row;
}

// 編集欄の行に Lv の番号を振り直す
function numberBlindRows() {
  document.querySelectorAll('#blind-rows .blind-row-lv').forEach((node, i) => { node.textContent = `Lv${i + 1}`; });
}

// 編集欄の操作（行の追加・標準に戻す・保存）。path は PUT する先、done は保存後に呼ぶ（画面の読み直し）
function bindBlindForm(path, done) {
  const form = document.getElementById('blind-form');
  if (!form) return;
  const rows = document.getElementById('blind-rows');
  const minutesInput = document.getElementById('blind-minutes-input');
  keepDigitsOnly(minutesInput);
  minutesInput.addEventListener('input', () => { blindDirty = true; });
  // 追加する行は、最後の行の2倍を仮に入れておく（直して使う）
  document.getElementById('blind-add').addEventListener('click', () => {
    const last = [...rows.querySelectorAll('.blind-row')].pop();
    const values = last ? [...last.querySelectorAll('input')].map((node) => Number(node.value) * 2 || '') : ['', ''];
    rows.append(blindRow(values[0], values[1]));
    blindDirty = true;
    numberBlindRows();
  });
  const save = async (levels, message) => {
    try {
      await api('PUT', path, { minutes: Number(document.getElementById('blind-minutes-input').value), levels });
      blindDirty = false;
      showMessage(message);
      done();
    } catch (e) {
      showMessage(e.message, true);
    }
  };
  document.getElementById('blind-reset').addEventListener('click', () => {
    if (confirm('ブラインドの段階を標準に戻しますか？（1レベルの時間は、今選んでいる時間で保存します）')) save(null, '標準に戻しました');
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const levels = [...rows.querySelectorAll('.blind-row')].map((row) => [...row.querySelectorAll('input')].map((node) => Number(node.value)));
    save(levels, '保存しました');
  });
}

// 保存ボタンの処理。path は PUT する先、done は保存後に呼ぶ（画面の読み直し）
function bindInfoForm(path, done) {
  const form = document.getElementById('info-form');
  if (!form) return;
  keepDigitsOnly(document.getElementById('info-capacity'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('PUT', path, {
        name: document.getElementById('info-name').value,
        held_on: document.getElementById('info-date').value,
        capacity: document.getElementById('info-capacity').value,
      });
      showMessage('保存しました');
      form.closest('details').open = false;
      done();
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

// ---- 一般部員として表示（管理者のデバッグ用） ----
// 管理ページの「一般部員として表示」と、画面上部の帯の「管理者に戻る」。切り替えたら画面を読み直す
async function setMemberView(on) {
  try {
    await api('POST', '/api/member-view', { on });
    location.href = on ? '/' : '/admin';
  } catch (e) {
    showMessage(e.message, true);
  }
}
document.getElementById('member-view-on')?.addEventListener('click', () => setMemberView(true));
document.getElementById('member-view-off')?.addEventListener('click', () => setMemberView(false));

// ---- 編集モード（管理者用） ----
// 管理者（ポーカー運営サーバーのメンバー）だけが、他の人の記録の修正や結果入力などを画面に出せる
// 誤操作を防ぐため、ふだんは隠しておき、画面右下の「編集モード」ボタンでオン・オフする（画面を開くたびにオフから始まる）
// 画面の表示を切り替えるだけで、操作できるかどうかはサーバー側で判定している
// （内部の名前は以前の「管理者モード」のまま：admin-mode クラス、isAdminMode、adminmodechange イベント）
let editMode = false;
function isAdmin() {
  return document.body.dataset.admin === '1';
}
function isAdminMode() {
  return isAdmin() && document.body.dataset.edit === '1' && editMode;
}
function applyAdminMode() {
  const on = isAdminMode();
  document.body.classList.toggle('admin-mode', on);
  if (editToggle) {
    editToggle.setAttribute('aria-pressed', String(on));
    editToggle.textContent = on ? '編集モード：オン' : '編集モード：オフ';
  }
  document.dispatchEvent(new Event('adminmodechange'));
}
// 切り替えボタンは、管理者が管理者用の操作のある画面を開いたときだけ出す
const editToggle = isAdmin() && document.body.dataset.edit === '1'
  ? el('button', {
      type: 'button',
      class: 'edit-toggle',
      onclick: () => {
        editMode = !editMode;
        applyAdminMode();
      },
    })
  : null;
if (editToggle) document.body.append(editToggle);
applyAdminMode();
