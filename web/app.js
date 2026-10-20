/* MTGA Stats — interface */
"use strict";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  api: null, data: null, all: [], filtered: [], page: "overview",
  charts: {}, deckSel: null, cardsSide: "me",
};

/* ------------------------------------------------------------------ domínio */
const FORMAT_NAMES = {
  Standard: "Padrão", Historic: "Histórico", Explorer: "Explorer", Pioneer: "Pioneer",
  Timeless: "Atemporal", Alchemy: "Alquimia", HistoricBrawl: "Brawl Histórico", Brawl: "Brawl",
  StandardBrawl: "Brawl", Pauper: "Pauper", Limited: "Limitado",
};
const COMBOS = {
  "": "Incolor", W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde",
  WU: "Azorius", UB: "Dimir", BR: "Rakdos", RG: "Gruul", WG: "Selesnya", WB: "Orzhov", UR: "Izzet",
  BG: "Golgari", WR: "Boros", UG: "Simic", WUB: "Esper", UBR: "Grixis", BRG: "Jund", WRG: "Naya",
  WUG: "Bant", WBG: "Abzan", WUR: "Jeskai", UBG: "Sultai", WBR: "Mardu", URG: "Temur",
};
const COLOR_NAMES = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde" };
const RARITY_PT = { common: "Comum", uncommon: "Incomum", rare: "Rara", mythic: "Mítica", basic: "Básica", token: "Ficha" };

function formatOf(m) {
  const e = m.event || "";
  if (/Draft/i.test(e)) return "Draft";
  if (/Sealed/i.test(e)) return "Selado";
  if (/Jump_?In/i.test(e)) return "Jump In";
  if (/Precon/i.test(e)) return "Precon";
  if (/Brawl/i.test(e) || m.variant === "Brawl") {
    return /Historic/i.test(e) || m.deckFormat === "HistoricBrawl" ? "Brawl Histórico" : "Brawl";
  }
  if (FORMAT_NAMES[m.deckFormat]) return FORMAT_NAMES[m.deckFormat];
  for (const k of ["Historic", "Explorer", "Timeless", "Alchemy", "Pioneer", "Pauper"]) {
    if (e.includes(k)) return FORMAT_NAMES[k];
  }
  if (/Ladder|Play|Constructed|Standard/i.test(e)) return "Padrão";
  return m.deckFormat || e || "Outro";
}
function queueOf(m) {
  const e = m.event || "";
  if (/Ladder/i.test(e)) return "Ranqueada";
  if (/Draft|Sealed/i.test(e)) return "Limitado";
  if (/DirectGame/i.test(e)) return "Desafio direto";
  if (/(^|_)Play(_|$)/i.test(e)) return "Casual";
  return "Evento";
}
const sortColors = s => "WUBRG".split("").filter(c => s.includes(c)).join("");
const comboName = c => COMBOS[c] || `${c.length} cores`;
const card = id => state.data.cards[String(id)];

/* Cores que o deck realmente exige, pelos símbolos de mana: um híbrido como {(G/W)}
   só acrescenta cor se nenhuma das opções já estiver no deck; {(2/B)} é ignorado. */
function colorsOf(ids) {
  const pure = new Set(), hybrids = [];
  for (const id of ids) {
    const c = card(id);
    if (!c || c.is_land) continue;
    const syms = (c.cost || "").match(/\{[^}]+\}/g) || [];
    if (!syms.length) { for (const x of c.colors) pure.add(x); continue; }
    for (const s of syms) {
      const opts = s.replace(/[{}()]/g, "").split("/");
      const cols = opts.filter(o => o.length === 1 && "WUBRG".includes(o));
      if (opts.includes("P") || cols.length === 1 && opts.length === 1) cols.forEach(x => pure.add(x));
      else if (cols.length > 1) hybrids.push(cols);
    }
  }
  let s = [...pure].join("");
  for (const h of hybrids) if (!h.some(x => pure.has(x))) s += h.join("");
  return sortColors(s);
}

function enrich(m) {
  m.fmt = formatOf(m);
  m.queue = queueOf(m);
  m.bo = /Best2of3|BestTwoOutOfThree/i.test(m.winCondition || "") ? "Bo3" : "Bo1";
  m.limited = limitedInfo(m.event);
  m.date = new Date((m.start || m.end || 0) * 1000);
  const deckIds = [...m.main, ...m.command].map(x => x[0]);
  m.myColors = colorsOf(m.command.length ? m.command.map(x => x[0]) : deckIds) || colorsOf(deckIds);
  if (m.command.length) {  // Brawl: identidade do comandante
    m.myColors = sortColors(m.command.map(x => (card(x[0]) || {}).identity || "").join("")) || m.myColors;
  }
  const opp = new Set();
  m.games.forEach(g => g.opp_seen.forEach(id => opp.add(id)));
  m.oppSeen = opp;
  m.oppColors = colorsOf(opp);
  m.gw = m.games.filter(g => g.result === "win").length;
  m.gl = m.games.filter(g => g.result === "loss").length;
  m.turns = m.games.reduce((a, g) => a + (g.turns || 0), 0);
  m.deckKey = m.deckId || m.deckName;
  return m;
}

function wl(ms) {
  let w = 0, l = 0, d = 0;
  for (const m of ms) { if (m.result === "win") w++; else if (m.result === "loss") l++; else d++; }
  const n = w + l + d;
  return { w, l, d, n, wr: n ? w / n : null };
}
function groupBy(arr, fn) {
  const map = new Map();
  for (const x of arr) { const k = fn(x); if (!map.has(k)) map.set(k, []); map.get(k).push(x); }
  return map;
}

/* --------------------------------------------------------------- formatação */
const pct = x => x == null ? "—" : `${Math.round(x * 100)}%`;
const num = x => (x ?? 0).toLocaleString("pt-BR");
const fmtDate = d => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtDateTime = d => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function pips(c) {
  if (!c) return `<span class="pips"><span class="pip C">C</span></span>`;
  return `<span class="pips" title="${esc(comboName(c))}">${c.split("").map(x => `<span class="pip ${x}">${x}</span>`).join("")}</span>`;
}
function wrCell(wr) {
  if (wr == null) return "—";
  return `<span class="wr">${pct(wr)}<span class="meter"><b style="width:${Math.round(wr * 100)}%"></b></span></span>`;
}
function resultBadge(r) {
  const t = { win: "Vitória", loss: "Derrota", draw: "Empate" }[r] || "—";
  return `<span class="badge ${r}">${t}</span>`;
}
function cardName(id) {
  const c = card(id);
  return `<span class="cardname" data-card="${id}">${esc(c ? c.name : "#" + id)}</span>`;
}

/* ------------------------------------------------------------------ filtros */
const FILTERS = ["f-format", "f-queue", "f-bo", "f-period", "f-deck"];

function fillSelect(id, values, allLabel) {
  const el = $("#" + id);
  const cur = el.value;
  el.innerHTML = `<option value="">${allLabel}</option>` +
    values.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join("");
  if (values.some(([v]) => v === cur)) el.value = cur;
}

function buildFilterOptions() {
  const count = (fn) => [...groupBy(state.all, fn)].sort((a, b) => b[1].length - a[1].length);
  fillSelect("f-format", count(m => m.fmt).map(([k, v]) => [k, `${k} (${v.length})`]), "Todos");
  fillSelect("f-queue", count(m => m.queue).map(([k, v]) => [k, `${k} (${v.length})`]), "Todas");
  const fmt = $("#f-format").value;
  const decks = count(m => m.deckKey).filter(([, v]) => !fmt || v.some(m => m.fmt === fmt));
  fillSelect("f-deck", decks.map(([k, v]) => [k, `${v[v.length - 1].deckName} (${v.length})`]), "Todos");
}

function applyFilters() {
  const f = Object.fromEntries(FILTERS.map(id => [id, $("#" + id).value]));
  const days = +f["f-period"];
  let since = 0;
  if (days === 1) { const d = new Date(); d.setHours(0, 0, 0, 0); since = d.getTime(); }
  else if (days) since = Date.now() - days * 864e5;
  state.filtered = state.all.filter(m =>
    (!f["f-format"] || m.fmt === f["f-format"]) &&
    (!f["f-queue"] || m.queue === f["f-queue"]) &&
    (!f["f-bo"] || m.bo === f["f-bo"]) &&
    (!f["f-deck"] || m.deckKey === f["f-deck"]) &&
    (!since || m.date.getTime() >= since));
  $("#filter-count").textContent = `${num(state.filtered.length)} de ${num(state.all.length)} partidas`;
}

