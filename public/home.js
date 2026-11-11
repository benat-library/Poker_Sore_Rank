// ホーム画面：一覧のページ切り替え（月間リングは半期分の6件ずつで最新の半期から、ほかは10件ずつ）
// 一覧の中身と見た目は、サーバーが全件を描いて返す（src/pages/home.tsx）。ここでは見せる・隠すを切り替えるだけ
// 6 は src/pages/parts.tsx の RING_PAGE_SIZE と同じ値にする
paginateList(document.getElementById('ranking-list'), 6, true);
['event-list', 'tournament-list'].forEach((id) => paginateList(document.getElementById(id)));
