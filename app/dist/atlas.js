"use strict";
const $ = id => document.getElementById(id);
const amber = "#ffbd58", violet = "#c5a0ff";
const number = n => n.toLocaleString("en-US");
const percent = (n, total) => total ? `${(100 * n / total).toFixed(1)}%` : "—";
let data, selected, counterpart, direction = "both", low, high, adjacent;
let mapHits = [], timeScale, brushStart = null;
let view = "atlas", page = 0, monthNegatives;
const PAGE_SIZE = 30;
const dateFormat = new Intl.DateTimeFormat("en-US", {month: "short", year: "numeric", timeZone: "UTC"});
const dateLabel = month => dateFormat.format(new Date(month + "-01T00:00:00Z"));
const count = (neg, total) => ({neg, total});
const blank = () => ({out: count(0, 0), in: count(0, 0)});

function parseDataset(raw) {
  if (!raw || typeof raw.illustrative !== "boolean" ||
      !Array.isArray(raw.months) || !raw.months.length ||
      !raw.months.every(m => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) ||
      !raw.months.every((m, i) => i === 0 || m > raw.months[i - 1]) ||
      !Array.isArray(raw.nodes) || !raw.nodes.length || !Array.isArray(raw.links)) {
    throw new Error("This file does not match the Conflict Atlas data format.");
  }
  const names = new Set();
  for (const node of raw.nodes) {
    if (!Array.isArray(node) || node.length !== 3 || typeof node[0] !== "string" ||
        !node[0].trim() || names.has(node[0]) ||
        !(Number.isFinite(node[1]) && Number.isFinite(node[2]) || node[1] === null && node[2] === null)) {
      throw new Error("Invalid or duplicate community entry.");
    }
    names.add(node[0]);
  }
  if (!raw.links.every(row => Array.isArray(row) && row.length === 5 &&
    row.every(v => Number.isSafeInteger(v) && v >= 0) &&
    row[0] < raw.nodes.length && row[1] < raw.nodes.length && row[2] < raw.months.length &&
    row[3] <= row[4])) throw new Error("Invalid monthly link entry.");
  return raw;
}

function install(raw) {
  data = parseDataset(raw);
  adjacent = data.nodes.map(() => []);
  const volumes = new Float64Array(data.nodes.length);
  monthNegatives = new Float64Array(data.months.length);
  for (const row of data.links) {
    const [a, b, month, neg] = row;
    monthNegatives[month] += neg;
    adjacent[a].push(row);
    if (a !== b) adjacent[b].push(row);
    volumes[a] += neg;
    if (a !== b) volumes[b] += neg;
  }
  selected = volumes.reduce((best, volume, i) => volume > volumes[best] ? i : best, 0);
  counterpart = null;
  low = 0;
  high = data.months.length - 1;
  for (const id of ["start", "end"]) {
    $(id).replaceChildren(...data.months.map((month, i) => new Option(dateLabel(month), i)));
  }
  $("dataBadge").textContent = data.illustrative ? "Illustrative data" : "SNAP data";
  $("dataBadge").classList.toggle("real", !data.illustrative);
  updateSuggestions("");
  $("search").value = `r/${data.nodes[selected][0]}`;
  render();
}

function updateSuggestions(query) {
  if (!data) return;
  const options = document.createDocumentFragment();
  let matches = 0;
  for (const [name] of data.nodes) {
    if (!name.toLowerCase().includes(query)) continue;
    const option = document.createElement("option");
    option.value = `r/${name}`;
    options.append(option);
    if (++matches === 30) break;
  }
  $("communities").replaceChildren(options);
}