/* ------------------------------------------------------------------ gráficos */
const valueLabels = {
  id: "valueLabels",
  afterDatasetsDraw(chart, _a, o) {
    if (!o || !o.format) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(o.datasetIndex ?? chart.data.datasets.length - 1);
    ctx.save();
    ctx.fillStyle = cssVar("--text-2");
    ctx.font = "12px system-ui, 'Segoe UI', sans-serif";
    meta.data.forEach((el, i) => {
      const t = o.format(i);
      if (!t) return;
      if (chart.options.indexAxis === "y") {
        ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(t, el.x + 6, el.y);
      } else {
        ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(t, el.x, el.y - 4);
      }
    });
    ctx.restore();
  },
};
const refLine = {
  id: "refLine",
  beforeDatasetsDraw(chart, _a, o) {
    if (!o || o.value == null) return;
    const horiz = chart.options.indexAxis === "y";
    const scale = horiz ? chart.scales.x : chart.scales.y;
    const p = scale.getPixelForValue(o.value);
    const { ctx, chartArea: a } = chart;
    ctx.save();
    ctx.strokeStyle = cssVar("--muted"); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    if (horiz) { ctx.moveTo(p, a.top); ctx.lineTo(p, a.bottom); } else { ctx.moveTo(a.left, p); ctx.lineTo(a.right, p); }
    ctx.stroke(); ctx.restore();
  },
};
const centerText = {
  id: "centerText",
  afterDraw(chart, _a, o) {
    if (!o || !o.text) return;
    const { ctx, chartArea: a } = chart;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save(); ctx.textAlign = "center";
    ctx.fillStyle = cssVar("--text"); ctx.font = "650 28px system-ui, 'Segoe UI', sans-serif";
    ctx.textBaseline = "bottom"; ctx.fillText(o.text, x, y + 6);
    ctx.fillStyle = cssVar("--text-2"); ctx.font = "12px system-ui, 'Segoe UI', sans-serif";
    ctx.textBaseline = "top"; ctx.fillText(o.sub || "", x, y + 8);
    ctx.restore();
  },
};
if (window.Chart) Chart.register(valueLabels, refLine, centerText);

function chartDefaults() {
  Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = cssVar("--muted");
  Chart.defaults.borderColor = cssVar("--grid");
  Chart.defaults.animation.duration = 250;
  Chart.defaults.maintainAspectRatio = false;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: cssVar("--surface"), titleColor: cssVar("--text"), bodyColor: cssVar("--text-2"),
    borderColor: cssVar("--border"), borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
    usePointStyle: true,
  });
  Chart.defaults.plugins.legend.display = false;
}
const series = i => cssVar(`--s${(i % 8) + 1}`);

