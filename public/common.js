// 全ページ共通の処理

// APIを呼び出す。失敗時はサーバーが返した日本語の理由を持つ Error を投げる
async function api(method, path, body) {
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
  let data = null;
  try {
    data = await res.json();
  } catch {
    // JSON以外の応答は無視する
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