function summarize() {
  const peers = new Map();
  const monthly = data.months.map(blank);
  const totals = blank();
  for (const [a, b, month, neg, total] of adjacent[selected]) {
    const directions = a === selected && b === selected ? ["out", "in"] : [a === selected ? "out" : "in"];
    const other = a === selected ? b : a;
    for (const key of directions) {
      monthly[month][key].neg += neg;
      monthly[month][key].total += total;
      if (month < low || month > high) continue;
      if (!peers.has(other)) peers.set(other, blank());
      const row = peers.get(other)[key];
      row.neg += neg;
      row.total += total;
      totals[key].neg += neg;
    }
  }
  const score = values => direction === "both" ? values.out.neg + values.in.neg : values[direction].neg;
  const visible = [...peers].filter(([, v]) => score(v) > 0)
    .sort((a, b) => score(b[1]) - score(a[1]) || data.nodes[a[0]][0].localeCompare(data.nodes[b[0]][0]));
  return {peers, monthly, totals, visible};
}

function render() {
  if (!data) return;
  const {peers, monthly, totals, visible} = summarize();
  if (counterpart === null || !visible.some(([id]) => id === counterpart)) counterpart = visible[0]?.[0] ?? null;
  const name = `r/${data.nodes[selected][0]}`;
  $("selectedName").textContent = name;
  $("selection").textContent = `Negative-labeled hyperlinks sent or received by ${name}.`;
  $("timelineNote").textContent = `Monthly outgoing and incoming counts for ${name}.`;
  $("nodeCount").textContent = number(data.nodes.length);
  $("linkCount").textContent = number(monthNegatives.slice(low, high + 1).reduce((a, b) => a + b, 0));
  $("scopeDates").textContent = low === high ? dateLabel(data.months[low]) :
    `${dateLabel(data.months[low])} – ${dateLabel(data.months[high])}`;
  $("outCount").textContent = number(totals.out.neg);
  $("inCount").textContent = number(totals.in.neg);
  $("peerCount").textContent = number([...peers].filter(([, pair]) => pair.out.neg || pair.in.neg).length);
  $("range").textContent = low === high ? dateLabel(data.months[low]) : $("scopeDates").textContent;
  $("start").value = low;
  $("end").value = high;
  for (const button of document.querySelectorAll("[data-months]")) {
    const duration = button.dataset.months;
    const active = duration === "all" ? low === 0 : low > 0 && high - low + 1 === Number(duration);
    button.setAttribute("aria-pressed", high === data.months.length - 1 && active);
  }
  $("mapPanel").hidden = view !== "atlas";
  $("timelinePanel").hidden = !["atlas", "activity"].includes(view);
  $("analyticsPanel").hidden = view === "atlas";
  showPair(peers.get(counterpart));
  const list = document.createDocumentFragment();
  for (const [key, label, icon] of [["out", "outgoing", "➜"], ["in", "incoming", "⬅"]]) {
    if (direction !== "both" && direction !== key) continue;
    const ordered = visible.filter(([, pair]) => pair[key].neg)
      .sort((a, b) => b[1][key].neg - a[1][key].neg);
    for (const [id, pair] of ordered) {
      const button = document.createElement("button");
      button.className = "counterpart";
      button.setAttribute("aria-pressed", id === counterpart);
      const arrow = document.createElement("span");
      arrow.className = key;
      arrow.textContent = icon;
      arrow.setAttribute("aria-hidden", "true");
      const caption = document.createElement("span");
      const node = document.createElement("strong"), detail = document.createElement("small");
      node.textContent = `r/${data.nodes[id][0]}`;
      detail.textContent = `(${label})`;
      caption.append(node, detail);
      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = number(pair[key].neg);
      button.append(arrow, caption, amount);
      button.addEventListener("click", () => inspect(id));
      list.append(button);
    }
  }
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.textContent = "No negative-labeled links in this view.";
    list.append(empty);
  }
  const scroll = $("counterparts").scrollTop;
  $("counterparts").replaceChildren(list);
  $("counterparts").scrollTop = scroll;
  if (!$("mapPanel").hidden) drawMap(visible);
  if (!$("timelinePanel").hidden) drawTime(monthly);
  if (view !== "atlas") drawAnalytics(visible, monthly);
}

function inspect(id) {
  counterpart = id;
  $("pairDisclosure").open = true;
  render();
}