function draw(id, cfg, empty) {
  state.charts[id]?.destroy();
  delete state.charts[id];
  const canvas = $("#" + id);
  const wrap = canvas.parentElement;
  $(".empty", wrap)?.remove();
  canvas.hidden = !!empty;
  if (empty) {
    wrap.insertAdjacentHTML("beforeend", `<div class="empty">${empty}</div>`);
    return;
  }
  state.charts[id] = new Chart(canvas, cfg);
}
function sizeFor(wrapId, rows, per = 30) {
  $("#" + wrapId).style.height = `${Math.max(140, rows * per + 48)}px`;
}
function legend(id, items) {
  $("#" + id).innerHTML = items.map(([label, color]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join("");
}
const axisWR = { min: 0, max: 1, ticks: { callback: v => `${Math.round(v * 100)}%`, stepSize: 0.25 }, grid: { color: cssVar("--grid") }, border: { display: false } };
const noGrid = { grid: { display: false }, border: { color: cssVar("--axis") } };

/* barra empilhada V/D horizontal */
function wlBars(id, wrapId, legendId, rows) {
  sizeFor(wrapId, rows.length);
  legend(legendId, [["Vitórias", cssVar("--win")], ["Derrotas", cssVar("--loss")]]);
  const surface = cssVar("--surface");
  draw(id, {
    type: "bar",
    data: {
      labels: rows.map(r => r.label),
      datasets: [
        { label: "Vitórias", data: rows.map(r => r.s.w), backgroundColor: cssVar("--win"), borderRadius: 0, borderSkipped: false,
          borderColor: surface, borderWidth: { right: 0 }, maxBarThickness: 18 },
        { label: "Derrotas", data: rows.map(r => r.s.l), backgroundColor: cssVar("--loss"),
          borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: false,
          borderColor: surface, borderWidth: { left: 2 }, maxBarThickness: 18 },
      ],
    },
    options: {
      indexAxis: "y", layout: { padding: { right: 70 } },
      scales: { x: { stacked: true, ticks: { precision: 0 }, grid: { color: cssVar("--grid") }, border: { display: false } },
                y: { stacked: true, ...noGrid, ticks: { color: cssVar("--text-2") } } },
      plugins: {
        tooltip: { mode: "index", intersect: false, callbacks: { footer: it => `Taxa de vitória: ${pct(rows[it[0].dataIndex].s.wr)}` } },
        valueLabels: { format: i => `${pct(rows[i].s.wr)} · ${rows[i].s.n}` },
      },
    },
  }, rows.length ? null : "Sem partidas no filtro atual");
}

/* barra de taxa de vitória (série única) */
function wrBars(id, wrapId, rows, { horizontal = true, sub = r => `${r.s.n} partidas` } = {}) {
  if (horizontal) sizeFor(wrapId, rows.length);
  draw(id, {
    type: "bar",
    data: { labels: rows.map(r => r.label), datasets: [{ label: "Taxa de vitória", data: rows.map(r => r.s.wr ?? 0),
      backgroundColor: cssVar("--accent"), borderRadius: 4, borderSkipped: "start", maxBarThickness: horizontal ? 18 : 56 }] },
    options: {
      indexAxis: horizontal ? "y" : "x",
      layout: { padding: horizontal ? { right: 90 } : { top: 22 } },
      scales: horizontal ? { x: axisWR, y: { ...noGrid, ticks: { color: cssVar("--text-2") } } }
                         : { y: axisWR, x: { ...noGrid, ticks: { color: cssVar("--text-2") } } },
      plugins: {
        refLine: { value: 0.5 },
        tooltip: { callbacks: { label: it => { const r = rows[it.dataIndex]; return ` ${pct(r.s.wr)} — ${r.s.w}V / ${r.s.l}D`; } } },
        valueLabels: { datasetIndex: 0, format: i => horizontal ? `${pct(rows[i].s.wr)} · ${sub(rows[i])}` : pct(rows[i].s.wr) },
      },
    },
  }, rows.length ? null : "Sem dados no filtro atual");
}

/* linha de taxa de vitória ao longo das partidas */
function trendLine(id, ms) {
  const sorted = [...ms].sort((a, b) => a.date - b.date);
  const roll = [], cum = [];
  let w = 0;
  sorted.forEach((m, i) => {
    if (m.result === "win") w++;
    cum.push(w / (i + 1));
    const win = sorted.slice(Math.max(0, i - 9), i + 1);
    roll.push(win.filter(x => x.result === "win").length / win.length);
  });
  draw(id, {
    type: "line",
    data: {
      labels: sorted.map(m => fmtDateTime(m.date)),
      datasets: [
        // com até 10 partidas a média móvel é igual à acumulada
        { label: "Acumulada", data: cum, borderColor: series(0), backgroundColor: series(0), borderWidth: 2, pointRadius: sorted.length > 40 ? 0 : 3, pointHoverRadius: 5, tension: 0.25 },
        ...(sorted.length > 10 ? [{ label: "Média móvel (10)", data: roll, borderColor: series(1), backgroundColor: series(1), borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.25 }] : []),
      ],
    },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: { y: axisWR, x: { ...noGrid, ticks: { maxTicksLimit: 6, maxRotation: 0 } } },
      plugins: {
        legend: { display: true, position: "top", align: "end", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded", color: cssVar("--text-2") } },
        refLine: { value: 0.5 },
        tooltip: { callbacks: { label: it => ` ${it.dataset.label}: ${pct(it.parsed.y)}`,
          afterBody: it => { const m = sorted[it[0].dataIndex]; return `${m.result === "win" ? "Vitória" : m.result === "loss" ? "Derrota" : "Empate"} vs ${m.opponent || "?"} · ${m.deckName}`; } } },
      },
    },
  }, sorted.length >= 2 ? null : "São necessárias ao menos 2 partidas");
}

/* ----------------------------------------------------------------- tabelas */
function table(el, cols, rows, { onRow, sortKey, sortDir = -1, rowAttrs } = {}) {
  el = typeof el === "string" ? $(el) : el;
  const st = el._sort || { key: sortKey ?? null, dir: sortDir };
  el._sort = st;
  const col = cols.find(c => c.key === st.key);
  if (col) {
    const val = col.sort || (r => r[col.key]);
    rows = [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * st.dir;
    });
  }
  if (!rows.length) { el.innerHTML = `<div class="empty" style="height:80px">Nada para mostrar no filtro atual</div>`; return; }
  el.innerHTML = `<table><thead><tr>${cols.map(c =>
    `<th data-k="${c.key}" class="${c.num ? "num" : ""} ${c.cls === "center" ? "center" : ""} ${st.key === c.key ? "sorted" + (st.dir > 0 ? " asc" : "") : ""}">${c.label}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${onRow ? "clickable" : ""}" ${rowAttrs ? rowAttrs(r) : ""}>${cols.map(c =>
      `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${c.html ? c.html(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $$("th", el).forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    st.dir = st.key === k ? -st.dir : -1;
    st.key = k;
    table(el, cols, rows, { onRow, rowAttrs });
  });
  if (onRow) $$("tbody tr", el).forEach(tr => tr.onclick = (ev) => onRow(rows[+tr.dataset.i], tr, ev));
}

/* ------------------------------------------------------------- visão geral */
function streaks(ms) {
  const sorted = [...ms].sort((a, b) => a.date - b.date);
  let best = 0, run = 0;
  for (const m of sorted) { run = m.result === "win" ? run + 1 : 0; best = Math.max(best, run); }
  let cur = 0, kind = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i].result;
    if (kind === null) kind = r;
    if (r !== kind) break;
    cur++;
  }
  return { cur, kind, best };
}

function renderOverview() {
  const ms = state.filtered;
  const s = wl(ms);
  const games = ms.flatMap(m => m.games);
  const gw = games.filter(g => g.result === "win").length, gl = games.filter(g => g.result === "loss").length;
  const st = streaks(ms);
  const decks = new Set(ms.map(m => m.deckKey)).size;
  const kpi = (label, value, sub = "", extra = "") => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div>${extra}</div>`;
  $("#kpis").innerHTML = [
    kpi("Partidas", num(s.n), `${decks} deck${decks === 1 ? "" : "s"} usado${decks === 1 ? "" : "s"}`),
    kpi("Taxa de vitória", pct(s.wr), `${s.w}V – ${s.l}D${s.d ? ` – ${s.d}E` : ""}`,
      s.n ? `<div class="bar"><b style="width:${(s.w / s.n) * 100}%"></b></div>` : ""),
    kpi("Jogos (games)", `${gw}–${gl}`, `taxa por jogo ${pct(gw + gl ? gw / (gw + gl) : null)}`),
    kpi("Sequência atual", st.cur ? `${st.cur} ${st.kind === "win" ? (st.cur > 1 ? "vitórias" : "vitória") : st.kind === "loss" ? (st.cur > 1 ? "derrotas" : "derrota") : "empates"}` : "—",
      `melhor: ${st.best} vitória${st.best === 1 ? "" : "s"} seguida${st.best === 1 ? "" : "s"}`),
  ].join("");

  // resultados por dia (ou semana quando o período é longo)
  const byDay = groupBy([...ms].sort((a, b) => a.date - b.date), m => dayKey(m.date));
  let buckets = [...byDay];
  let weekly = false;
  if (buckets.length > 45) {
    weekly = true;
    buckets = [...groupBy([...ms].sort((a, b) => a.date - b.date), m => {
      const d = new Date(m.date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d);
    })];
  }
  const labels = buckets.map(([k]) => { const [y, mo, d] = k.split("-"); return `${d}/${mo}${weekly ? "" : ""}`; });
  const ws = buckets.map(([, v]) => wl(v).w), ls = buckets.map(([, v]) => wl(v).l);
  legend("lg-daily", [["Vitórias", cssVar("--win")], ["Derrotas", cssVar("--loss")]]);
  const surface = cssVar("--surface");
  draw("c-daily", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Vitórias", data: ws, backgroundColor: cssVar("--win"), maxBarThickness: 28, borderSkipped: false,
        borderRadius: c => ls[c.dataIndex] ? 0 : { topLeft: 4, topRight: 4 } },
      { label: "Derrotas", data: ls, backgroundColor: cssVar("--loss"), maxBarThickness: 28, borderSkipped: false,
        borderRadius: { topLeft: 4, topRight: 4 }, borderColor: surface, borderWidth: c => ws[c.dataIndex] ? { bottom: 2 } : 0 },
    ] },
    options: {
      scales: { x: { stacked: true, ...noGrid, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
                y: { stacked: true, ticks: { precision: 0 }, grid: { color: cssVar("--grid") }, border: { display: false } } },
      plugins: { tooltip: { mode: "index", intersect: false, callbacks: {
        title: it => (weekly ? "Semana de " : "") + buckets[it[0].dataIndex][0].split("-").reverse().join("/"),
        footer: it => `Taxa de vitória: ${pct(wl(buckets[it[0].dataIndex][1]).wr)}` } } },
    },
  }, ms.length ? null : "Sem partidas no filtro atual");

  // rosca V/D
  draw("c-donut", {
    type: "doughnut",
    data: { labels: ["Vitórias", "Derrotas", "Empates"], datasets: [{ data: [s.w, s.l, s.d],
      backgroundColor: [cssVar("--win"), cssVar("--loss"), cssVar("--draw")], borderColor: surface, borderWidth: 2, hoverOffset: 4 }] },
    options: {
      cutout: "70%",
      plugins: {
        legend: { display: true, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded", color: cssVar("--text-2"),
          filter: (it, d) => d.datasets[0].data[it.index] > 0 } },
        centerText: { text: pct(s.wr), sub: "taxa de vitória" },
        tooltip: { callbacks: { label: it => ` ${it.label}: ${it.parsed} (${pct(it.parsed / s.n)})` } },
      },
    },
  }, s.n ? null : "Sem partidas");

  trendLine("c-trend", ms);

  // play/draw por jogo
  const gstat = gs => { const w = gs.filter(g => g.result === "win").length, l = gs.filter(g => g.result === "loss").length; return { w, l, n: w + l, wr: w + l ? w / (w + l) : null }; };
  const pd = [
    { label: "Play", s: gstat(games.filter(g => g.on_play === true)) },
    { label: "Draw", s: gstat(games.filter(g => g.on_play === false)) },
  ];
  wrBars("c-play", null, pd, { horizontal: false });
  if (state.charts["c-play"]) {
    state.charts["c-play"].options.plugins.valueLabels.format = i => pd[i].s.n ? `${pct(pd[i].s.wr)} (${pd[i].s.n})` : "—";
    state.charts["c-play"].options.plugins.tooltip.callbacks.label = it => { const r = pd[it.dataIndex].s; return ` ${pct(r.wr)} — ${r.w}V / ${r.l}D em ${r.n} jogos`; };
    state.charts["c-play"].update();
  }

  const fmts = [...groupBy(ms, m => m.fmt)].map(([k, v]) => ({ label: k, s: wl(v) })).sort((a, b) => b.s.n - a.s.n);
  wrBars("c-fmt", "w-fmt", fmts);

  // decks de draft/selado são de uso único: ficam de fora do ranking
  const decksTop = [...groupBy(ms.filter(m => !m.limited), m => m.deckKey)].map(([, v]) => ({ label: trunc(v[v.length - 1].deckName, 28), s: wl(v) }))
    .sort((a, b) => b.s.n - a.s.n).slice(0, 8);
  wlBars("c-topdecks", "w-topdecks", "lg-topdecks", decksTop);
}
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;

