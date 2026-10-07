// マイページ：表示する人の切り替え（管理者・編集モード）と、一覧の10件ずつの切り替え
// 成績の中身と見た目は、サーバーが作って返す（src/pages/me.tsx）。ここでは差し替えと、見せる・隠すだけを行う

const filterEl = document.getElementById('user-filter');
const bodyEl = document.getElementById('me-body');

// 成績の部分にある一覧を、10件ずつの切り替えにする
function paginateBody() {
  bodyEl.querySelectorAll('ul.list').forEach(paginateList);
}

// 選んだ人の成績の部分を、サーバーで作り直してもらって差し替える（URLは変えない）
async function loadStats() {
  const target = filterEl.value || me.id;
  try {
    const res = await request('GET', `/me/stats?player=${encodeURIComponent(target)}`);
    // サーバーが JSX でエスケープ済みの HTML なので、そのまま入れてよい
    const template = document.createElement('template');
    template.innerHTML = await res.text();
    bodyEl.replaceChildren(template.content);
    paginateBody();
  } catch (e) {
    showMessage(e.message, true);
  }
}
filterEl.addEventListener('change', loadStats);
// 編集モードをオフにしたら自分の成績に戻す
document.addEventListener('adminmodechange', () => {
  if (!isAdminMode() && filterEl.value !== me.id) {
    filterEl.value = me.id;
    loadStats();
  }
});

paginateBody();