function nodeLink(id) {
  const button = document.createElement("button");
  button.textContent = `r/${data.nodes[id][0]}`;
  button.addEventListener("click", () => inspect(id));
  return button;
}

function drawAnalytics(visible, monthly) {
  let title, description, columns, records;
  if (view === "activity") {
    title = "Monthly Activity";
    description = "Outgoing and incoming negative links, all links, and negative fractions by month.";
    columns = ["UTC month", "Outgoing negative / all", "Outgoing share", "Incoming negative / all", "Incoming share"];
    records = monthly.slice(low, high + 1).map(({out, in: received}, i) => [
      dateLabel(data.months[low + i]), `${number(out.neg)} / ${number(out.total)}`,
      percent(out.neg, out.total), `${number(received.neg)} / ${number(received.total)}`,
      percent(received.neg, received.total),
    ]);
  } else if (view === "counterparts") {
    title = "Top Counterparts";
    description = "Ranked by negative-labeled links under the active direction filter.";
    columns = ["Subreddit", "Outgoing negative", "Outgoing share", "Incoming negative", "Incoming share"];
    records = visible.map(([id, {out, in: received}]) => [id, number(out.neg),
      percent(out.neg, out.total), number(received.neg), percent(received.neg, received.total)]);
  } else {
    title = "Link Table";
    description = "One row per directed pair and month. The table includes neutral-or-positive links in the total.";
    columns = ["UTC month", "Source", "Target", "Negative", "All links", "Negative share"];
    records = adjacent[selected].filter(([a, b, month]) =>
      month >= low && month <= high && (direction === "both" || direction === "out" && a === selected ||
      direction === "in" && b === selected)).sort((a, b) => b[2] - a[2] || b[3] - a[3] || a[0] - b[0] || a[1] - b[1])
      .map(([a, b, month, neg, total]) => [dateLabel(data.months[month]),
        `r/${data.nodes[a][0]}`, `r/${data.nodes[b][0]}`, number(neg), number(total), percent(neg, total)]);
  }
  $("analyticsTitle").textContent = title;
  $("analyticsNote").textContent = description;
  const container = $("analytics");
  container.replaceChildren();
  if (!records.length) {
    const empty = document.createElement("p");
    empty.textContent = "No links under these filters.";
    container.append(empty);
    return;
  }
  const maxPage = Math.ceil(records.length / PAGE_SIZE) - 1;
  page = Math.min(page, maxPage);
  const table = document.createElement("table");
  table.className = "analytics-table";
  const head = table.createTHead().insertRow();
  for (const name of columns) {
    const cell = document.createElement("th");
    cell.scope = "col"; cell.textContent = name; head.append(cell);
  }
  const body = table.createTBody();
  for (const record of records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    const row = body.insertRow();
    for (const [i, value] of record.entries()) {
      const cell = row.insertCell();
      if (view === "counterparts" && i === 0) cell.append(nodeLink(value));
      else cell.textContent = value;
    }
  }
  container.append(table);
  if (maxPage) {
    const controls = document.createElement("div");
    controls.className = "table-controls";
    for (const [label, delta] of [["Previous", -1], ["Next", 1]]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.disabled = page + delta < 0 || page + delta > maxPage;
      button.addEventListener("click", () => { page += delta; render(); });
      controls.append(button);
    }
    const status = document.createElement("span");
    status.textContent = `Page ${page + 1} of ${maxPage + 1}`;
    controls.append(status); container.append(controls);
  }
}

function showPair(pair) {
  const container = $("pairDetail");
  container.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = pair ? `r/${data.nodes[counterpart][0]}` : "No pair selected";
  container.append(heading);
  if (!pair) return;
  if (counterpart === selected) {
    const note = document.createElement("p");
    note.textContent = "Self-links count once in each direction.";
    container.append(note);
  }
  for (const [key, label] of [["out", "Selected → counterpart"], ["in", "Counterpart → selected"]]) {
    const line = document.createElement("div");
    line.className = "pair-line";
    const text = document.createElement("span"), metrics = document.createElement("span");
    text.textContent = label;
    metrics.textContent = `${number(pair[key].neg)} / ${number(pair[key].total)} · ${percent(pair[key].neg, pair[key].total)}`;
    metrics.title = "Negative links / all links · negative fraction";
    line.append(text, metrics);
    container.append(line);
  }
  const focus = document.createElement("button");
  focus.textContent = "Explore this subreddit";
  focus.disabled = counterpart === selected;
  focus.addEventListener("click", () => selectNode(counterpart));
  container.append(focus);
}