/* ----------------------------------------------------------------- formatos */
function renderFormats() {
  const ms = state.filtered;
  const allFormats = [...groupBy(state.all, m => m.fmt)].sort((a, b) => b[1].length - a[1].length).map(([k]) => k);
  const colorOf = f => { const i = allFormats.indexOf(f); return i < 7 ? series(i) : cssVar("--muted"); };
  const rows = [...groupBy(ms, m => m.fmt)].map(([k, v]) => {
    const gs = v.flatMap(m => m.games);
    return { label: k, fmt: k, s: wl(v), n: v.length, w: wl(v).w, l: wl(v).l, wr: wl(v).wr,
      gw: gs.filter(g => g.result === "win").length, gl: gs.filter(g => g.result === "loss").length,
      turns: gs.length ? gs.reduce((a, g) => a + g.turns, 0) / gs.length : null,
      decks: new Set(v.map(m => m.deckKey)).size,
      top: [...groupBy(v, m => m.deckKey)].sort((a, b) => b[1].length - a[1].length)[0][1][0].deckName };
  }).sort((a, b) => b.n - a.n);

  // participação: até 7 formatos + "Outros"
  const share = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((a, r) => a + r.n, 0);
  const labels = [...share.map(r => r.fmt), ...(rest ? ["Outros"] : [])];
  const data = [...share.map(r => r.n), ...(rest ? [rest] : [])];
  draw("c-fmtshare", {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: labels.map(l => l === "Outros" ? cssVar("--muted") : colorOf(l)), borderColor: cssVar("--surface"), borderWidth: 2 }] },
    options: { cutout: "62%", plugins: {
      legend: { display: true, position: "right", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded", color: cssVar("--text-2"),
        generateLabels: ch => ch.data.labels.map((l, i) => ({ text: `${l}  ${data[i]} (${pct(data[i] / ms.length)})`, fillStyle: ch.data.datasets[0].backgroundColor[i], strokeStyle: "transparent", pointStyle: "rectRounded", index: i, fontColor: cssVar("--text-2") })) } },
      centerText: { text: num(ms.length), sub: "partidas" },
      tooltip: { callbacks: { label: it => ` ${it.label}: ${it.parsed} partidas (${pct(it.parsed / ms.length)})` } } } },
  }, ms.length ? null : "Sem partidas");

  wlBars("c-fmtwl", "w-fmtwl", "lg-fmtwl", rows);

  table("#t-formats", [
    { key: "fmt", label: "Formato" },
    { key: "n", label: "Partidas", num: true },
    { key: "w", label: "Vitórias", num: true },
    { key: "l", label: "Derrotas", num: true },
    { key: "wr", label: "% Vitória", num: true, html: r => wrCell(r.wr) },
    { key: "gw", label: "Jogos V–D", num: true, html: r => `${r.gw}–${r.gl}` },
    { key: "turns", label: "Turnos/jogo", num: true, html: r => r.turns ? r.turns.toFixed(1) : "—" },
    { key: "decks", label: "Decks", num: true },
    { key: "top", label: "Deck mais usado", cls: "name" },
  ], rows, { sortKey: "n" });

  const ev = [...groupBy(ms, m => m.event)].map(([k, v]) => ({ event: k, fmt: v[0].fmt, queue: v[0].queue, bo: v[0].bo, n: v.length, ...wl(v) }));
  table("#t-events", [
    { key: "event", label: "Evento" }, { key: "fmt", label: "Formato" }, { key: "queue", label: "Fila" }, { key: "bo", label: "Tipo" },
    { key: "n", label: "Partidas", num: true }, { key: "w", label: "V", num: true }, { key: "l", label: "D", num: true },
    { key: "wr", label: "% Vitória", num: true, html: r => wrCell(r.wr) },
  ], ev, { sortKey: "n" });
}

/* -------------------------------------------------------------------- decks */
function deckRows(ms) {
  return [...groupBy(ms, m => m.deckKey)].map(([k, v]) => {
    const last = v.reduce((a, b) => a.date > b.date ? a : b);
    const s = wl(v);
    const gs = v.flatMap(m => m.games);
    const pw = gs.filter(g => g.on_play === true), dw = gs.filter(g => g.on_play === false);
    const r = x => x.length ? x.filter(g => g.result === "win").length / x.length : null;
    return { key: k, name: last.deckName, fmt: last.fmt, colors: last.myColors, n: s.n, w: s.w, l: s.l, wr: s.wr,
      play: r(pw), draw: r(dw), last: last.date, matches: v };
  });
}

function renderDecks() {
  if (state.deckSel) {
    const rows = deckRows(state.filtered.filter(m => m.deckKey === state.deckSel));
    if (rows.length) return renderDeckDetail(rows[0]);
    state.deckSel = null;
  }
  $("#deck-list").hidden = false;
  $("#deck-detail").hidden = true;
  table("#t-decks", [
    { key: "name", label: "Deck", cls: "name", html: r => `<b>${esc(r.name)}</b>` },
    { key: "colors", label: "Cores", html: r => pips(r.colors) },
    { key: "fmt", label: "Formato" },
    { key: "n", label: "Partidas", num: true },
    { key: "w", label: "V", num: true },
    { key: "l", label: "D", num: true },
    { key: "wr", label: "% Vitória", num: true, html: r => wrCell(r.wr) },
    { key: "play", label: "% Play", num: true, html: r => pct(r.play) },
    { key: "draw", label: "% Draw", num: true, html: r => pct(r.draw) },
    { key: "last", label: "Última partida", num: true, html: r => fmtDateTime(r.last) },
  ], deckRows(state.filtered), { sortKey: "n", onRow: r => { state.deckSel = r.key; renderDecks(); $("main").scrollTop = 0; } });
}

function cardPerformance(ms, side) {
  /* Para cada carta: jogos em que foi vista e taxa de vitória nesses jogos (e nos demais). */
  const stats = new Map();
  let totalGames = 0, totalWins = 0;
  for (const m of ms) {
    for (const g of m.games) {
      if (g.result !== "win" && g.result !== "loss") continue;
      totalGames++;
      const won = g.result === "win";
      if (won) totalWins++;
      for (const id of (side === "opp" ? g.opp_seen : g.my_seen)) {
        let s = stats.get(id);
        if (!s) { s = { id, games: 0, wins: 0, matches: new Set() }; stats.set(id, s); }
        s.games++; if (won) s.wins++; s.matches.add(m.id);
      }
    }
  }
  return { stats, totalGames, totalWins };
}

/* Versões de um deck: uma nova versão começa quando a lista jogada muda de uma partida para a outra. */
function deckVersions(ms) {
  const counts = m => {
    const c = new Map();
    for (const [id, n] of [...m.main, ...m.command]) c.set(id, (c.get(id) || 0) + n);
    return c;
  };
  const sig = c => [...c].sort((a, b) => a[0] - b[0]).map(x => x.join("x")).join(",");
  const versions = [];
  for (const m of [...ms].sort((a, b) => a.date - b.date)) {
    if (!m.main.length) continue;               // partida sem lista registrada
    const c = counts(m), s = sig(c);
    const cur = versions[versions.length - 1];
    if (cur && cur.sig === s) { cur.matches.push(m); continue; }
    const added = [], removed = [];
    if (cur) {
      for (const [id, n] of c) if (n > (cur.cards.get(id) || 0)) added.push([id, n - (cur.cards.get(id) || 0)]);
      for (const [id, n] of cur.cards) if (n > (c.get(id) || 0)) removed.push([id, n - (c.get(id) || 0)]);
    }
    versions.push({ sig: s, cards: c, matches: [m], added, removed, size: [...c.values()].reduce((a, b) => a + b, 0) });
  }
  return versions;
}

