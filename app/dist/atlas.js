"use strict";
const $ = id => document.getElementById(id);
const amber = "#ffbd58", violet = "#c5a0ff";
const number = n => n.toLocaleString("en-US");
const percent = (n, total) => total ? `${(100 * n / total).toFixed(1)}%` : "—";
let data, selected, counterpart, direction = "both", low, high, adjacent;
let mapHits = [], timeScale, brushStart = null;
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
  for (const row of data.links) {
    const [a, b, , neg] = row;
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
    $(id).min = 0;
    $(id).max = high;
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
  $("selection").textContent = `Selected · r/${data.nodes[selected][0]}`;
  $("outCount").textContent = number(totals.out.neg);
  $("inCount").textContent = number(totals.in.neg);
  $("listCount").textContent = number(visible.length);
  $("range").textContent = low === high ? data.months[low] : `${data.months[low]} to ${data.months[high]} · UTC`;
  $("start").value = low;
  $("end").value = high;
  $("start").setAttribute("aria-valuetext", data.months[low]);
  $("end").setAttribute("aria-valuetext", data.months[high]);
  showPair(peers.get(counterpart));
  const list = document.createDocumentFragment();
  for (const [id, pair] of visible) {
    const button = document.createElement("button");
    button.className = "counterpart";
    button.setAttribute("aria-pressed", id === counterpart);
    const name = document.createElement("span");
    name.textContent = `r/${data.nodes[id][0]}`;
    const values = document.createElement("span");
    for (const [key, word, style] of [["out", "sent", "sent"], ["in", "received", "received"]]) {
      if (direction !== "both" && key !== direction) continue;
      const value = document.createElement("em");
      value.className = style;
      value.textContent = `${number(pair[key].neg)} ${word} `;
      values.append(value);
    }
    button.append(name, values);
    button.addEventListener("click", () => { counterpart = id; render(); });
    list.append(button);
  }
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.textContent = "No negative-labeled links in this view.";
    list.append(empty);
  }
  const scroll = $("counterparts").scrollTop;
  $("counterparts").replaceChildren(list);
  $("counterparts").scrollTop = scroll;
  drawMap(visible);
  drawTime(monthly);
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
  const scale = Math.min((w - 68) / (xmax - xmin || 1), (h - 62) / (ymax - ymin || 1));
  const project = ([, x, y]) => [w / 2 + (x - (xmin + xmax) / 2) * scale,
    h / 2 - (y - (ymin + ymax) / 2) * scale];
  ctx.strokeStyle = "#1d2b42"; ctx.lineWidth = 1;
  for (let x = w / 2 % 50; x < w; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = h / 2 % 50; y < h; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
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
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.9;
    monthly.forEach((row, i) => {
      const y = bottom - row[key].neg * (bottom - top) / maximum;
      if (i === 0) ctx.moveTo(x(i), y); else ctx.lineTo(x(i), y);
      if (n === 1) point(ctx, x(i), y, 3, color);
    });
    ctx.stroke();
  }
  ctx.fillStyle = "#a8b6cb";
  const stride = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((right - left) / 82))));
  for (let i = 0; i < n; i += stride) {
    const label = data.months[i];
    ctx.fillText(label, Math.min(x(i) - 17, right - 33), h - 10);
  }
}

function selectNode(id) {
  selected = id; counterpart = null;
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
    direction = button.dataset.direction;
    for (const control of document.querySelectorAll("[data-direction]"))
      control.setAttribute("aria-pressed", control === button);
    render();
  });
}
$("search").addEventListener("input", event =>
  updateSuggestions(event.target.value.trim().toLowerCase().replace(/^r\//, "")));
$("search").addEventListener("change", search);
$("search").addEventListener("keydown", event => { if (event.key === "Enter") search(); });
$("methods").addEventListener("click", () => $("methodsDialog").showModal());
$("start").addEventListener("input", () => { low = Math.min(+$("start").value, high); render(); });
$("end").addEventListener("input", () => { high = Math.max(+$("end").value, low); render(); });
$("reset").addEventListener("click", () => { if (data) { low = 0; high = data.months.length - 1; render(); } });
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
$("map").addEventListener("click", event => { const item = hit(event); if (item) { counterpart = item.id; render(); } });
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
  brushStart = null; render();
});
$("time").addEventListener("pointercancel", () => { brushStart = null; });
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 80); });
fetch("demo.json").then(response => {
  if (!response.ok) throw new Error("Preview data could not be loaded.");
  return response.json();
}).then(raw => { if (!data) install(raw); }).catch(error => { if (!data) message(error.message); });
