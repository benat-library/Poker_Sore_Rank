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
  if (ranking.status === 'grace') return el('span', { class: 'badge badge-grace' }, '締め・入力猶予中');
  return el('span', { class: 'badge badge-closed' }, '確定');
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

// ---- 管理者モード（ページの見出しを3秒以内に5回タップで切り替え） ----
const ADMIN_KEY = 'poker.admin';
function isAdminMode() {
  return storageGet(ADMIN_KEY) === '1';
}
function applyAdminMode() {
  document.body.classList.toggle('admin-mode', isAdminMode());
  document.dispatchEvent(new Event('adminmodechange'));
}
let adminTaps = [];
document.addEventListener('click', (event) => {
  if (!event.target.closest('main h1')) return;
  const now = Date.now();
  adminTaps = adminTaps.filter((t) => now - t < 3000).concat(now);
  if (adminTaps.length < 5) return;
  adminTaps = [];
  storageSet(ADMIN_KEY, isAdminMode() ? '0' : '1');
  applyAdminMode();
  showMessage(isAdminMode() ? '管理者モードをオンにしました' : '管理者モードをオフにしました');
});
applyAdminMode();