function renderDeckHistory(deckKey) {
  // usa todas as partidas do deck (ignora o filtro de período) para o histórico ficar completo
  const versions = deckVersions(state.all.filter(m => m.deckKey === deckKey));
  const el = $("#deck-history");
  if (!versions.length) { el.innerHTML = `<div class="empty" style="height:60px">Nenhuma lista registrada para este deck</div>`; return; }
  const byName = (a, b) => (card(a[0])?.name || "").localeCompare(card(b[0])?.name || "");
  const list = (items, sign) => items.sort(byName).map(([id, n]) => `<span class="chg ${sign === "+" ? "in" : "out"}">${sign}${n} ${cardName(id)}</span>`).join("");
  el.innerHTML = versions.map((v, i) => {
    const s = wl(v.matches), first = v.matches[0].date, last = v.matches[v.matches.length - 1].date;
    const changes = i === 0
      ? `<div class="muted small">Primeira lista registrada · ${v.size} cartas</div>`
      : `<div class="chg-cols">
           <div><h4>Entraram</h4><div class="chips">${list(v.added, "+") || "<span class='muted'>—</span>"}</div></div>
           <div><h4>Saíram</h4><div class="chips">${list(v.removed, "−") || "<span class='muted'>—</span>"}</div></div>
         </div>`;
    return `<div class="version">
      <div class="version-h">
        <b>Versão ${i + 1}</b>${i === versions.length - 1 ? ` <span class="badge">atual</span>` : ""}
        <span class="muted small">${fmtDateTime(first)}${v.matches.length > 1 ? ` → ${fmtDateTime(last)}` : ""}</span>
        <span class="spacer"></span>
        <span class="small">${s.n} partida${s.n === 1 ? "" : "s"} · <b>${s.w}–${s.l}</b> · ${pct(s.wr)}</span>
      </div>${changes}</div>`;
  }).reverse().join("");
}

/* Lista visual do deck (versão atual): colunas por valor de mana, comandante antes e terrenos no fim. */
function renderDeckVisual(deckKey) {
  const versions = deckVersions(state.all.filter(m => m.deckKey === deckKey));
  const el = $("#deck-visual");
  if (!versions.length) { el.innerHTML = `<div class="empty" style="height:60px">Nenhuma lista registrada para este deck</div>`; return; }
  const cur = versions[versions.length - 1];
  const commander = new Set(cur.matches[cur.matches.length - 1].command.map(x => x[0]));
  // edições diferentes da mesma carta viram uma pilha só
  const byName = new Map();
  for (const [id, n] of cur.cards) {
    const k = (commander.has(id) ? "cmd:" : "") + (card(id)?.name_en || id);
    const e = byName.get(k);
    if (e) e[1] += n; else byName.set(k, [id, n]);
  }
  const cols = new Map();
  for (const [id, n] of byName.values()) {
    const c = card(id) || {};
    const key = commander.has(id) ? "cmd" : c.is_land ? "land" : Math.min(7, c.cmc ?? 0);
    if (!cols.has(key)) cols.set(key, []);
    cols.get(key).push([id, n]);
  }
  const order = ["cmd", 0, 1, 2, 3, 4, 5, 6, 7, "land"];
  const label = k => k === "cmd" ? "Comandante" : k === "land" ? "Terrenos" : k === 7 ? "7+" : String(k);
  const colorRank = c => { const s = sortColors(c?.colors || ""); return s.length > 1 ? 5 : s ? "WUBRG".indexOf(s) : 6; };
  const byColorName = (a, b) => (colorRank(card(a[0])) - colorRank(card(b[0]))) || (card(a[0])?.name || "").localeCompare(card(b[0])?.name || "");
  $("#deck-list-sub").textContent = `${cur.size} cartas · versão ${versions.length} (atual) · por valor de mana, do menor para o maior`;
  el.innerHTML = order.filter(k => cols.has(k)).map(k => {
    const items = cols.get(k).sort(byColorName);
    const count = items.reduce((a, [, n]) => a + n, 0);
    return `<div class="dv-col"><div class="dv-h"><span>${label(k)}</span><span class="muted">${count}</span></div>
      <div class="dv-stack">${items.map(([id, n]) => {
        const c = card(id) || {};
        return `<div class="dv-card" data-card="${id}"><img data-id="${id}" alt="${esc(c.name || "#" + id)}">
          <span class="dv-name">${esc(c.name || "#" + id)}<br><span class="muted">${esc(c.cost || "")}</span></span>
          ${n > 1 ? `<b class="dv-qty">x${n}</b>` : ""}</div>`;
      }).join("")}</div></div>`;
  }).join("");
  loadCardImages($$("img[data-id]", el));
}

/* Imagens das cartas. O app descobre uma única vez o endereço final de cada imagem
   (cards.scryfall.io, sem limite de pedidos) e guarda no banco; cartas já conhecidas
   carregam direto, e o cache da janela evita baixar de novo. */
const arenaImg = id => `https://api.scryfall.com/cards/arena/${id}?format=image&version=normal`;
const canResolve = () => !!state.api?.resolve_images;

async function resolveImages(ids) {
  let res = {};
  try { res = await state.api.resolve_images(ids.map(Number)); } catch (e) { /* sem rede */ }
  for (const [id, url] of Object.entries(res)) { const c = card(id); if (c && url) c.img = url; }
  return res;
}
async function imageUrl(id) {
  const c = card(id);
  if (c?.img) return c.img;
  if (!canResolve()) return arenaImg(id);                 // modo navegador (desenvolvimento)
  return (await resolveImages([id]))[id] || "";
}
function setCardImg(img, url) {
  const box = img.closest(".dv-card");
  img.onload = () => box?.classList.add("loaded");
  img.src = url;
}
async function loadCardImages(imgs) {
  const missing = [];
  for (const img of imgs) {
    const c = card(img.dataset.id);
    if (c?.img) setCardImg(img, c.img); else missing.push(img);
  }
  if (!missing.length) return;
  if (!canResolve()) {                                     // modo navegador: espaça os pedidos à API
    missing.forEach((img, i) => setTimeout(() => img.isConnected && setCardImg(img, arenaImg(img.dataset.id)), i * 110));
    return;
  }
  const ids = [...new Set(missing.map(img => img.dataset.id))];
  for (let i = 0; i < ids.length; i += 10) {
    if (!missing.some(img => img.isConnected)) return;   // saiu da tela
    const chunk = ids.slice(i, i + 10);
    const res = await resolveImages(chunk);
    for (const img of missing) if (chunk.includes(img.dataset.id) && res[img.dataset.id]) setCardImg(img, res[img.dataset.id]);
  }
}

function renderDeckDetail(d) {
  $("#deck-list").hidden = true;
  const el = $("#deck-detail");
  el.hidden = false;
  const ms = d.matches;
  const gs = ms.flatMap(m => m.games);
  const gw = gs.filter(g => g.result === "win").length, gl = gs.filter(g => g.result === "loss").length;
  const avgTurns = gs.length ? (gs.reduce((a, g) => a + g.turns, 0) / gs.length).toFixed(1) : "—";
  el.innerHTML = `
    <div class="page">
      <div><button class="back" id="deck-back">← Todos os decks</button></div>
      <div class="deck-head"><h2>${esc(d.name)}</h2>${pips(d.colors)}<span class="muted">${esc(d.fmt)}</span></div>
      <div class="kpis">
        <div class="kpi"><div class="label">Partidas</div><div class="value">${d.n}</div><div class="sub">última: ${fmtDateTime(d.last)}</div></div>
        <div class="kpi"><div class="label">Taxa de vitória</div><div class="value">${pct(d.wr)}</div><div class="sub">${d.w}V – ${d.l}D</div><div class="bar"><b style="width:${(d.w / d.n) * 100}%"></b></div></div>
        <div class="kpi"><div class="label">Jogos (games)</div><div class="value">${gw}–${gl}</div><div class="sub">&nbsp;</div></div>
        <div class="kpi"><div class="label">Play</div><div class="value">${pct(d.play)}</div><div class="sub">${gs.filter(g => g.on_play === true).length} jogos</div></div>
        <div class="kpi"><div class="label">Draw</div><div class="value">${pct(d.draw)}</div><div class="sub">${gs.filter(g => g.on_play === false).length} jogos</div></div>
        <div class="kpi"><div class="label">Turnos por jogo</div><div class="value">${avgTurns}</div><div class="sub">média</div></div>
      </div>
      <div class="grid g-1-1">
        <div class="card"><div class="card-h"><h3>Taxa de vitória ao longo do tempo</h3></div><div class="chart h240"><canvas id="c-deck-trend"></canvas></div></div>
        <div class="card"><div class="card-h"><h3>Contra cada combinação de cores</h3></div><div class="chart" id="w-deck-opp"><canvas id="c-deck-opp"></canvas></div></div>
      </div>
      <div class="card"><div class="card-h"><h3>Histórico de mudanças</h3>
        <span class="muted small">cartas que entraram e saíram entre uma partida e outra, com o desempenho de cada versão</span></div>
        <div id="deck-history" class="history"></div></div>
      <div class="card"><div class="card-h"><h3>Lista do deck</h3>
        <span class="muted small" id="deck-list-sub"></span></div>
        <div id="deck-visual" class="deck-visual"></div></div>
    </div>`;
  $("#deck-back").onclick = () => { state.deckSel = null; renderDecks(); };
  renderDeckHistory(d.key);
  trendLine("c-deck-trend", ms);
  const opp = [...groupBy(ms, m => m.oppColors)].map(([k, v]) => ({ label: comboName(k), s: wl(v) })).sort((a, b) => b.s.n - a.s.n).slice(0, 12);
  wrBars("c-deck-opp", "w-deck-opp", opp);

  renderDeckVisual(d.key);
}

