"use strict";
// Analytics tab: network-wide results from results.json (written by src/12_export_site_results.py).
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const AMBER = "#c98415", VIOLET = "#8f6ae0", GRID = "#26304a", AXIS = "#67738c", INK = "#e9ecf7", MUTED = "#a8b3cc";
  const state = {rule: "any_negative", nullModel: "global", lorenzZoom: false};
  let results = null, loading = null, failed = null;

  const pct = (x, digits = 1) => `${(100 * x).toFixed(digits)}%`;
  const fixed = (x, digits = 2) => Number(x).toFixed(digits);
  const int = n => Math.round(n).toLocaleString("en-US");

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // One shared tooltip. Rows lead with the value, then a line key and the label.
  const tip = el("div", "insight-tip");
  tip.hidden = true;
  tip.setAttribute("role", "status");
  function showTip(title, rows, x, y) {
    tip.replaceChildren();
    if (title) tip.append(el("div", "tip-title", title));
    for (const [value, label, colour] of rows) {
      const row = el("div", "tip-row");
      const key = el("span", "tip-key");
      key.style.background = colour || "transparent";
      row.append(el("strong", "", value), key, el("span", "", label));
      tip.append(row);
    }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(4, Math.min(x + 14, innerWidth - w - 6))}px`;
    tip.style.top = `${Math.max(4, y - h - 12)}px`;
  }
  const hideTip = () => { tip.hidden = true; };
  function hoverable(node, content) {
    node.setAttribute("tabindex", "0");
    node.addEventListener("pointermove", e => showTip(...content(), e.clientX, e.clientY));
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", () => { const b = node.getBoundingClientRect(); showTip(...content(), b.left + b.width / 2, b.top); });
    node.addEventListener("blur", hideTip);
  }

  function segmented(label, options, current, onChange) {
    const wrap = el("div", "insight-control");
    wrap.append(el("span", "control-label", label));
    const group = el("div", "segmented");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    for (const [value, text] of options) {
      const button = el("button", "", text);
      button.type = "button";
      button.setAttribute("aria-pressed", value === current);
      button.addEventListener("click", () => onChange(value));
      group.append(button);
    }
    wrap.append(group);
    return wrap;
  }

  function stat(value, label, note) {
    const tile = el("div", "stat");
    tile.append(el("strong", "", value), el("span", "", label));
    if (note) tile.append(el("small", "", note));
    return tile;
  }

  function legend(items) {
    const box = el("div", "chart-legend");
    for (const [label, colour, shape] of items) {
      const item = el("span");
      const key = el("i", shape === "line" ? "key-line" : "key-box");
      key.style.background = colour;
      item.append(key, document.createTextNode(label));
      box.append(item);
    }
    return box;
  }

  function tableView(caption, columns, rows) {
    const details = el("details", "table-view");
    details.append(el("summary", "", "Show table"));
    const table = el("table", "analytics-table");
    table.append(el("caption", "sr-only", caption));
    const head = table.createTHead().insertRow();
    for (const name of columns) { const th = el("th", "", name); th.scope = "col"; head.append(th); }
    const body = table.createTBody();
    for (const record of rows) { const row = body.insertRow(); for (const value of record) row.insertCell().textContent = value; }
    details.append(table);
    return details;
  }

  function card(title, lede) {
    const section = el("section", "insight-card");
    section.append(el("h2", "", title));
    if (lede) section.append(el("p", "lede", lede));
    return section;
  }

  // ---------- Structural balance ----------
  const TYPE_LABELS = ["0 negative edges", "1 negative edge", "2 negative edges", "3 negative edges"];
  function balanceCard(width) {
    const b = results.balance, rule = b.rules[state.rule], nul = rule.nulls[state.nullModel];
    const section = card("Structural balance: does the conclusion survive a stricter null?",
      `A triangle is balanced when it has zero or two negative sides. Across ${int(b.triangles)} triangles, ` +
      `compare the observed balanced share with ${int(b.shuffles)} sign shuffles. Switch the sign rule and the null model to see how the conclusion changes.`);
    const controls = el("div", "insight-controls");
    controls.append(
      segmented("Sign rule for a subreddit pair", [["any_negative", "Any negative link"], ["majority_negative", "Negative majority"]],
        state.rule, v => { state.rule = v; rerender(); }),
      segmented("Null model", [["global", "Global shuffle"], ["within_sender", "Within-sender shuffle"]],
        state.nullModel, v => { state.nullModel = v; rerender(); }));
    section.append(controls);

    const z = (rule.observed_balanced - nul.balanced_mean) / nul.balanced_sd;
    const gap = 100 * (rule.observed_balanced - nul.balanced_mean);
    const stats = el("div", "stats");
    stats.append(stat(pct(rule.observed_balanced, 2), "Observed balanced"),
      stat(pct(nul.balanced_mean, 2), "Null mean", `SD ${fixed(100 * nul.balanced_sd, 2)} pp`),
      stat(`${gap > 0 ? "+" : ""}${fixed(gap, 2)} pp`, "Observed − null", `z = ${fixed(z, 2)}`));
    section.append(stats);
    const ruleText = state.rule === "any_negative" ? "a pair is negative if it has any negative link" : "a pair is negative only when negative links outnumber the rest";
    const nullText = state.nullModel === "global" ? "shuffling signs across all pairs" : "shuffling signs within each sender, keeping its negative volume";
    const within = state.nullModel === "within_sender";
    const gapText = `${gap > 0 ? "+" : ""}${fixed(gap, 2)} pp, z = ${fixed(z, 2)}`;
    let verdict;
    if (Math.abs(z) < 1.96) {
      verdict = `No clear departure from this null (${gapText}). ` + (within
        ? "How much negativity each subreddit sends is enough to reproduce the balanced share."
        : "Signs placed at random on the same pairs give about the same balanced share.");
    } else if (Math.abs(z) < 3) {
      verdict = `A marginal difference (${gapText}): slightly ${z < 0 ? "fewer" : "more"} balanced triangles than this null, too small to support a conclusion either way.`;
    } else if (z < 0) {
      verdict = `Fewer triangles are balanced than this null expects (${gapText}): the network looks less balanced than chance, against the prediction of structural balance theory.`;
    } else {
      verdict = `More triangles are balanced than this null expects (${gapText}), in line with structural balance theory.`;
    }
    const conclusion = el("p", "verdict");
    conclusion.append(el("strong", "", "Conclusion. "), document.createTextNode(verdict));
    section.append(conclusion);
    section.append(el("p", "note", `Rule: ${ruleText}. Null: ${nullText}. ${int(rule.negative_edges)} of the undirected pairs are negative under this rule.`));

    // Diverging bars: log2(observed / null mean) per triangle type.
    const ratios = rule.observed_types.map((o, i) => o / nul.type_means[i]);
    const logs = ratios.map(r => Math.log2(r));
    const extent = Math.max(1, ...logs.map(Math.abs));
    const W = width, rowH = 40, labelW = Math.min(170, W * 0.36), H = 4 * rowH + 34;
    const x0 = labelW + (W - labelW - 16) / 2, half = (W - labelW - 16) / 2 - 56;
    const scale = v => x0 + v / extent * half;
    const chart = svg("svg", {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
      "aria-label": "Observed triangle counts relative to the null mean, by number of negative edges"});
    chart.append(svg("line", {x1: x0, x2: x0, y1: 4, y2: H - 26, stroke: AXIS}));
    for (const tick of [-extent, -extent / 2, extent / 2, extent].map(v => Math.round(v))) {
      if (!tick) continue;
      chart.append(svg("line", {x1: scale(tick), x2: scale(tick), y1: 4, y2: H - 26, stroke: GRID}));
      chart.append(svg("text", {x: scale(tick), y: H - 10, "text-anchor": "middle", class: "axis-text"},
        tick > 0 ? `${2 ** tick}×` : `1/${2 ** -tick}`));
    }
    chart.append(svg("text", {x: x0, y: H - 10, "text-anchor": "middle", class: "axis-text"}, "= null"));
    logs.forEach((value, i) => {
      const y = 6 + i * rowH, colour = value >= 0 ? AMBER : VIOLET;
      const balanced = i === 0 || i === 2;
      chart.append(svg("text", {x: 0, y: y + rowH / 2, class: "row-label"}, TYPE_LABELS[i]));
      chart.append(svg("text", {x: 0, y: y + rowH / 2 + 14, class: "row-sub"}, balanced ? "balanced" : "unbalanced"));
      const a = scale(Math.min(0, value)), bx = scale(Math.max(0, value));
      const bar = svg("rect", {x: a, y: y + 8, width: Math.max(2, bx - a), height: rowH - 18, rx: 4, fill: colour, class: "bar"});
      chart.append(bar);
      const label = `${ratios[i] >= 10 ? fixed(ratios[i], 0) : fixed(ratios[i], 2)}×`;
      chart.append(svg("text", {x: value >= 0 ? bx + 6 : a - 6, y: y + rowH / 2 + 3, "text-anchor": value >= 0 ? "start" : "end", class: "value-text"}, label));
      const hit = svg("rect", {x: labelW - 4, y, width: W - labelW + 4, height: rowH, fill: "transparent"});
      hoverable(hit, () => [`${TYPE_LABELS[i]} (${balanced ? "balanced" : "unbalanced"})`, [
        [int(rule.observed_types[i]), "observed", INK],
        [int(nul.type_means[i]), "null mean", MUTED],
        [`${fixed(ratios[i], 2)}×`, `observed / null, z = ${fixed(nul.type_z[i], 1)}`, colour]]]);
      chart.append(hit);
    });
    section.append(legend([["More triangles than the null", AMBER], ["Fewer triangles than the null", VIOLET]]), chart);
    section.append(tableView("Triangle counts against the selected null",
      ["Triangle type", "Observed", "Null mean", "Observed / null", "z"],
      rule.observed_types.map((o, i) => [TYPE_LABELS[i], int(o), int(nul.type_means[i]), fixed(ratios[i], 2), fixed(nul.type_z[i], 1)])));
    return section;
  }

  // ---------- Generic line chart with crosshair ----------
  function lineChart({width, height = 280, xDomain, yDomain, series, xTicks, yTicks, xFormat, yFormat, xLabel, yLabel,
                      categorical = null, reference = null, readout, aria}) {
    const W = width, H = height, left = 52, right = 16, top = 14, bottom = 46;
    const sx = v => left + (v - xDomain[0]) / (xDomain[1] - xDomain[0]) * (W - left - right);
    const sy = v => H - bottom - (v - yDomain[0]) / (yDomain[1] - yDomain[0]) * (H - top - bottom);
    const chart = svg("svg", {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": aria});
    for (const t of yTicks) {
      chart.append(svg("line", {x1: left, x2: W - right, y1: sy(t), y2: sy(t), stroke: GRID}));
      chart.append(svg("text", {x: left - 8, y: sy(t) + 4, "text-anchor": "end", class: "axis-text"}, yFormat(t)));
    }
    for (const t of xTicks) {
      chart.append(svg("text", {x: sx(t), y: H - bottom + 18, "text-anchor": "middle", class: "axis-text"},
        categorical ? categorical[t] : xFormat(t)));
    }
    chart.append(svg("line", {x1: left, x2: W - right, y1: H - bottom, y2: H - bottom, stroke: AXIS}));
    chart.append(svg("text", {x: (left + W - right) / 2, y: H - 6, "text-anchor": "middle", class: "axis-title"}, xLabel));
    const yTitle = svg("text", {x: 0, y: 0, "text-anchor": "middle", class: "axis-title",
      transform: `translate(13 ${(top + H - bottom) / 2}) rotate(-90)`}, yLabel);
    chart.append(yTitle);
    const clip = `clip${Math.random().toString(36).slice(2)}`;
    const cp = svg("clipPath", {id: clip});
    cp.append(svg("rect", {x: left, y: top - 6, width: W - left - right, height: H - top - bottom + 12}));
    chart.append(cp);
    const plot = svg("g", {"clip-path": `url(#${clip})`});
    chart.append(plot);
    if (reference) plot.append(svg("path", {d: `M${reference.map(([x, y]) => `${sx(x)},${sy(y)}`).join("L")}`,
      fill: "none", stroke: AXIS, "stroke-dasharray": "4 4", "stroke-width": 1.2}));
    for (const s of series) {
      const pts = s.points.filter(([x, y]) => y !== null && x >= xDomain[0] - 1e-9);
      plot.append(svg("path", {d: `M${pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join("L")}`, fill: "none",
        stroke: s.colour, "stroke-width": 2, "stroke-linejoin": "round"}));
      if (s.markers) for (const [x, y] of pts) plot.append(svg("circle", {cx: sx(x), cy: sy(y), r: 4.5, fill: s.colour, stroke: "#0b1021", "stroke-width": 2}));
      if (s.labels) for (const [x, y, text] of s.labels) plot.append(svg("text", {x: sx(x), y: sy(y) - 11, "text-anchor": "middle", class: "value-text"}, text));
    }
    // Crosshair: snaps to the nearest x and reads out every series there.
    const hair = svg("line", {y1: top, y2: H - bottom, stroke: MUTED, "stroke-width": 1, visibility: "hidden"});
    chart.append(hair);
    const overlay = svg("rect", {x: left, y: top, width: W - left - right, height: H - top - bottom, fill: "transparent", tabindex: 0});
    const move = (clientX, clientY) => {
      const box = chart.getBoundingClientRect();
      const px = (clientX - box.left) * W / box.width;
      const value = xDomain[0] + (px - left) / (W - left - right) * (xDomain[1] - xDomain[0]);
      const [x, title, rows] = readout(Math.max(xDomain[0], Math.min(xDomain[1], value)));
      hair.setAttribute("x1", sx(x)); hair.setAttribute("x2", sx(x)); hair.setAttribute("visibility", "visible");
      showTip(title, rows, clientX, clientY);
    };
    overlay.addEventListener("pointermove", e => move(e.clientX, e.clientY));
    overlay.addEventListener("pointerleave", () => { hair.setAttribute("visibility", "hidden"); hideTip(); });
    overlay.addEventListener("focus", () => { const b = overlay.getBoundingClientRect(); move(b.right - 2, b.top); });
    overlay.addEventListener("blur", () => { hair.setAttribute("visibility", "hidden"); hideTip(); });
    chart.append(overlay);
    return chart;
  }

  const interp = (curve, x) => {
    let i = curve.findIndex(([cx]) => cx >= x);
    if (i <= 0) return curve[Math.max(0, i)][1];
    const [x0, y0] = curve[i - 1], [x1, y1] = curve[i];
    return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  };

  // ---------- Concentration ----------
  function lorenzCard(width) {
    const L = results.lorenz;
    const section = card("Concentration: who sends the negative links?",
      `Lorenz curves rank all ${int(L.subreddits)} subreddits by links sent, lowest first. The further a curve sags below the diagonal, the more concentrated sending is.`);
    const stats = el("div", "stats");
    stats.append(stat(pct(L.negative_out.top_shares["1.0%"]), "of negative links sent by the top 1%", `${pct(L.all_out.top_shares["1.0%"])} of all links`),
      stat(pct(L.negative_out.top_shares["0.1%"]), "of negative links sent by the top 0.1%", `${pct(L.all_out.top_shares["0.1%"])} of all links`),
      stat(fixed(L.negative_out.gini, 3), "Gini, negative links", `${fixed(L.all_out.gini, 3)} for all links`));
    section.append(stats);
    const controls = el("div", "insight-controls");
    controls.append(segmented("Range", [[false, "All subreddits"], [true, "Top 10% of senders"]], state.lorenzZoom,
      v => { state.lorenzZoom = v; rerender(); }));
    section.append(controls);
    const x0 = state.lorenzZoom ? 0.9 : 0;
    const neg = L.negative_out.curve, all = L.all_out.curve;
    const xTicks = state.lorenzZoom ? [0.9, 0.92, 0.94, 0.96, 0.98, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1];
    section.append(legend([["Negative links sent", AMBER, "line"], ["All links sent", VIOLET, "line"], ["Equal sending", AXIS, "line"]]));
    section.append(lineChart({
      width, xDomain: [x0, 1], yDomain: [0, 1], xTicks, yTicks: [0, 0.25, 0.5, 0.75, 1],
      xFormat: v => `${Math.round(v * 100)}%`, yFormat: v => `${Math.round(v * 100)}%`,
      xLabel: "Share of subreddits, ranked by links sent", yLabel: "Share of links",
      reference: [[x0, x0], [1, 1]],
      series: [{points: all, colour: VIOLET}, {points: neg, colour: AMBER}],
      aria: "Lorenz curves for negative and all outgoing links",
      readout: x => {
        const top = 1 - x;
        return [x, `Top ${top < 0.01 ? fixed(100 * top, 2) : fixed(100 * top, 1)}% of senders`, [
          [pct(1 - interp(neg, x)), "of negative links", AMBER],
          [pct(1 - interp(all, x)), "of all links", VIOLET]]];
      },
    }));
    section.append(tableView("Top-group shares", ["Top group", "Negative links sent", "All links sent"],
      ["0.1%", "1.0%", "10.0%"].map(k => [`Top ${k}`, pct(L.negative_out.top_shares[k]), pct(L.all_out.top_shares[k])])));
    return section;
  }

  // ---------- Repeat conflict by early volume ----------
  function repeatCard(width) {
    const R = results.repeat, rows = R.by_early_volume;
    const section = card("Repeat conflict among pairs with similar early activity",
      "For directed pairs linked before 2016: how often does a pair receive a negative link from 2016 onward? Pairs with more early links have more chances to be labeled negative, so compare within bins of early link volume.");
    const stats = el("div", "stats");
    const ci = R.matched.ci95;
    stats.append(stat(`${fixed(R.crude.risk_ratio)}×`, "Crude risk ratio", `${pct(R.crude.exposed, 2)} vs ${pct(R.crude.unexposed, 2)}`),
      stat(`${fixed(R.matched.risk_ratio)}×`, "Matched on early volume", `95% CI ${fixed(ci[0])}–${fixed(ci[1])}`),
      stat(`${fixed(R.later_active_matched.risk_ratio)}×`, "Also matched on later volume", "pairs active in both periods"));
    section.append(stats);
    const verdict = el("p", "verdict");
    verdict.append(el("strong", "", "Conclusion. "), document.createTextNode(
      `Early volume explains part of the headline. Within volume bins, an early negative label still roughly triples the later risk ` +
      `(${fixed(R.matched.risk_ratio)}× pooled), but the crude ${fixed(R.crude.risk_ratio)}× overstates it.`));
    section.append(verdict);
    const labels = rows.map(r => r.early_links);
    const exposed = rows.map((r, i) => [i, r.exposed_risk]), unexposed = rows.map((r, i) => [i, r.unexposed_risk]);
    section.append(legend([["Early negative label", AMBER, "line"], ["No early negative label", VIOLET, "line"]]));
    section.append(lineChart({
      width, xDomain: [-0.4, rows.length - 0.6], yDomain: [0, 1.1], xTicks: rows.map((_, i) => i), categorical: labels,
      yTicks: [0, 0.25, 0.5, 0.75, 1], yFormat: v => `${Math.round(v * 100)}%`,
      xLabel: "Links on the directed pair before 2016", yLabel: "Later negative link",
      series: [
        {points: unexposed, colour: VIOLET, markers: true},
        {points: exposed, colour: AMBER, markers: true,
         labels: rows.map((r, i) => [i, r.exposed_risk, r.risk_ratio === null ? "" : `${fixed(r.risk_ratio, 1)}×`])}],
      aria: "Later negative risk by early link volume, with and without an early negative label",
      readout: x => {
        const i = Math.max(0, Math.min(rows.length - 1, Math.round(x))), r = rows[i];
        return [i, `${r.early_links} early link${r.early_links === "1" ? "" : "s"} · ratio ${r.risk_ratio === null ? "—" : fixed(r.risk_ratio) + "×"}`, [
          [pct(r.exposed_risk), `early negative (${int(r.exposed_pairs)} pairs)`, AMBER],
          [pct(r.unexposed_risk), `no early negative (${int(r.unexposed_pairs)} pairs)`, VIOLET]]];
      },
    }));
    section.append(el("p", "note", "Few pairs fall in the 50+ bins, so their ratios are imprecise. Associations only: activity and shared interests can drive both periods."));
    section.append(tableView("Later negative risk by early link volume",
      ["Early links", "Pairs with early negative", "Later risk", "Pairs without", "Later risk", "Risk ratio"],
      rows.map(r => [r.early_links, int(r.exposed_pairs), pct(r.exposed_risk, 2), int(r.unexposed_pairs), pct(r.unexposed_risk, 2),
        r.risk_ratio === null ? "—" : fixed(r.risk_ratio)])));
    return section;
  }

  // ---------- Language ----------
  function languageCard(width) {
    const lang = results.language, feats = lang.top_features;
    const section = card("Language: what distinguishes negative-labeled links?",
      "Standardized mean difference between negative and other links for the ten largest text properties, with 95% bootstrap intervals. Positive means higher on negative links.");
    const W = width, rowH = 26, labelW = Math.min(150, W * 0.34), H = feats.length * rowH + 30;
    const extent = Math.ceil(Math.max(...feats.map(f => Math.max(Math.abs(f.ci_low), Math.abs(f.ci_high)))) * 2) / 2;
    const hasNeg = feats.some(f => f.smd < 0);
    const lo = hasNeg ? -extent : 0;
    const sx = v => labelW + (v - lo) / (extent - lo) * (W - labelW - 44);
    const chart = svg("svg", {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Effect sizes of the top text properties"});
    for (let t = Math.ceil(lo * 2) / 2; t <= extent + 1e-9; t += 0.5) {
      chart.append(svg("line", {x1: sx(t), x2: sx(t), y1: 0, y2: H - 22, stroke: t === 0 ? AXIS : GRID}));
      chart.append(svg("text", {x: sx(t), y: H - 6, "text-anchor": "middle", class: "axis-text"}, fixed(t, 1)));
    }
    feats.forEach((f, i) => {
      const y = i * rowH, colour = f.smd >= 0 ? AMBER : VIOLET;
      chart.append(svg("text", {x: 0, y: y + rowH / 2 + 4, class: "row-label"}, f.feature));
      const a = sx(Math.min(0, f.smd)), b = sx(Math.max(0, f.smd));
      chart.append(svg("rect", {x: a, y: y + 6, width: Math.max(2, b - a), height: rowH - 12, rx: 3, fill: colour}));
      chart.append(svg("line", {x1: sx(f.ci_low), x2: sx(f.ci_high), y1: y + rowH / 2, y2: y + rowH / 2, stroke: INK, "stroke-width": 1.5}));
      chart.append(svg("text", {x: sx(Math.max(0, f.smd, f.ci_high)) + 5, y: y + rowH / 2 + 4, class: "value-text"}, fixed(f.smd)));
      const hit = svg("rect", {x: 0, y, width: W, height: rowH, fill: "transparent"});
      hoverable(hit, () => [f.feature, [[fixed(f.smd), "standardized difference", colour],
        [`${fixed(f.ci_low)} to ${fixed(f.ci_high)}`, "95% bootstrap interval", MUTED], ["", f.description, null]]]);
      chart.append(hit);
    });
    section.append(legend([["Higher on negative links", AMBER], ["Lower on negative links", VIOLET]]), chart);
    const m = lang.models;
    const table = el("table", "analytics-table compact");
    const head = table.createTHead().insertRow();
    for (const name of ["Model on unseen source subreddits", "PR-AUC, all features", "Without 9 sentiment features"]) {
      const th = el("th", "", name); th.scope = "col"; head.append(th);
    }
    const body = table.createTBody();
    for (const [key, name] of [["gradient_boosted", "Gradient boosting"], ["logistic", "Logistic regression"]]) {
      const row = body.insertRow();
      row.insertCell().textContent = name;
      row.insertCell().textContent = fixed(m.all_features[key].pr_auc, 3);
      row.insertCell().textContent = fixed(m.without_sentiment[key].pr_auc, 3);
    }
    section.append(table);
    section.append(el("p", "note", `${int(lang.test_rows)} held-out rows from ${int(lang.test_sources)} source subreddits; ${pct(lang.prevalence, 2)} are negative, which is the PR-AUC of guessing. Models predict the published classifier labels.`));
    section.append(tableView("Top text properties", ["Property", "Effect", "95% interval", "Meaning"],
      feats.map(f => [f.feature, fixed(f.smd), `${fixed(f.ci_low)} to ${fixed(f.ci_high)}`, f.description])));
    return section;
  }

  // ---------- Course extensions ----------
  function courseCard() {
    const d = results.deepwalk, bt = results.betweenness, p = results.prediction;
    const section = card("Network embeddings, bridges and prediction", "Three course extensions computed on the full graph.");
    const grid = el("div", "mini-grid");
    const block = (title, tiles, note) => {
      const box = el("div", "mini");
      box.append(el("h3", "", title));
      const stats = el("div", "stats");
      for (const t of tiles) stats.append(stat(...t));
      box.append(stats, el("p", "note", note));
      return box;
    };
    grid.append(
      block("DeepWalk vs shared-user embeddings", [
        [fixed(d.negative.row_spearman, 3), "Spearman, negative links", `${int(d.negative.rows)} links`],
        [fixed(d.nonnegative.row_spearman, 3), "Spearman, other links", `${int(d.nonnegative.rows)} links`]],
        "Hyperlink-graph proximity and audience overlap agree moderately, a little less on negative links. Pair-weighted values are almost identical."),
      block("Bridging communities", [
        [int(bt.source.top_median_external_neighbours), "median outside-community neighbours, top 1% senders", "others: 0"],
        [int(bt.target.top_median_external_neighbours), "median outside-community neighbours, top 1% recipients", "others: 0"]],
        `Negative volume correlates with estimated betweenness (Spearman ${fixed(bt.source.spearman, 3)} sending, ${fixed(bt.target.spearman, 3)} receiving).`),
      block("Predicting negative links from network position", [
        [fixed(p.pr_auc, 3), "PR-AUC on links from 2016", `${int(p.test_rows)} links`],
        [fixed(p.test_prevalence, 3), "PR-AUC of guessing (prevalence)", `lift ${fixed(p.pr_auc / p.test_prevalence)}×`]],
        "Degree, shared-user similarity and community agreement carry a weak signal on their own."));
    section.append(grid);
    return section;
  }

  let target = null;
  function rerender() { if (target) build(target); }

  function build(container) {
    const width = Math.max(300, Math.min(container.clientWidth || 700, 900));
    const scroll = document.scrollingElement.scrollTop;
    container.replaceChildren(balanceCard(width), lorenzCard(width), repeatCard(width), languageCard(width), courseCard());
    document.scrollingElement.scrollTop = scroll;
  }

  window.renderInsights = container => {
    target = container;
    if (!tip.isConnected) document.body.append(tip);
    if (results) return build(container);
    if (failed) { container.replaceChildren(el("p", "", failed)); return; }
    if (!loading) loading = fetch("/results.json").then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(json => { results = json; if (target) build(target); })
      .catch(() => { failed = "The analysis results could not be loaded."; if (target) target.replaceChildren(el("p", "", failed)); });
  };
})();
