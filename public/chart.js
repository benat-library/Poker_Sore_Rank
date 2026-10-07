// 累計Scoreの推移グラフ（SVGで自作。外部ライブラリは使わない）

// 色付きで表示する線の色（色覚の違いでも見分けやすい組み合わせ。順番は固定）
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
// 色付き以外の人の線
const OTHER_COLOR = '#d1d5db';
// 色が付いていない人を強調したときの色
const HIGHLIGHT_COLOR = '#111827';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
  return node;
}

// 目盛りの間隔を 1, 2, 5 × 10^n のきりのよい値にする
function niceStep(range) {
  const raw = range / 4 || 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

// 「2026-10-01」を「10/1」にする
function shortDate(date) {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

// スコア一覧から、人ごとの累計の推移を作る
// 戻り値：{ dates: 全員分の日付（昇順）, series: [{ name: 人の判定キー, label: 表示名, points: [{ date, amount, cumulative }] }] }
function buildCumulativeSeries(scores) {
  const byUser = new Map();
  const labels = new Map();
  scores.forEach((s) => {
    if (!byUser.has(s.player_key)) byUser.set(s.player_key, new Map());
    labels.set(s.player_key, s.user_name);
    const days = byUser.get(s.player_key);
    days.set(s.played_on, (days.get(s.played_on) || 0) + s.amount);
  });
  const dates = [...new Set(scores.map((s) => s.played_on))].sort();
  const series = [...byUser.entries()].map(([name, days]) => {
    let cumulative = 0;
    const points = [...days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, amount]) => ({ date, amount, cumulative: (cumulative += amount) }));
    return { name, label: labels.get(name), points };
  });
  return { dates, series };
}

// その日付時点での累計（その日より前に記録がなければ null）
function cumulativeAt(series, date) {
  let value = null;
  for (const p of series.points) {
    if (p.date > date) break;
    value = p.cumulative;
  }
  return value;
}