/* ------------------------------------------------------------------- cartas */
function renderCards() {
  const side = state.cardsSide;
  const ms = state.filtered;
  const q = $("#cards-search").value.trim().toLowerCase();
  const minG = +$("#cards-min").value;
  const lands = $("#cards-lands").checked;
  const { stats } = cardPerformance(ms, side);
  // em quantas partidas a carta estava no seu deck
  const inDeck = new Map();
  if (side === "me") for (const m of ms) for (const [id] of [...m.main, ...m.command]) inDeck.set(id, (inDeck.get(id) || 0) + 1);

  let rows = [...stats.values()].map(s => {
    const c = card(s.id) || {};
    return { id: s.id, name: c.name || "#" + s.id, name_en: c.name_en || "", colors: sortColors(c.colors || ""), rarity: c.rarity || "",
      type: c.types || "", cmc: c.cmc ?? null, cost: c.cost || "", land: !!c.is_land, token: !!c.token,
      games: s.games, matches: s.matches.size, wr: s.games ? s.wins / s.games : null, deck: inDeck.get(s.id) || 0 };
  }).filter(r => !r.token && (lands || !r.land));
  const forCurve = rows;
  rows = rows.filter(r => r.games >= minG && (!q || r.name.toLowerCase().includes(q) || r.name_en.toLowerCase().includes(q)));

  $("#cards-chart-title").textContent = side === "me" ? "Suas cartas mais vistas" : "Cartas que você mais enfrentou";
  $("#cards-table-title").textContent = side === "me" ? "Desempenho das suas cartas" : "Cartas dos oponentes";
  $("#cards-hint").textContent = side === "me"
    ? "taxa de vitória nos jogos em que a carta foi comprada ou jogada"
    : "sua taxa de vitória nos jogos em que o oponente mostrou a carta";

  const top = [...rows].sort((a, b) => b.games - a.games).slice(0, 12);
  sizeFor("w-cards", top.length, 26);
  draw("c-cards", {
    type: "bar",
    data: { labels: top.map(r => trunc(r.name, 24)), datasets: [{ label: "Jogos", data: top.map(r => r.games),
      backgroundColor: cssVar("--accent"), borderRadius: 4, borderSkipped: "start", maxBarThickness: 16 }] },
    options: { indexAxis: "y", layout: { padding: { right: 80 } },
      scales: { x: { ticks: { precision: 0 }, grid: { color: cssVar("--grid") }, border: { display: false } }, y: { ...noGrid, ticks: { color: cssVar("--text-2") } } },
      plugins: { valueLabels: { datasetIndex: 0, format: i => `${top[i].games} · ${pct(top[i].wr)} V` },
        tooltip: { callbacks: { label: it => { const r = top[it.dataIndex]; return ` Vista em ${r.games} jogos — sua taxa de vitória: ${pct(r.wr)}`; } } } } },
  }, top.length ? null : "Nenhuma carta registrada no filtro atual");

  const curve = Array(8).fill(0);
  for (const r of forCurve) if (!r.land && r.cmc != null) curve[Math.min(7, r.cmc)]++;
  draw("c-curve", {
    type: "bar",
    data: { labels: ["0", "1", "2", "3", "4", "5", "6", "7+"], datasets: [{ label: "Cartas", data: curve,
      backgroundColor: cssVar("--accent"), borderRadius: 4, borderSkipped: "start", maxBarThickness: 40 }] },
    options: { layout: { padding: { top: 20 } },
      scales: { y: { ticks: { precision: 0 }, grid: { color: cssVar("--grid") }, border: { display: false } }, x: { ...noGrid, title: { display: true, text: "Valor de mana", color: cssVar("--muted") } } },
      plugins: { valueLabels: { datasetIndex: 0, format: i => curve[i] ? String(curve[i]) : "" },
        tooltip: { callbacks: { title: it => `Custo ${it[0].label}`, label: it => ` ${it.parsed.y} cartas distintas` } } } },
  }, forCurve.length ? null : "Sem cartas");

  const cols = [
    { key: "name", label: "Carta", cls: "name", html: r => cardName(r.id) },
    { key: "colors", label: "Cores", html: r => r.land ? "" : pips(r.colors) },
    { key: "rarity", label: "Raridade", html: r => r.rarity ? `<span class="rar ${r.rarity}"></span>${RARITY_PT[r.rarity] || ""}` : "" },
    { key: "type", label: "Tipo" },
    { key: "cmc", label: "Custo", num: true, html: r => r.land ? "—" : esc(r.cost) },
  ];
  if (side === "me") cols.push({ key: "deck", label: "Partidas no deck", num: true });
  cols.push(
    { key: "matches", label: "Partidas vista", num: true },
    { key: "games", label: "Jogos vista", num: true },
    { key: "wr", label: side === "me" ? "% V quando vista" : "Sua % V contra", num: true, html: r => wrCell(r.wr) },
  );
  table("#t-cards", cols, rows, { sortKey: "games" });
}

/* ---------------------------------------------------------------- oponentes */
function renderOpponents() {
  const ms = state.filtered.filter(m => m.oppSeen.size);
  const combos = [...groupBy(ms, m => m.oppColors)].map(([k, v]) => ({ key: k, label: comboName(k), s: wl(v), n: v.length, ...wl(v),
    turns: (() => { const gs = v.flatMap(m => m.games); return gs.length ? gs.reduce((a, g) => a + g.turns, 0) / gs.length : null; })() }))
    .sort((a, b) => b.n - a.n);
  wrBars("c-oppcol", "w-oppcol", combos.slice(0, 12));

  const mono = "WUBRG".split("").map(c => {
    const v = ms.filter(m => m.oppColors.includes(c));
    return { label: COLOR_NAMES[c], share: ms.length ? v.length / ms.length : 0, s: wl(v) };
  });
  draw("c-oppmono", {
    type: "bar",
    data: { labels: mono.map(r => r.label), datasets: [{ label: "Presença", data: mono.map(r => r.share),
      backgroundColor: cssVar("--accent"), borderRadius: 4, borderSkipped: "start", maxBarThickness: 56 }] },
    options: { layout: { padding: { top: 22 } },
      scales: { y: axisWR, x: { ...noGrid, ticks: { color: cssVar("--text-2") } } },
      plugins: { valueLabels: { datasetIndex: 0, format: i => pct(mono[i].share) },
        tooltip: { callbacks: { label: it => { const r = mono[it.dataIndex]; return [` Em ${pct(r.share)} das partidas (${r.s.n})`, ` Sua taxa de vitória: ${pct(r.s.wr)}`]; } } } } },
  }, ms.length ? null : "Sem cartas de oponentes registradas");

  table("#t-oppcol", [
    { key: "label", label: "Combinação", html: r => `${pips(r.key)} ${esc(r.label)}` },
    { key: "n", label: "Partidas", num: true },
    { key: "w", label: "V", num: true }, { key: "l", label: "D", num: true },
    { key: "wr", label: "% Vitória", num: true, html: r => wrCell(r.wr) },
    { key: "turns", label: "Turnos/jogo", num: true, html: r => r.turns ? r.turns.toFixed(1) : "—" },
  ], combos, { sortKey: "n" });

  const names = [...groupBy(state.filtered, m => m.opponent || "?")].filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({ name: k, n: v.length, ...wl(v), last: v.reduce((a, b) => a.date > b.date ? a : b).date }));
  table("#t-oppnames", [
    { key: "name", label: "Oponente" }, { key: "n", label: "Partidas", num: true },
    { key: "w", label: "V", num: true }, { key: "l", label: "D", num: true },
    { key: "wr", label: "% Vitória", num: true, html: r => wrCell(r.wr) },
    { key: "last", label: "Último confronto", num: true, html: r => fmtDate(r.last) },
  ], names, { sortKey: "n" });
  if (!names.length) $("#t-oppnames").innerHTML = `<div class="empty" style="height:80px">Nenhum oponente enfrentado mais de uma vez</div>`;
}

