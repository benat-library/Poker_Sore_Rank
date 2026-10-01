// 全ページ共通の処理

// 合言葉の保存先キー
const PASSWORD_KEY = 'poker.password';

// APIを呼び出す。失敗時はサーバーが返した日本語の理由を持つ Error を投げる
async function api(method, path, body) {
  // 日本語の合言葉もヘッダーで送れるようエンコードする
  const options = { method, headers: { 'X-App-Password': encodeURIComponent(storageGet(PASSWORD_KEY) || '') } };
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
  let data = null;
  try {
    data = await res.json();
  } catch {
    // JSON以外の応答は無視する
  }
  if (res.status === 401) {
    // 合言葉が違う（変更された）場合は、保存分を消して入力画面に戻す
    storageRemove(PASSWORD_KEY);
    showLogin();
  }
  if (!res.ok) {
    throw new Error(data && data.error ? data.error : `エラーが発生しました（${res.status}）`);
  }
  return data;
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
function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 削除できなくても動作は続ける
  }
}

// 入力したユーザー名の保存先キー
const USER_NAME_KEY = 'poker.userName';

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

// ---- 合言葉認証 ----

// 認証後に実行する、ページごとの読み込み処理
let onUnlocked = null;

// ページの開始。合言葉が保存済みならすぐ読み込み、なければ入力画面を出す
function startPage(load) {
  onUnlocked = load;
  if (storageGet(PASSWORD_KEY)) unlock();
  else showLogin();
}

// 本来の画面を表示して読み込みを始める
function unlock() {
  document.body.classList.remove('locked');
  document.getElementById('login').hidden = true;
  if (onUnlocked) onUnlocked();
}

// 合言葉入力画面を表示する
function showLogin() {
  document.body.classList.add('locked');
  document.getElementById('login').hidden = false;
  document.getElementById('login-password').focus();
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('login-password');
  const button = event.target.querySelector('button');
  button.disabled = true;
  storageSet(PASSWORD_KEY, input.value);
  try {
    await api('POST', '/api/auth');
    input.value = '';
    unlock();
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    button.disabled = false;
  }
});