function canvas(id) {
  const el = $(id), w = el.clientWidth, h = el.clientHeight;
  const scale = Math.min(devicePixelRatio || 1, 2);
  el.width = w * scale;
  el.height = h * scale;
  const ctx = el.getContext("2d");
  ctx.scale(scale, scale);
  return {ctx, w, h};
}

function point(ctx, x, y, size, color) {
  ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
}

function arrow(ctx, from, to, bend, color, emphasized) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dist = Math.hypot(dx, dy);
  if (dist < 18) return;
  const offset = Math.min(dist * 0.23, 58) * bend;
  const cx = (from[0] + to[0]) / 2 - dy / dist * offset;
  const cy = (from[1] + to[1]) / 2 + dx / dist * offset;
  const angle = Math.atan2(to[1] - cy, to[0] - cx);
  const x = to[0] - Math.cos(angle) * 9, y = to[1] - Math.sin(angle) * 9;
  ctx.globalAlpha = emphasized ? 1 : 0.66;
  ctx.strokeStyle = color; ctx.lineWidth = emphasized ? 2.7 : 1.4;
  ctx.beginPath(); ctx.moveTo(...from); ctx.quadraticCurveTo(cx, cy, x, y); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y);
  ctx.lineTo(x - 8 * Math.cos(angle - 0.48), y - 8 * Math.sin(angle - 0.48));
  ctx.lineTo(x - 8 * Math.cos(angle + 0.48), y - 8 * Math.sin(angle + 0.48));
  ctx.fill(); ctx.globalAlpha = 1;
}