/* ----------------------------------------------------------------- partidas */
function renderMatches() {
  const rows = state.filtered.map(m => ({ ...m, ts: m.date.getTime(),
    score: `${m.gw}–${m.gl}`, play: m.games[0]?.on_play }));
  table("#t-matches", [
    { key: "ts", label: "Data", html: r => fmtDateTime(r.date) },
    { key: "result", label: "Resultado", html: r => resultBadge(r.result) },
    { key: "fmt", label: "Formato" },
    { key: "queue", label: "Fila", html: r => `${esc(r.queue)} <span class="muted">${r.bo}</span>` },
    { key: "deckName", label: "Seu deck", cls: "name", html: r => `${pips(r.myColors)} ${esc(r.deckName)}` },
    { key: "opponent", label: "Oponente", cls: "name" },
    { key: "oppColors", label: "Cores do oponente", html: r => r.oppSeen.size ? pips(r.oppColors) : "<span class='muted'>—</span>" },
    { key: "score", label: "Jogos", num: true },
    { key: "play", label: "Início", html: r => r.play == null ? "—" : r.play ? "Play" : "Draw" },
    { key: "turns", label: "Turnos", num: true },
  ], rows, { sortKey: "ts", onRow: toggleMatch });
}

function toggleMatch(m, tr) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains("detail")) { next.remove(); return; }
  const cols = tr.children.length;
  const list = ids => [...ids].map(id => card(id)).filter(c => c && !c.token)
    .sort((a, b) => (a.is_land - b.is_land) || (a.cmc - b.cmc) || a.name.localeCompare(b.name))
    .map(c => `<span>${cardName(c.id)}</span>`).join("") || "<span class='muted'>nenhuma</span>";
  const my = new Set(), opp = new Set();
  const oppCmd = new Set();
  m.games.forEach(g => { g.my_seen.forEach(x => my.add(x)); g.opp_seen.forEach(x => opp.add(x)); (g.opp_commander || []).forEach(x => oppCmd.add(x)); });
  const games = m.games.map(g => `<span><b>Jogo ${g.n}:</b> ${({ win: "vitória", loss: "derrota", draw: "empate" })[g.result] || "?"} · ${g.on_play == null ? "" : g.on_play ? "play · " : "draw · "}${g.turns} turnos${g.my_mulligans ? ` · ${g.my_mulligans} mulligan(s)` : ""}</span>`).join("");
  tr.insertAdjacentHTML("afterend", `<tr class="detail"><td colspan="${cols}">
    <div class="games">${games}<span class="muted">evento: ${esc(m.event)}</span></div>
    <div class="match-detail">
      <div><h4>Suas cartas</h4><div class="chips">${list(my)}</div></div>
      <div><h4>Cartas do oponente${oppCmd.size ? `: ${[...oppCmd].map(cardName).join(", ")}` : ""}</h4><div class="chips">${list(opp)}</div></div>
    </div></td></tr>`);
}

/* ----------------------------------------------------------------- limitado */
const LIMITED_TYPES = [
  [/QuickDraft/i, "Quick Draft"], [/PremierDraft/i, "Premier Draft"], [/Trad(itional)?_?Draft/i, "Draft tradicional"],
  [/Trad(itional)?_?Sealed/i, "Selado tradicional"], [/Sealed/i, "Selado"], [/Draft/i, "Draft"],
];
/* "QuickDraft_FRA_20261008" -> { type: "Quick Draft", set: "FRA" } */
function limitedInfo(event) {
  const t = LIMITED_TYPES.find(([re]) => re.test(event || ""));
  if (!t) return null;
  const parts = event.split("_");
  const after = parts.slice(parts.findIndex(p => /Draft|Sealed/i.test(p)) + 1);
  const set = after.find(p => /^[A-Z][A-Z0-9]{1,4}$/.test(p)) || after[0] || "?";
  return { type: t[1], set };
}

const MAX_WINS = 7;   // vitórias que completam um draft

function renderLimited() {
  const ms = state.filtered.filter(m => m.limited);
  // cada campanha = evento + deck (cada draft gera um deck novo)
  const runs = [...groupBy(ms, m => `${m.event}|${m.deckId || m.deckName}`)].map(([key, v]) => {
    v.sort((a, b) => a.date - b.date);
    const s = wl(v), last = v[v.length - 1];
    return { key, matches: v, ts: v[0].date.getTime(), date: v[0].date, set: last.limited.set, type: last.limited.type,
      bo: last.bo, colors: last.myColors, deckName: last.deckName, n: s.n, w: s.w, l: s.l, wr: s.wr,
      record: `${s.w}–${s.l}`, gw: v.reduce((a, m) => a + m.gw, 0), gl: v.reduce((a, m) => a + m.gl, 0) };
  });

  const s = wl(ms);
  const best = runs.reduce((a, r) => (!a || r.w > a.w || (r.w === a.w && r.l < a.l)) ? r : a, null);
  const kpi = (label, value, sub = "") => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  $("#limited-kpis").innerHTML = [
    kpi("Drafts", num(runs.length), `${num(s.n)} partidas · <span class="star" title="drafts com ${MAX_WINS} vitórias">★</span> ${runs.filter(r => r.w >= MAX_WINS).length}`),
    kpi("Vitórias–Derrotas", `${s.w}–${s.l}`, `taxa de vitória ${pct(s.wr)}`),
    kpi("Média de vitórias", runs.length ? (s.w / runs.length).toFixed(1) : "—", "por draft"),
    kpi("Melhor campanha", best ? best.record : "—", best ? `${best.set} · ${comboName(best.colors)}` : "&nbsp;"),
  ].join("");

  table("#t-limited", [
    { key: "ts", label: "Data", html: r => fmtDateTime(r.date) },
    { key: "set", label: "Coleção", html: r => `<b>${esc(r.set)}</b>` },
    { key: "type", label: "Tipo", html: r => `${esc(r.type)} <span class="muted">${r.bo}</span>` },
    { key: "colors", label: "Cores do deck", html: r => `${pips(r.colors)} ${esc(comboName(r.colors))}` },
    { key: "star", label: "Estrela", cls: "center", sort: r => r.w >= MAX_WINS ? 1 : 0,
      html: r => r.w >= MAX_WINS ? `<span class="star" title="Draft completo: ${MAX_WINS} vitórias">★</span>` : "" },
    { key: "w", label: "Vitórias–Derrotas", num: true, html: r => `<b>${r.record}</b>` },
    { key: "gw", label: "Jogos", num: true, html: r => `${r.gw}–${r.gl}` },
    { key: "wr", label: "% Vitória", num: true, html: r => wrCell(r.wr) },
  ], runs, { sortKey: "ts", onRow: toggleRun });
  if (!runs.length) $("#t-limited").innerHTML = `<div class="empty" style="height:120px">Nenhuma partida de draft ou selado no filtro atual.<br>Jogue um evento limitado no Arena e clique em Atualizar dados.</div>`;
}