// グラフを描く
// colored: 色付きにする人の判定キー（順番に SERIES_COLORS を割り当てる）
// highlighted: 強調する人の判定キー（null なら強調なし）
function renderCumulativeChart(container, legendEl, data, colored, highlighted) {
  container.replaceChildren();
  legendEl.replaceChildren();
  const { dates, series } = data;
  if (dates.length < 2) return;

  const colorOf = new Map(colored.map((name, i) => [name, SERIES_COLORS[i]]));
  const labelOf = new Map(series.map((s) => [s.name, s.label]));

  const width = Math.max(container.clientWidth, 280);
  const height = 260;
  const margin = { top: 12, right: 76, bottom: 28, left: 60 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // 縦軸の範囲（0 を必ず含める）
  const values = series.flatMap((s) => s.points.map((p) => p.cumulative));
  const step = niceStep(Math.max(...values, 0) - Math.min(...values, 0));
  const yMin = Math.floor(Math.min(...values, 0) / step) * step;
  const yMax = Math.ceil(Math.max(...values, 0) / step) * step || step;
  const y = (v) => margin.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // 横軸は入力のあった日付を等間隔に並べる
  const indexOf = new Map(dates.map((d, i) => [d, i]));
  const x = (date) => margin.left + (indexOf.get(date) / (dates.length - 1)) * plotW;

  const chart = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '累計Scoreの推移' });

  // 目盛り線と縦軸ラベル
  for (let v = yMin; v <= yMax; v += step) {
    chart.append(svg('line', { x1: margin.left, x2: margin.left + plotW, y1: y(v), y2: y(v), class: v === 0 ? 'chart-zero' : 'chart-grid' }));
    const label = svg('text', { x: margin.left - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'chart-label' });
    label.textContent = v === 0 ? '0' : formatAmount(v);
    chart.append(label);
  }

  // 横軸ラベル（入力のあった日付すべて。狭くて重なる場合だけ間引く）
  const spacing = plotW / (dates.length - 1);
  const every = Math.max(1, Math.ceil(34 / spacing));
  dates.forEach((date, i) => {
    if (i % every !== 0 && i !== dates.length - 1) return;
    const label = svg('text', { x: x(date), y: height - 8, 'text-anchor': 'middle', class: 'chart-label' });
    label.textContent = shortDate(date);
    chart.append(label);
  });

  // 線の色と、強調時に薄くするかどうか
  const styleOf = (name) => {
    const color = colorOf.get(name) || (name === highlighted ? HIGHLIGHT_COLOR : OTHER_COLOR);
    const dimmed = highlighted !== null && name !== highlighted;
    const prominent = colorOf.has(name) || name === highlighted;
    return { color, dimmed, prominent };
  };

  // グレーの線を先に、色付きの線を上に重ねる
  // 初参加の日から最終日まで、参加しなかった日は前回までの累計のまま横ばいで伸ばす
  const ordered = [...series].sort((a, b) => Number(styleOf(a.name).prominent) - Number(styleOf(b.name).prominent) || Number(a.name === highlighted) - Number(b.name === highlighted));
  const endLabels = [];
  ordered.forEach((s) => {
    const { color, dimmed, prominent } = styleOf(s.name);
    const line = dates.filter((d) => d >= s.points[0].date).map((d) => [x(d), y(cumulativeAt(s, d))]);
    const d = line.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px},${py}`).join(' ');
    chart.append(svg('path', {
      d,
      class: 'chart-line',
      stroke: color,
      'stroke-width': prominent ? 2 : 1.5,
      opacity: dimmed ? 0.25 : 1,
    }));
    // 色付きの人は、参加した日に点を打つ
    if (prominent) {
      s.points.forEach((p) => chart.append(svg('circle', { cx: x(p.date), cy: y(p.cumulative), r: 3.5, fill: color, class: 'chart-dot', opacity: dimmed ? 0.25 : 1 })));
    }
    const last = s.points[s.points.length - 1];
    if (prominent && !dimmed) endLabels.push({ name: s.label, color, y: y(last.cumulative) });
  });

  // 色付きの線の右端に名前を付ける（重ならないよう上下にずらす）
  endLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    endLabels[i].y = Math.max(endLabels[i].y, endLabels[i - 1].y + 13);
  }
  endLabels.forEach((l) => {
    const label = svg('text', { x: margin.left + plotW + 6, y: l.y + 4, class: 'chart-end-label' });
    label.textContent = l.name.length > 6 ? `${l.name.slice(0, 6)}…` : l.name;
    chart.append(label);
  });

  // 凡例（色付きの人と「その他」）
  const legendNames = [...colored];
  if (highlighted && !colorOf.has(highlighted)) legendNames.push(highlighted);
  legendNames.forEach((name) => {
    legendEl.append(el('span', { class: 'legend-item' },
      el('span', { class: 'legend-swatch', style: `background:${styleOf(name).color}` }), labelOf.get(name)));
  });
  if (series.length > legendNames.length) {
    legendEl.append(el('span', { class: 'legend-item' }, el('span', { class: 'legend-swatch', style: `background:${OTHER_COLOR}` }), 'その他'));
  }

  // なぞる・タップすると、その日の時点の累計を表示する
  const crosshair = svg('line', { y1: margin.top, y2: margin.top + plotH, class: 'chart-crosshair', visibility: 'hidden' });
  chart.append(crosshair);
  const tooltip = el('div', { class: 'chart-tooltip', hidden: '' });

  function showAt(clientX) {
    const px = clientX - chart.getBoundingClientRect().left;
    const date = dates.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a));
    const cx = x(date);
    crosshair.setAttribute('x1', cx);
    crosshair.setAttribute('x2', cx);
    crosshair.setAttribute('visibility', 'visible');

    const rows = legendNames
      .map((name) => ({ name, value: cumulativeAt(series.find((s) => s.name === name), date) }))
      .filter((r) => r.value !== null)
      .sort((a, b) => b.value - a.value);
    tooltip.replaceChildren(
      el('div', { class: 'chart-tooltip-date' }, `${formatDay(date)} 時点の累計`),
      ...rows.map((r) => el('div', { class: 'chart-tooltip-row' },
        el('span', { class: 'legend-swatch', style: `background:${styleOf(r.name).color}` }),
        el('span', { class: 'chart-tooltip-name' }, labelOf.get(r.name)),
        el('strong', { class: amountClass(r.value) }, formatAmount(r.value))
      ))
    );
    tooltip.hidden = false;
    // グラフからはみ出さない位置に置く
    const left = Math.min(Math.max(cx - tooltip.offsetWidth / 2, 0), width - tooltip.offsetWidth);
    tooltip.style.left = `${left}px`;
  }
  function hide() {
    crosshair.setAttribute('visibility', 'hidden');
    tooltip.hidden = true;
  }
  chart.addEventListener('pointermove', (e) => showAt(e.clientX));
  chart.addEventListener('pointerdown', (e) => showAt(e.clientX));
  chart.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  // グラフ以外の場所をタップしたら消す（描き直すたびに前のグラフ用の登録は外す）
  container.hideTooltipController?.abort();
  container.hideTooltipController = new AbortController();
  document.addEventListener('pointerdown', (e) => { if (!chart.contains(e.target)) hide(); }, { signal: container.hideTooltipController.signal });

  container.append(chart, tooltip);
}
