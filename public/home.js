// ホーム画面：一覧の10件ずつのページ切り替え
// 一覧の中身と見た目は、サーバーが全件を描いて返す（src/pages/home.tsx）。ここでは見せる・隠すを切り替えるだけ
['ranking-list', 'event-list', 'tournament-list'].forEach((id) => paginateList(document.getElementById(id)));