function toggleRun(run, tr) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains("detail")) { next.remove(); return; }
  tr.insertAdjacentHTML("afterend", `<tr class="detail"><td colspan="${tr.children.length}"><div class="run-matches"></div></td></tr>`);
  const box = $(".run-matches", tr.nextElementSibling);
  const rows = run.matches.map(m => ({ ...m, ts: m.date.getTime(), score: `${m.gw}–${m.gl}`, play: m.games[0]?.on_play }));
  table(box, [
    { key: "ts", label: "Data", html: r => fmtDateTime(r.date) },
    { key: "result", label: "Resultado", html: r => resultBadge(r.result) },
    { key: "opponent", label: "Oponente", cls: "name" },
    { key: "oppColors", label: "Cores do oponente", html: r => r.oppSeen.size ? pips(r.oppColors) : "<span class='muted'>—</span>" },
    { key: "score", label: "Jogos", num: true },
    { key: "play", label: "Início", html: r => r.play == null ? "—" : r.play ? "Play" : "Draw" },
    { key: "turns", label: "Turnos", num: true },
  ], rows, { sortKey: "ts", sortDir: 1, onRow: toggleMatch });
}

/* --------------------------------------------------------------- navegação */
const RENDER = { overview: renderOverview, formats: renderFormats, decks: renderDecks, cards: renderCards, opponents: renderOpponents, matches: renderMatches, limited: renderLimited };

function render() {
  if (!state.data) return;
  if (!window.Chart) throw new Error("biblioteca de gráficos (web/lib/chart.umd.js) não encontrada");
  chartDefaults();
  RENDER[state.page]();
}
function go(page) {
  state.page = page;
  $$("#nav button").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  $$(".page").forEach(p => p.hidden = p.id !== "page-" + page);
  render();
}

/* -------------------------------------------------------------- dados / api */
function setData(data) {
  state.data = data;
  state.all = data.matches.map(enrich);
  buildFilterOptions();
  applyFilters();
  $("#player").textContent = data.player?.name || "Jogador";
  const r = data.rank;
  const rk = (cls, lvl, step) => cls ? `${RANKS[cls] || cls}${cls === "Mythic" ? "" : " " + (lvl ?? "")}` : "—";
  $("#rank").innerHTML = r ? `<span>Construído: <b>${rk(r.constructedClass, r.constructedLevel)}</b></span><span>Limitado: <b>${rk(r.limitedClass, r.limitedLevel)}</b></span>` : "";
  const banner = $("#banner");
  if (!state.all.length) {
    banner.hidden = false;
    banner.innerHTML = `<b>Nenhuma partida encontrada ainda.</b> No MTG Arena, abra <b>Opções → Conta</b> e marque
      <b>Registros detalhados (suporte a plug-ins)</b>; reinicie o jogo e jogue algumas partidas. Depois clique em <b>Atualizar dados</b>.
      O histórico é guardado pelo MTGA Stats, então as partidas continuam aqui mesmo depois que o Arena apaga o log.`;
  } else banner.hidden = true;
}
const RANKS = { Bronze: "Bronze", Silver: "Prata", Gold: "Ouro", Platinum: "Platina", Diamond: "Diamante", Mythic: "Mítico" };

async function refresh(manual = true) {
  const btn = $("#btn-refresh");
  btn.disabled = true; btn.textContent = "Lendo log…";
  status("");
  let res;
  try {
    res = await state.api.refresh();
    setData(await state.api.get_data());
  } catch (e) { status(`Erro ao ler log: ${e.message || e}`, true); console.error(e); }
  if (res) {
    try { render(); } catch (e) { status(`Erro ao exibir: ${e.message || e}`, true); console.error(e); }
    if (!res.ok) status(res.error, true);
    else if (!$("#status").style.color) {
      status(res.new ? `${res.new} nova(s) partida(s)` : "Atualizado");
      if (!res.detailed_logs && manual) warnDetailed();
    }
  }
  btn.disabled = false; btn.textContent = "Atualizar dados";
}
function warnDetailed() {
  const b = $("#banner");
  b.hidden = false;
  b.innerHTML = `<b>Registros detalhados parecem desativados.</b> Sem eles o Arena não grava as partidas no log.
    Ative em <b>Opções → Conta → Registros detalhados (suporte a plug-ins)</b> e reinicie o jogo.`;
}
function status(t, err) {
  const el = $("#status");
  el.textContent = t;
  el.style.color = err ? "var(--bad-text)" : "";
}

async function poll() {
  if (!state.api || document.hidden) return;
  try {
    const res = await state.api.check_updates();
    if (res.changed && res.new) {
      setData(await state.api.get_data());
      render();
      status(`${res.new} nova(s) partida(s)`);
    }
  } catch (e) { /* ignora */ }
}

function getApi() {
  return new Promise(resolve => {
    if (window.pywebview?.api?.get_data) return resolve(window.pywebview.api);
    window.addEventListener("pywebviewready", () => resolve(window.pywebview.api), { once: true });
    setTimeout(() => resolve(window.pywebview?.api || null), 3000);
  });
}

/* modo navegador (desenvolvimento): lê dev-data.json */
const devApi = {
  async get_data() { return (await fetch("dev-data.json")).json(); },
  async refresh() { return { ok: true, new: 0, detailed_logs: true }; },
  async check_updates() { return { changed: false }; },
  async import_file() { return { ok: false, cancelled: true }; },
};

/* ---------------------------------------------------------- pré-visualização */
function setupCardPreview() {
  const box = $("#card-preview"), img = $("img", box);
  let cur = null;
  document.addEventListener("mouseover", ev => {
    const t = ev.target.closest("[data-card]");
    if (!t) { box.hidden = true; cur = null; return; }
    const id = t.dataset.card;
    if (cur !== id) {
      cur = id;
      const c = card(id);
      img.onerror = () => { if (c?.name_en && !img.dataset.fallback) { img.dataset.fallback = 1; img.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(c.name_en)}&format=image&version=normal`; } else box.hidden = true; };
      delete img.dataset.fallback;
      if (c?.img) img.src = c.img;
      else {
        img.removeAttribute("src");
        imageUrl(id).then(url => { if (cur !== id) return; if (url) img.src = url; else box.hidden = true; });
      }
    }
    box.hidden = false;
  });
  document.addEventListener("mousemove", ev => {
    if (box.hidden) return;
    const w = 244, h = 340;
    let x = ev.clientX + 18, y = ev.clientY - h / 2;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 18;
    y = Math.max(8, Math.min(y, innerHeight - h - 8));
    box.style.left = x + "px"; box.style.top = y + "px";
  });
}

/* --------------------------------------------------------------------- tema */
function setupTheme() {
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) { /* sem storage */ }
  if (saved) document.documentElement.dataset.theme = saved;
  $("#btn-theme").onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* sem storage */ }
    render();
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
}

/* --------------------------------------------------------------------- init */
async function init() {
  setupTheme();
  setupCardPreview();
  $$("#nav button").forEach(b => b.onclick = () => { if (b.dataset.page === "decks") state.deckSel = null; go(b.dataset.page); });
  FILTERS.forEach(id => $("#" + id).addEventListener("change", () => {
    if (id === "f-format") buildFilterOptions();
    applyFilters(); render();
  }));
  $$("#cards-side button").forEach(b => b.onclick = () => {
    state.cardsSide = b.dataset.side;
    $$("#cards-side button").forEach(x => x.classList.toggle("active", x === b));
    $("#t-cards")._sort = null;
    renderCards();
  });
  ["cards-search", "cards-min", "cards-lands"].forEach(id => $("#" + id).addEventListener("input", () => renderCards()));
  $("#btn-refresh").onclick = () => refresh(true);
  $("#btn-import").onclick = async () => {
    const res = await state.api.import_file();
    if (res.cancelled) return;
    setData(await state.api.get_data()); render();
    status(res.ok ? `${res.new} nova(s) partida(s) importada(s)` : res.error, !res.ok);
  };
  state.api = (await getApi()) || devApi;
  if (state.api === devApi) {
    setData(await devApi.get_data());
    render();
    status("modo navegador");
    return;
  }
  try { setData(await state.api.get_data()); render(); }
  catch (e) { status(`Erro ao exibir: ${e.message || e}`, true); console.error(e); }
  await refresh(false);
  setInterval(poll, 15000);
}
init();