function drawMap(visible) {
  const {ctx, w, h} = canvas("map");
  mapHits = [];
  const plotted = data.nodes.filter(node => node[1] !== null);
  const located = data.nodes[selected][1] !== null;
  $("mapNote").textContent = located
    ? "Points represent communities in shared-user embedding space."
    : "This community has no embedding. Explore its timeline and counterparts.";
  if (!plotted.length) return;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [, x, y] of plotted) {
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  const left = 51, right = w - 10, top = 12, bottom = h - 43;
  const xpad = (xmax - xmin || 1) * .08, ypad = (ymax - ymin || 1) * .08;
  xmin -= xpad; xmax += xpad; ymin -= ypad; ymax += ypad;
  const scaleX = (right - left) / (xmax - xmin), scaleY = (bottom - top) / (ymax - ymin);
  const project = ([, x, y]) => [left + (x - xmin) * scaleX, bottom - (y - ymin) * scaleY];
  ctx.fillStyle = "#0a1123"; ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = "#26304a"; ctx.fillStyle = "#c9d0e3"; ctx.lineWidth = 1;
  ctx.font = "12px system-ui";
  const steps = w > 600 ? 10 : 5;
  for (let i = 0; i <= steps; i++) {
    const x = left + i * (right - left) / steps;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText((xmin + i * (xmax - xmin) / steps).toFixed(1), x, bottom + 17);
  }
  for (let i = 0; i <= 8; i++) {
    const y = bottom - i * (bottom - top) / 8;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText((ymin + i * (ymax - ymin) / 8).toFixed(1), left - 7, y + 4);
  }
  ctx.strokeStyle = "#67738c"; ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.textAlign = "center"; ctx.fillText("Embedding X", (left + right) / 2, h - 6);
  ctx.save(); ctx.translate(10, (top + bottom) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText("Embedding Y", 0, 0); ctx.restore(); ctx.textAlign = "left";
  const radius = plotted.length > 5000 ? 1.1 : 2;
  for (const node of plotted) point(ctx, ...project(node), radius, "#59708e99");
  if (!located) return;
  const origin = project(data.nodes[selected]);
  const candidates = visible.filter(([id]) => id !== selected && data.nodes[id][1] !== null);
  const highlighted = candidates.slice(0, 12);
  const focus = candidates.find(([id]) => id === counterpart);
  if (focus && !highlighted.some(([id]) => id === counterpart)) highlighted.push(focus);
  for (const [id, pair] of highlighted) {
    const pos = project(data.nodes[id]), focused = id === counterpart;
    if (direction !== "in" && pair.out.neg) arrow(ctx, origin, pos, 1, amber, focused);
    if (direction !== "out" && pair.in.neg) arrow(ctx, pos, origin, 1, violet, focused);
    point(ctx, ...pos, focused ? 6 : 4.4, direction !== "in" && pair.out.neg ? amber : violet);
    mapHits.push({id, pos});
  }
  point(ctx, ...origin, 11, "#c5a0ff44"); point(ctx, ...origin, 5.5, "#f3e6ff");
  ctx.font = "600 13px system-ui";
  ctx.fillStyle = "#e9e2fb";
  const caption = `r/${data.nodes[selected][0]}`;
  ctx.fillText(caption, Math.max(6, Math.min(origin[0] + 12, w - ctx.measureText(caption).width - 7)),
    Math.max(15, origin[1] - 12));
}

function drawTime(monthly) {
  const {ctx, w, h} = canvas("time");
  const left = 43, right = w - 15, top = 18, bottom = h - 30, n = monthly.length;
  const x = i => n === 1 ? (left + right) / 2 : left + i * (right - left) / (n - 1);
  timeScale = {left, right, n};
  ctx.fillStyle = "#a382ee25";
  const step = n > 1 ? (right - left) / (n - 1) : right - left;
  const start = Math.max(left, x(low) - step / 2), end = Math.min(right, x(high) + step / 2);
  ctx.fillRect(start, top, end - start, bottom - top);
  const maximum = Math.max(1, ...monthly.flatMap(row => [row.out.neg, row.in.neg]));
  ctx.font = "11px system-ui"; ctx.fillStyle = "#9aaecb"; ctx.strokeStyle = "#24364f";
  for (let i = 0; i <= 3; i++) {
    const y = bottom - i * (bottom - top) / 3;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.fillText(number(Math.round(i * maximum / 3)), 5, y + 3);
  }
  for (const [key, color] of [["out", amber], ["in", violet]]) {
    if (direction !== "both" && key !== direction) continue;
    const points = monthly.map((row, i) => [x(i), bottom - row[key].neg * (bottom - top) / maximum]);
    if (n > 1) {
      ctx.beginPath(); ctx.moveTo(points[0][0], bottom);
      for (const position of points) ctx.lineTo(...position);
      ctx.lineTo(points.at(-1)[0], bottom); ctx.closePath();
      ctx.fillStyle = key === "out" ? "#ffbd5812" : "#c5a0ff26"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(...points[0]);
      for (const position of points.slice(1)) ctx.lineTo(...position);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    }
    for (const position of points) point(ctx, ...position, n < 25 ? 2.6 : 1.5, color);
  }
  ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = "#a786e0";
  for (const edge of [start, end]) {
    ctx.beginPath(); ctx.moveTo(edge, top); ctx.lineTo(edge, bottom); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = "#a8b6cb";
  const stride = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((right - left) / 82))));
  for (let i = 0; i < n; i += stride) {
    const label = dateLabel(data.months[i]);
    ctx.fillText(label, Math.min(x(i) - 17, right - 33), h - 10);
  }
}

function selectNode(id) {
  selected = id; counterpart = null; page = 0;
  $("search").value = `r/${data.nodes[id][0]}`;
  $("message").hidden = true;
  render();
}

function search() {
  const value = $("search").value.trim().toLowerCase().replace(/^r\//, "");
  const id = data?.nodes.findIndex(([name]) => name.toLowerCase() === value) ?? -1;
  if (id >= 0) selectNode(id);
  else message("No exact match. Choose a suggestion or enter the full subreddit name.");
}

function message(text) {
  $("message").textContent = text;
  $("message").hidden = false;
}

for (const button of document.querySelectorAll("[data-direction]")) {
  button.addEventListener("click", () => {
    direction = button.dataset.direction; page = 0;
    for (const control of document.querySelectorAll("[data-direction]"))
      control.setAttribute("aria-pressed", control === button);
    render();
  });
}
$("search").addEventListener("input", event =>
  updateSuggestions(event.target.value.trim().toLowerCase().replace(/^r\//, "")));
$("search").addEventListener("change", search);
$("search").addEventListener("keydown", event => { if (event.key === "Enter") search(); });
for (const id of ["methods", "scopeInfo"])
  $(id).addEventListener("click", () => $("methodsDialog").showModal());
$("selectionButton").addEventListener("click", () => {
  $("search").focus();
  $("search").select();
});
for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => {
    view = button.dataset.view; page = 0;
    for (const control of document.querySelectorAll("[data-view]")) {
      if (control.dataset.view === view) control.setAttribute("aria-current", "page");
      else control.removeAttribute("aria-current");
    }
    render();
  });
}
for (const button of document.querySelectorAll("[data-months]")) {
  button.addEventListener("click", () => {
    if (!data) return;
    high = data.months.length - 1;
    low = button.dataset.months === "all" ? 0 : Math.max(0, high + 1 - Number(button.dataset.months));
    page = 0; render();
  });
}
$("start").addEventListener("change", () => { low = Math.min(+$("start").value, high); page = 0; render(); });
$("end").addEventListener("change", () => { high = Math.max(+$("end").value, low); page = 0; render(); });
$("file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { install(JSON.parse(await file.text())); $("message").hidden = true; }
  catch (error) { message(`Unable to load file. ${error.message}`); }
  finally { event.target.value = ""; }
});

function hit(event) {
  return mapHits.find(({pos}) => Math.hypot(event.offsetX - pos[0], event.offsetY - pos[1]) < 11);
}
$("map").addEventListener("mousemove", event => {
  const item = hit(event), tooltip = $("mapHover");
  tooltip.hidden = !item;
  $("map").style.cursor = item ? "pointer" : "";
  if (item) {
    tooltip.textContent = `r/${data.nodes[item.id][0]}`;
    tooltip.style.left = `${Math.min(event.offsetX + 10, $("map").clientWidth - tooltip.offsetWidth - 4)}px`;
    tooltip.style.top = `${Math.max(2, event.offsetY - 28)}px`;
  }
});
$("map").addEventListener("mouseleave", () => { $("mapHover").hidden = true; });
$("map").addEventListener("click", event => { const item = hit(event); if (item) inspect(item.id); });
function monthAt(event) {
  const {left, right, n} = timeScale;
  return Math.max(0, Math.min(n - 1, Math.round((event.clientX -
    $("time").getBoundingClientRect().left - left) * (n - 1) / (right - left))));
}
$("time").addEventListener("pointerdown", event => {
  if (!timeScale) return;
  brushStart = monthAt(event);
  $("time").setPointerCapture(event.pointerId);
});
$("time").addEventListener("pointermove", event => {
  if (brushStart === null) return;
  const end = monthAt(event); low = Math.min(brushStart, end); high = Math.max(brushStart, end); render();
});
$("time").addEventListener("pointerup", event => {
  if (brushStart === null) return;
  const end = monthAt(event); low = Math.min(brushStart, end); high = Math.max(brushStart, end);
  brushStart = null; page = 0; render();
});
$("time").addEventListener("pointercancel", () => { brushStart = null; });
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 80); });
fetch("demo.json").then(response => {
  if (!response.ok) throw new Error("Preview data could not be loaded.");
  return response.json();
}).then(raw => { if (!data) install(raw); }).catch(error => { if (!data) message(error.message); });
