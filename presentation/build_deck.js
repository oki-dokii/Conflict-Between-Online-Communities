// Builds presentation/Conflict_Between_Online_Communities.pptx.
// Every number comes from results/key_numbers.json (full SNAP run).
// Run from the repository root with pptxgenjs on NODE_PATH:
//   NODE_PATH=<dir with node_modules> node presentation/build_deck.js <path to pptx skill apply_theme.js>
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.argv[2]);

const ROOT = path.resolve(__dirname, "..");
const K = JSON.parse(fs.readFileSync(path.join(ROOT, "results/key_numbers.json"), "utf8"));
const OUT = path.join(__dirname, "Conflict_Between_Online_Communities.pptx");
const ASSET = name => path.join(__dirname, "assets", name);

const THEME = {
  name: "Conflict Academic",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1F2433", lt1: "FFFFFF", dk2: "4A5568", lt2: "F2F4F7",
    accent1: "B4472E", accent2: "35629A", accent3: "8A94A8", accent4: "C98415", accent5: "5B8A72", accent6: "6B4F9A",
    hlink: "35629A", folHlink: "6B4F9A",
  },
};
const HEX = THEME.colors;
const NEG = HEX.accent1, OTH = HEX.accent2, GRIDC = "E3E7EE", AXISC = "4A5568";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.title = "Conflict Between Online Communities";
pres.subject = "AIM608 Network Semantics project";
pres.author = "Soham, Ansh, Ridwan, Kkshiteej";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333, M = 0.6;

// ---------- Layouts ----------
const footer = [
  { text: { text: "Conflict Between Online Communities · AIM608", options: { x: M, y: 7.0, w: 7, h: 0.3, fontSize: 10, color: C.text2, margin: 0 } } },
];
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  objects: [
    ...footer,
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.4, w: 9.9, h: 0.9, fontFace: THEME.headFontFace, fontSize: 32, bold: true, color: C.text1, valign: "middle", align: "left", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.text2, align: "right" },
});
pres.defineSlideMaster({
  title: "SECTION",
  background: { color: HEX.lt2 },
  objects: [
    ...footer,
    { placeholder: { options: { name: "title", type: "title", x: 1.6, y: 2.55, w: 10, h: 1.2, fontFace: THEME.headFontFace, fontSize: 40, bold: true, color: C.text1, valign: "middle", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 1.6, y: 3.8, w: 10, h: 1.2, fontSize: 18, color: C.text2, valign: "top", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.text2, align: "right" },
});
pres.defineSlideMaster({ title: "TITLE", background: { color: HEX.lt1 }, objects: [] });

// ---------- Helpers ----------
let shapeId = 0;
const nm = base => `${base}-${++shapeId}`;
function text(slide, value, opts) {
  slide.addText(value, { isTextBox: true, fontSize: 15, color: C.text1, margin: 0, valign: "top", objectName: nm("text"), ...opts });
}
function badge(slide, who) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: W - M - 2.2, y: 0.6, w: 2.2, h: 0.5, rectRadius: 0.25, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm("presenter-pill") });
  slide.addShape(pres.shapes.OVAL, { x: W - M - 2.13, y: 0.66, w: 0.38, h: 0.38, fill: { color: C.accent2 }, line: { color: C.accent2 }, objectName: nm("presenter-dot") });
  text(slide, who[0], { x: W - M - 2.13, y: 0.66, w: 0.38, h: 0.38, fontSize: 13, bold: true, color: C.background1, align: "center", valign: "middle" });
  text(slide, who, { x: W - M - 1.65, y: 0.6, w: 1.5, h: 0.5, fontSize: 13, color: C.text1, valign: "middle" });
}
function content(section, title, who) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  badge(s, who);
  return s;
}
function card(slide, x, y, w, h, fill = C.background2) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill }, objectName: nm("card") });
}
function bigStat(slide, x, y, w, value, label, colour = C.text1, size = 40) {
  text(slide, value, { x, y, w, h: 0.75, fontFace: THEME.headFontFace, fontSize: size, bold: true, color: colour, valign: "bottom" });
  text(slide, label, { x, y: y + 0.8, w, h: 0.7, fontSize: 14, color: C.text2 });
}
function numberDot(slide, x, y, n, colour = C.accent2, d = 0.5) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: colour }, line: { color: colour }, objectName: nm("num") });
  text(slide, String(n), { x, y, w: d, h: d, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle" });
}
function line(slide, x1, y1, x2, y2, colour, width = 2.5, dash = "solid") {
  slide.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(0.001, Math.abs(x2 - x1)), h: Math.max(0.001, Math.abs(y2 - y1)),
    flipH: x2 < x1, flipV: y2 < y1, line: { color: colour, width, dashType: dash }, objectName: nm("edge"),
  });
}
function arrow(slide, x1, y1, x2, y2, colour, width = 2) {
  slide.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(0.001, Math.abs(x2 - x1)), h: Math.max(0.001, Math.abs(y2 - y1)),
    flipH: x2 < x1, flipV: y2 < y1, line: { color: colour, width, endArrowType: "triangle" }, objectName: nm("arrow"),
  });
}
// Triangle of three subreddits; signs: array of 3 booleans (true = negative) for edges AB, BC, CA.
function triangle(slide, cx, cy, size, signs, labels = ["", "", ""]) {
  const pts = [[cx, cy - size * 0.55], [cx - size * 0.6, cy + size * 0.45], [cx + size * 0.6, cy + size * 0.45]];
  const edges = [[0, 1], [1, 2], [2, 0]];
  edges.forEach(([a, b], i) => line(slide, pts[a][0], pts[a][1], pts[b][0], pts[b][1], signs[i] ? NEG : OTH, 3, signs[i] ? "dash" : "solid"));
  const r = size * 0.13;
  pts.forEach(([x, y], i) => {
    slide.addShape(pres.shapes.OVAL, { x: x - r, y: y - r, w: 2 * r, h: 2 * r, fill: { color: C.background1 }, line: { color: C.text1, width: 1.5 }, objectName: nm("node") });
    if (labels[i]) text(slide, labels[i], { x: x - r, y: y - r, w: 2 * r, h: 2 * r, fontSize: 12, bold: true, align: "center", valign: "middle" });
  });
}
function legendKey(slide, x, y, colour, label, dash = false) {
  line(slide, x, y + 0.13, x + 0.45, y + 0.13, colour, 3, dash ? "dash" : "solid");
  text(slide, label, { x: x + 0.55, y, w: 3, h: 0.28, fontSize: 13, color: C.text2, valign: "middle" });
}
const chartText = { catAxisLabelColor: AXISC, valAxisLabelColor: AXISC, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
  catAxisLabelFontSize: 13, valAxisLabelFontSize: 12, dataLabelFontFace: "+mn-lt", dataLabelFontSize: 12, dataLabelColor: "1F2433",
  legendFontFace: "+mn-lt", legendFontSize: 13, legendColor: AXISC, titleFontFace: "+mn-lt", titleFontSize: 14, titleColor: "1F2433",
  valGridLine: { color: GRIDC, size: 1 }, catGridLine: { style: "none" }, catAxisLineColor: "B8C0CC", valAxisLineShow: false };
function notes(slide, n) {
  slide.addNotes([
    `PRESENTER: ${n.who}   ·   TIME: ${n.time}`,
    "",
    `KEY MESSAGE: ${n.message}`,
    "",
    "WHAT TO SAY:",
    ...n.say.map(s => `• ${s}`),
    "",
    "PREPARE BEFOREHAND (to understand and explain this slide):",
    ...n.prep.map(s => `• ${s}`),
    "",
    "LIKELY QUESTIONS:",
    ...n.qa.map(([q, a]) => `Q: ${q}\nA: ${a}`),
  ].join("\n"));
}
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const int = n => Math.round(n).toLocaleString("en-US");

// ---------- Numbers ----------
const B = K.build, NS = K.node_stats, BAL = K.balance, REP = K.repeat.temporal, RV = K.repeat_by_volume;
const COM = K.communities.structural_links, EMB = K.communities.embedding_links, LANG = K.language, CO = K.course;
const any = BAL.any_negative, maj = BAL.majority_negative;
const zb = (r, nul) => (r.balanced_fraction - nul.null_balanced_fraction_mean) / nul.null_balanced_fraction_std;

// =====================================================================
// SECTION 1 · SOHAM · Question, data and pipeline
// =====================================================================
const S1 = "1 · Question and data (Soham)";
pres.addSection({ title: S1 });
{
  const s = pres.addSlide({ masterName: "TITLE", sectionTitle: S1 });
  text(s, "AIM608 · Network Semantics project", { x: M + 0.2, y: 1.2, w: 7, h: 0.4, fontSize: 16, color: C.accent2, bold: true });
  text(s, "Conflict Between Online Communities", { x: M + 0.2, y: 1.75, w: 7.2, h: 1.9, fontFace: THEME.headFontFace, fontSize: 44, bold: true, valign: "top" });
  text(s, "Where negative hyperlinks between Reddit communities go, who sends them, and what predicts them",
    { x: M + 0.2, y: 3.75, w: 6.8, h: 1.0, fontSize: 20, color: C.text2 });
  text(s, "Soham · Ansh · Ridwan · Kkshiteej", { x: M + 0.2, y: 5.3, w: 7, h: 0.4, fontSize: 18, bold: true });
  text(s, "Data: SNAP Reddit Hyperlink Network, Jan 2014 – Apr 2017", { x: M + 0.2, y: 5.75, w: 7, h: 0.35, fontSize: 14, color: C.text2 });
  card(s, 8.3, 1.2, 4.4, 4.9);
  triangle(s, 10.5, 3.45, 3.0, [false, true, true], ["A", "B", "C"]);
  legendKey(s, 8.75, 5.35, OTH, "neutral or positive link");
  legendKey(s, 8.75, 5.7, NEG, "negative link", true);
  notes(s, {
    who: "Soham", time: "0:45",
    message: "We study conflict between Reddit communities as a signed, directed network.",
    say: ["Introduce the team and the project in one sentence: we analysed about 860,000 hyperlinks between subreddits, about one in ten labeled negative.",
      "Point to the diagram: each circle is a subreddit, each line a hyperlink; red dashed lines are negative links. This triangle picture returns when Ansh discusses structural balance.",
      "Say who presents what: Soham (question, data, pipeline), Ansh (concentration and balance), Ridwan (repeat conflict, audiences, language), Kkshiteej (live demo, extensions, conclusions)."],
    prep: ["Read the README top section and the 'Data and reported numbers' table.",
      "Skim the SNAP dataset page (snap.stanford.edu/data/soc-RedditHyperlinks.html) so you can describe where the data came from.",
      "Know what a 'signed directed network' is: edges have a direction (source → target) and a sign (+ or −)."],
    qa: [["Who created the dataset?", "Kumar, Hamilton, Leskovec and Jurafsky (WWW 2018), released through Stanford SNAP."],
      ["Is this all of Reddit?", "No. It covers hyperlinks from one subreddit's post to another subreddit, January 2014 to April 2017."]],
  });
}
{
  const s = content(S1, "Agenda", "Soham");
  const parts = [
    ["Question and data", "Soham", "Slides 1–5", "What we ask, the SNAP data, and our pipeline"],
    ["Concentration and balance", "Ansh", "Slides 6–10", "Who sends negativity; does structural balance hold; communities"],
    ["Repeats and language", "Ridwan", "Slides 11–15", "Do conflicts recur; who gets targeted; what the text says"],
    ["Demo and conclusions", "Kkshiteej", "Slides 16–20", "Conflict Atlas live demo, extensions, takeaways"],
  ];
  const cw = (W - 2 * M - 3 * 0.3) / 4;
  parts.forEach(([title, who, range, desc], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 1.75, cw, 4.6);
    numberDot(s, x + 0.3, 2.05, i + 1);
    text(s, title, { x: x + 0.3, y: 2.8, w: cw - 0.6, h: 0.9, fontFace: THEME.headFontFace, fontSize: 20, bold: true });
    text(s, who, { x: x + 0.3, y: 3.8, w: cw - 0.6, h: 0.4, fontSize: 16, bold: true, color: C.accent2 });
    text(s, range, { x: x + 0.3, y: 4.2, w: cw - 0.6, h: 0.35, fontSize: 13, color: C.text2 });
    text(s, desc, { x: x + 0.3, y: 4.7, w: cw - 0.6, h: 1.4, fontSize: 15, color: C.text1 });
  });
  notes(s, {
    who: "Soham", time: "0:45",
    message: "Four parts, one presenter each, five slides each.",
    say: ["Walk through the four parts left to right, naming the presenter of each.",
      "Mention that the live demo is in part 4, so the audience knows to hold questions about the tool until then."],
    prep: ["Know the overall story order so you can hand over smoothly to Ansh at slide 6."],
    qa: [["How long is the talk?", "About 25–30 minutes including the live demo; questions at the end."]],
  });
}
{
  const s = content(S1, "Four questions about negative links", "Soham");
  text(s, [
    { text: "Subreddits link to each other all the time. ", options: {} },
    { text: `About ${pct(B.negative_link_share, 1)} of those hyperlinks are labeled negative`, options: { bold: true } },
    { text: ": a post in one community criticises or attacks another. Conflict can spill over and mobilise users across communities (Kumar et al., 2018).", options: {} },
  ], { x: M, y: 1.75, w: 4.1, h: 3.2, fontSize: 17, color: C.text1 });
  text(s, "We treat each subreddit as a node and each hyperlink as a signed, directed edge, then ask:", { x: M, y: 4.2, w: 4.1, h: 1.2, fontSize: 15, color: C.text2 });
  const qs = [["Who sends negative links?", "How concentrated is negativity across communities?"],
    ["Does structural balance hold?", "Are triangles of communities 'balanced' more often than chance?"],
    ["Does conflict repeat?", "Does an early negative link predict later ones on the same pair?"],
    ["What predicts negativity?", "Community structure, shared audiences, and the language of the post."]];
  qs.forEach(([q, d], i) => {
    const x = 5.2 + (i % 2) * 3.85, y = 1.75 + Math.floor(i / 2) * 2.35;
    card(s, x, y, 3.6, 2.1);
    numberDot(s, x + 0.25, y + 0.25, i + 1, C.accent1, 0.45);
    text(s, q, { x: x + 0.85, y: y + 0.22, w: 2.55, h: 0.75, fontFace: THEME.headFontFace, fontSize: 17, bold: true, valign: "middle" });
    text(s, d, { x: x + 0.25, y: y + 1.05, w: 3.15, h: 0.9, fontSize: 14, color: C.text2 });
  });
  notes(s, {
    who: "Soham", time: "1:15",
    message: "Negative links are a measurable form of inter-community conflict; we ask four questions about them.",
    say: ["Explain what a negative link is: a post in subreddit A that links to subreddit B with negative sentiment, e.g. r/subredditdrama linking to a thread to mock it.",
      "Read the four questions; each maps to a later part of the talk (1 and 2 → Ansh, 3 and 4 → Ridwan).",
      "Mention prior work: Kumar et al. (2018) showed that negative links can trigger 'brigading' and user mobilisation."],
    prep: ["Read the README introduction and 'Findings for the presentation'.",
      "Skim Kumar et al., 'Community Interaction and Conflict on the Web' (WWW 2018), abstract and introduction.",
      "Be able to define: node, directed edge, signed edge, subreddit."],
    qa: [["Why is this a network problem rather than text classification?", "Because the questions are about structure: who links to whom, triangles, repeated pairs, and communities."],
      ["What counts as negative?", "The dataset's label, produced by a sentiment classifier trained by the dataset authors. We do not relabel posts."]],
  });
}
{
  const s = content(S1, "The SNAP Reddit hyperlink network", "Soham");
  const stats = [
    [int(B.hyperlink_rows), "hyperlinks between subreddits (title + body posts)"],
    [int(B.subreddit_nodes), "subreddits in the network"],
    [`${int(B.negative_links)}`, `negative links (${pct(B.negative_link_share, 2)})`],
    ["41 months", "December 2013 to April 2017 (UTC)"],
    ["86", "text properties per link (LIWC, VADER, length)"],
    [`${int(B.embedding_rows)}`, "subreddit embeddings, 300 dimensions, from shared users"],
  ];
  stats.forEach(([v, l], i) => {
    const x = M + (i % 3) * 4.1, y = 1.7 + Math.floor(i / 3) * 2.15;
    card(s, x, y, 3.8, 1.9);
    bigStat(s, x + 0.3, y + 0.15, 3.3, v, l, i === 2 ? C.accent1 : C.text1, 36);
  });
  text(s, `Negative share differs by source: ${pct(K.data_check.title.negative_share, 1)} of title links vs ${pct(K.data_check.body.negative_share, 1)} of body links. ` +
    `SNAP's summary page reports 55,863 subreddits; we count ${int(B.subreddit_nodes)} from the files themselves, matching Netzschleuder.`,
    { x: M, y: 6.15, w: W - 2 * M, h: 0.7, fontSize: 13, color: C.text2 });
  notes(s, {
    who: "Soham", time: "1:30",
    message: "A large, labeled, timestamped network: 858,488 links among 67,180 subreddits, 9.58% negative.",
    say: ["Each row is one hyperlink from a post in a source subreddit to a target subreddit, with a timestamp and a label: −1 negative, +1 neutral or positive.",
      "Every link also carries 86 numeric text properties of the source post (word counts, LIWC categories, VADER sentiment); the raw post text is not released.",
      "Separately, SNAP provides 300-dimensional embeddings of subreddits built from which users post in them: two subreddits are close if they share users.",
      "Footnote: our node count (67,180) differs from SNAP's page (55,863); we count every name that appears in either file, which matches the Netzschleuder copy."],
    prep: ["Run or read src/00_check_data.py and src/01_build.py sections of the README; know the difference between title and body files.",
      "Read results/key_numbers.json → 'build' and 'data_check' (numbers on this slide).",
      "Understand LIWC (word-category counts such as anger, negative emotion) and VADER (rule-based sentiment score) at a one-sentence level."],
    qa: [["Why 41 months if SNAP says Jan 2014?", "The first records are on 31 Dec 2013 in UTC, so December 2013 appears as a partial month."],
      ["How many subreddits have embeddings?", `${int(B.nodes_with_embeddings)} of ${int(B.subreddit_nodes)} (46.5%), but they cover 93.4% of negative links, because active subreddits are the ones embedded.`]],
  });
}
{
  const s = content(S1, "A reproducible pipeline, raw files to results", "Soham");
  const steps = [
    ["Audit and build", "00–01", "Check every row has 86 properties; build typed edge, pair and graph tables"],
    ["Network analyses", "02–08", "Concentration, balance, communities, audience distance, language, time, repeats"],
    ["Extensions", "10–11", "DeepWalk, betweenness, link prediction, volume-matched repeats"],
    ["Atlas and site", "09, 12", "Seeded UMAP map and the interactive Conflict Atlas website"],
  ];
  const bw = 2.75, gap = 0.37;
  steps.forEach(([t, scripts, d], i) => {
    const x = M + i * (bw + gap);
    card(s, x, 1.8, bw, 2.9);
    text(s, scripts, { x: x + 0.25, y: 1.95, w: bw - 0.5, h: 0.4, fontSize: 13, bold: true, color: C.accent2 });
    text(s, t, { x: x + 0.25, y: 2.35, w: bw - 0.5, h: 0.5, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
    text(s, d, { x: x + 0.25, y: 2.95, w: bw - 0.5, h: 1.6, fontSize: 14, color: C.text2 });
    if (i < steps.length - 1) arrow(s, x + bw + 0.05, 3.25, x + bw + gap - 0.05, 3.25, AXISC, 2);
  });
  text(s, "Design choices that matter", { x: M, y: 5.0, w: 6, h: 0.4, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
  text(s, [
    { text: "Labels come from a classifier, so every result describes classifier-labeled negativity.", options: { bullet: true, breakLine: true } },
    { text: "Random steps use fixed seeds (42); null models use 500–1,000 shuffles.", options: { bullet: true, breakLine: true } },
    { text: "All results are written to one file, results/key_numbers.json; every number in this deck comes from it.", options: { bullet: true } },
  ], { x: M, y: 5.45, w: W - 2 * M, h: 1.4, fontSize: 15, paraSpaceAfter: 4 });
  notes(s, {
    who: "Soham", time: "1:30",
    message: "Twelve numbered scripts turn the raw SNAP files into every figure and number we present.",
    say: ["Walk left to right: audit and build, then the analyses, then extensions, then the website.",
      "Stress reproducibility: seeds are fixed, nulls are shuffled hundreds of times, and all numbers land in one JSON file.",
      "Hand over: 'Ansh will now show who sends these negative links.'"],
    prep: ["Read the README 'Pipeline' diagram and 'Run the analyses' commands.",
      "Know what a null model / shuffle is: randomly reassign signs while keeping some structure fixed, then compare the real network to those random versions.",
      "Know the README 'Real-data runtime and memory' table in case someone asks how long it takes (each heavy script runs in under 2 minutes)."],
    qa: [["Why not use the original paper's code?", "We answer different questions (balance nulls, volume-matched repeats, an interactive atlas), so we built our own pipeline on the same data."],
      ["Can someone rerun it?", "Yes: download the two TSVs and the embeddings CSV into data/raw and run the scripts in order; the README lists the commands."]],
  });
}

// =====================================================================
// SECTION 2 · ANSH · Concentration, balance and communities
// =====================================================================
const S2 = "2 · Concentration and balance (Ansh)";
pres.addSection({ title: S2 });
{
  const s = content(S2, "A tiny group sends most negative links", "Ansh");
  const groups = ["Top 0.1%", "Top 1%", "Top 10%"];
  const keys = ["0.1%", "1.0%", "10.0%"];
  s.addChart(pres.charts.BAR, [
    { name: "Negative links sent", labels: groups, values: keys.map(k => +(100 * NS.neg_out.top[k].share).toFixed(1)) },
    { name: "All links sent", labels: groups, values: keys.map(k => +(100 * NS.total_out.top[k].share).toFixed(1)) },
  ], { x: M, y: 1.6, w: 7.6, h: 5.1, barDir: "col", barGapWidthPct: 60, chartColors: [NEG, OTH],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0.0"%"', valAxisMaxVal: 100, valAxisMinVal: 0, valAxisMajorUnit: 25,
    valAxisLabelFormatCode: '0"%"', showLegend: true, legendPos: "t", showTitle: true, title: "Share of links sent by the most active subreddits",
    valAxisTitle: "Share of all links of that type", showValAxisTitle: true, valAxisTitleFontSize: 12, valAxisTitleColor: AXISC, ...chartText, objectName: "concentration-chart" });
  card(s, 8.6, 1.7, 4.1, 2.35);
  bigStat(s, 8.9, 1.85, 3.6, "68", `subreddits (top 0.1%) send ${pct(NS.neg_out.top["0.1%"].share)} of all negative links`, C.accent1, 44);
  card(s, 8.6, 4.3, 4.1, 2.35);
  bigStat(s, 8.9, 4.45, 3.6, NS.neg_out.gini.toFixed(3), `Gini of negative links sent, vs ${NS.total_out.gini.toFixed(3)} for all links`, C.text1, 44);
  notes(s, {
    who: "Ansh", time: "1:30",
    message: `Negativity is far more concentrated than ordinary linking: the top 1% send ${pct(NS.neg_out.top["1.0%"].share)} of negative links but ${pct(NS.total_out.top["1.0%"].share)} of all links.`,
    say: ["Rank all 67,180 subreddits by how many links they send. Compare the share held by the top groups for negative links (red) and all links (blue).",
      "The top 1% (672 subreddits) send 78.7% of negative links but only 52.1% of all links, so negativity is not just 'busy subreddits link more'.",
      "Just 68 subreddits send half of all negative links; the biggest are meta-communities: r/subredditdrama, r/bestof and r/drama.",
      "The Gini coefficient (0 = everyone equal, 1 = one sender has everything) is 0.979 for negative links vs 0.882 for all links."],
    prep: ["Read README section 'src/02_node_stats.py' and key_numbers.json → node_stats.",
      "Understand a Lorenz curve and the Gini coefficient (the Analytics tab on the site shows the Lorenz curve interactively).",
      "Look at figures/lorenz_out_links.png."],
    qa: [["Isn't this just because big subreddits post more?", "That is why we compare with all outgoing links: all links are concentrated too (52.1% for the top 1%), but negative links much more (78.7%)."],
      ["Which subreddits are in the top group?", "Meta and drama communities: r/subredditdrama (8,987 negative links), r/bestof (3,464) and r/drama (2,690) lead."]],
  });
}
{
  const s = content(S2, "Structural balance: the enemy of my enemy", "Ansh");
  const types = [[[false, false, false], "0 negative", "Balanced", "Three friends"],
    [[true, false, false], "1 negative", "Unbalanced", "Two friends disagree about a third"],
    [[true, true, false], "2 negative", "Balanced", "Two allies share an enemy"],
    [[true, true, true], "3 negative", "Unbalanced", "Everyone opposes everyone"]];
  const cw = 2.85;
  types.forEach(([signs, n, verdict, gloss], i) => {
    const x = M + i * (cw + 0.27);
    card(s, x, 1.65, cw, 3.25, verdict === "Balanced" ? C.background2 : "FBEFEC");
    triangle(s, x + cw / 2, 2.75, 1.65, signs);
    text(s, n, { x: x + 0.2, y: 3.75, w: cw - 0.4, h: 0.35, fontSize: 15, bold: true, align: "center" });
    text(s, verdict, { x: x + 0.2, y: 4.08, w: cw - 0.4, h: 0.32, fontSize: 14, bold: true, align: "center", color: verdict === "Balanced" ? C.accent2 : C.accent1 });
    text(s, gloss, { x: x + 0.2, y: 4.4, w: cw - 0.4, h: 0.45, fontSize: 12, align: "center", color: C.text2 });
  });
  text(s, "Two choices decide what 'more than chance' means", { x: M, y: 5.1, w: 8, h: 0.4, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
  text(s, [
    { text: "Sign rule: ", options: { bold: true } },
    { text: "a subreddit pair is negative if it has any negative link, or only if negative links are the majority.", options: { breakLine: true } },
    { text: "Null model: ", options: { bold: true } },
    { text: "shuffle signs across all pairs (global), or within each sender so its negative volume is kept (within-sender).", options: {} },
  ], { x: M, y: 5.55, w: W - 2 * M, h: 1.1, fontSize: 15, paraSpaceAfter: 6 });
  notes(s, {
    who: "Ansh", time: "1:45",
    message: "Balance theory predicts more triangles with 0 or 2 negative edges than chance; testing it requires choosing a sign rule and a null model.",
    say: ["Explain balance with the classic phrase: the friend of my friend is my friend; the enemy of my enemy is my friend. Triangles with 0 or 2 negative edges are 'balanced'.",
      "We collapse the directed network into undirected pairs, enumerate all 2,405,288 triangles, and count how many are balanced.",
      "To know if that count is high or low we compare with shuffled networks. Two decisions matter: how to turn several links into one pair sign (any-negative vs majority) and what to keep fixed when shuffling (nothing but the total, or each sender's negative volume).",
      "The within-sender null asks: if each subreddit kept its own level of negativity but aimed it at random among the pairs it already links to, would we see the same triangles?"],
    prep: ["Read Easley & Kleinberg, Networks, Crowds, and Markets, chapter 5 (Positive and Negative Relationships), sections 5.1–5.2.",
      "Read README 'src/03_balance.py' and 'How to interpret the network tests' → Balance.",
      "Be able to explain a z-score: (observed − null mean) / null standard deviation."],
    qa: [["Why collapse directions?", "Balance theory is defined on undirected signed triangles; we combine both directions of a pair before applying the rule."],
      ["Why two sign rules?", "'Any negative' marks very active pairs negative more easily; 'majority' is stricter. Results should not depend on one arbitrary choice."]],
  });
}
{
  const s = content(S2, "The balance verdict depends on the null model", "Ansh");
  const rows = [
    ["", "Observed balanced", "Global shuffle", "Within-sender shuffle"],
    ["Any negative link", pct(any.balanced_fraction, 2), `${pct(any.null_balanced_fraction_mean, 2)}   z = ${zb(any, any).toFixed(1)}`,
      `${pct(any.sender_conditioned.null_balanced_fraction_mean, 2)}   z = ${zb(any, any.sender_conditioned).toFixed(2)}`],
    ["Negative majority", pct(maj.balanced_fraction, 2), `${pct(maj.null_balanced_fraction_mean, 2)}   z = ${zb(maj, maj).toFixed(2)}`,
      `${pct(maj.sender_conditioned.null_balanced_fraction_mean, 2)}   z = ${zb(maj, maj.sender_conditioned).toFixed(1)}`],
  ];
  const head = { bold: true, color: C.text1, fill: { color: C.background2 }, fontSize: 15 };
  s.addTable(rows.map((r, i) => r.map((v, j) => ({ text: v, options: i === 0 || j === 0 ? { ...head, align: j ? "center" : "left" } : { fontSize: 16, align: "center", color: C.text1 } }))),
    { x: M, y: 1.7, w: W - 2 * M, colW: [3.0, 2.7, 3.21, 3.22], rowH: 0.65, border: { type: "solid", pt: 1, color: "D9DEE6" }, valign: "middle", fontFace: "Calibri", objectName: "balance-table" });
  const verdicts = [
    [C.accent1, "Global null, any-negative rule", `Far fewer balanced triangles than chance (−13.5 pp). Read naively, Reddit is strongly unbalanced.`],
    [C.accent2, "Within-sender null, any-negative rule", "The gap vanishes (−0.04 pp, z = −0.45). Who sends negativity, not triangle logic, explains the pattern."],
    [C.accent3, "Majority rule", "Both nulls give small gaps (−0.40 and −0.73 pp). No evidence that Reddit conflict is structurally balanced."],
  ];
  verdicts.forEach(([colour, t, d], i) => {
    const y = 3.85 + i * 0.95;
    s.addShape(pres.shapes.OVAL, { x: M, y: y + 0.1, w: 0.32, h: 0.32, fill: { color: colour }, line: { color: colour }, objectName: nm("verdict-dot") });
    text(s, t, { x: M + 0.55, y, w: 4.2, h: 0.55, fontSize: 16, bold: true, valign: "middle" });
    text(s, d, { x: 5.0, y, w: W - M - 5.0, h: 0.75, fontSize: 15, color: C.text2, valign: "middle" });
  });
  notes(s, {
    who: "Ansh", time: "2:00",
    message: "Against a naive null Reddit looks strongly unbalanced, but once each sender's negativity is held fixed the effect disappears.",
    say: ["Read the table row by row. Observed: 57.06% of triangles are balanced under the any-negative rule.",
      "The global shuffle expects 70.52%: a huge gap, z = −64. A naive conclusion would be 'Reddit conflict is strongly unbalanced'.",
      "But the global shuffle spreads negativity evenly. We know from the previous slide that a few senders produce almost all of it. The within-sender shuffle keeps that: expected 57.10%, z = −0.45, no difference.",
      "Under the stricter majority rule both gaps are below one percentage point.",
      "Conclusion: the balance pattern is explained by concentrated senders, not by communities arranging themselves into balanced triangles. The live demo will show this switch on the Analytics tab."],
    prep: ["Open the site's Analytics tab and click through all four combinations of rule and null; the conclusion text changes with them.",
      "Read key_numbers.json → balance (balanced_fraction, null means, standard deviations, sender_conditioned).",
      "Practise explaining why a null that ignores sender concentration is misleading."],
    qa: [["Why is z so large in the global case?", "2.4 million triangles make the null distribution very narrow (SD 0.21 pp), so even moderate gaps give huge z-scores; that is why the choice of null matters more than the z value."],
      ["Does this contradict Leskovec et al. (2010)?", "They studied user-level signed networks (Epinions, Slashdot) with explicit signs. Our edges are classifier-labeled links between communities, and our stricter null removes the effect."]],
  });
}
{
  const s = content(S2, "Which triangles are over-represented, and why", "Ansh");
  const labels = ["0 negative (balanced)", "1 negative", "2 negative (balanced)", "3 negative"];
  const g = any.types.map(t => +(t.observed / t.null_mean).toFixed(2));
  const w = any.sender_conditioned.types.map(t => +(t.observed / t.null_mean).toFixed(2));
  s.addChart(pres.charts.BAR, [
    { name: "vs global shuffle", labels, values: g },
    { name: "vs within-sender shuffle", labels, values: w },
  ], { x: M, y: 1.6, w: 8.0, h: 5.1, barDir: "bar", barGapWidthPct: 50, chartColors: [NEG, OTH], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: '0.00"×"', valAxisLogScaleBase: 2, valAxisMinVal: 0.25, valAxisMaxVal: 64, valAxisLabelFormatCode: '0.##"×"',
    catAxisOrientation: "maxMin", catAxisLabelPos: "low", showLegend: true, legendPos: "t", showTitle: true, title: "Observed triangles ÷ null mean (any-negative rule, log scale)", ...chartText, objectName: "triangle-ratio-chart" });
  card(s, 8.95, 1.7, 3.75, 4.95);
  text(s, "Reading the chart", { x: 9.2, y: 1.9, w: 3.3, h: 0.4, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
  text(s, [
    { text: `Against the global shuffle, all-negative triangles appear ${g[3].toFixed(0)}× more often than chance and all-positive ones half as often.`, options: { bullet: true, breakLine: true } },
    { text: "Against the within-sender shuffle, every type is within 6% of chance.", options: { bullet: true, breakLine: true } },
    { text: "Negativity clusters around the same few senders, and that alone produces the triangle pattern.", options: { bullet: true } },
  ], { x: 9.2, y: 2.4, w: 3.3, h: 4.1, fontSize: 15, paraSpaceAfter: 8 });
  notes(s, {
    who: "Ansh", time: "1:30",
    message: "The over-representation of negative triangles under the global null disappears once sender volume is held fixed.",
    say: ["Each bar is 'observed count ÷ count expected by the null'. 1× means exactly as expected; the axis is logarithmic.",
      "Red bars (global null): triangles with 2 or 3 negative edges are 5× and 28× over-represented; all-positive triangles are half as common.",
      "Blue bars (within-sender null): every type is close to 1×. A few heavy senders attack many targets, and targets connected to each other produce negative triangles automatically.",
      "This is the mechanism behind the previous slide's conclusion."],
    prep: ["Read key_numbers.json → balance.any_negative.types and .sender_conditioned.types (observed, null_mean, z_score).",
      "Understand log scale: equal distances mean equal ratios (0.5× and 2× are the same distance from 1×).",
      "Look at figures/structural_balance.png."],
    qa: [["Why does 3-negative get 28× under the global null?", "Heavy senders are linked to many subreddits that also link to each other; if a sender attacks two connected targets and one target attacks the other, you get negative triangles far more often than random signs allow."]],
  });
}
{
  const s = content(S2, "Negative links cross communities more often", "Ansh");
  s.addChart(pres.charts.BAR, [
    { name: "Negative links", labels: ["Louvain link communities", "Shared-user clusters"], values: [+COM.negative.observed_minus_null_pp.toFixed(2), +EMB.negative.observed_minus_null_pp.toFixed(2)] },
    { name: "Other links", labels: ["Louvain link communities", "Shared-user clusters"], values: [+COM.neutral_or_positive.observed_minus_null_pp.toFixed(2), +EMB.neutral_or_positive.observed_minus_null_pp.toFixed(2)] },
  ], { x: M, y: 1.6, w: 6.6, h: 5.1, barDir: "col", barGapWidthPct: 60, chartColors: [NEG, OTH], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: '+0.00" pp";-0.00" pp"', valAxisMinVal: -4, valAxisMaxVal: 1, valAxisMajorUnit: 1, valAxisLabelFormatCode: '+0" pp";-0" pp";0',
    catAxisLabelPos: "low", showLegend: true, legendPos: "t", showTitle: true, title: "Share of links staying inside a group: observed minus shuffle", ...chartText, objectName: "community-chart" });
  const facts = [
    [`${COM.negative.observed_minus_null_pp.toFixed(2)} pp`, "negative links within a community, vs the shuffle", C.accent1],
    [`+${COM.neutral_or_positive.observed_minus_null_pp.toFixed(2)} pp`, "other links, essentially at the shuffle", C.accent2],
    [K.communities.partition_nmi.toFixed(3), "NMI between link communities and audience clusters: almost unrelated", C.text1],
  ];
  facts.forEach(([v, l, colour], i) => {
    const y = 1.7 + i * 1.7;
    card(s, 7.6, y, 5.1, 1.5);
    text(s, v, { x: 7.85, y: y + 0.2, w: 1.9, h: 1.1, fontFace: THEME.headFontFace, fontSize: 28, bold: true, color: colour, valign: "middle" });
    text(s, l, { x: 9.8, y: y + 0.2, w: 2.75, h: 1.1, fontSize: 14, color: C.text2, valign: "middle" });
  });
  notes(s, {
    who: "Ansh", time: "1:45",
    message: "Negative links leave their structural community a little more often than chance; link communities and audience clusters capture different things.",
    say: ["Louvain finds 124 communities in the hyperlink graph (modularity 0.417, best of five seeds).",
      "61.7% of negative links stay inside one community, while shuffling signs predicts 64.6%: negative links cross boundaries 2.9 percentage points more than expected. Other links match the shuffle.",
      "With audience-based clusters (k-means on the user embeddings) there is no comparable gap (+0.27 pp).",
      "The two partitions barely agree (NMI 0.010), so 'who links to whom' and 'who shares users' are different notions of community.",
      "Hand over: 'Ridwan will now look at whether conflict repeats over time.'"],
    prep: ["Read README 'src/04_communities.py' and key_numbers.json → communities.",
      "Know Louvain (greedy modularity maximisation) and k-means at a one-sentence level, and what NMI and ARI measure (agreement between two clusterings, 0 = none, 1 = identical).",
      "Note the stability caveat: Louvain runs with different seeds agree only moderately (mean ARI 0.55)."],
    qa: [["Is 2.9 percentage points meaningful?", "Statistically yes (the null SD is 0.16 pp), but it is a modest effect; we present it as 'slightly more'."],
      ["Why did k-means choose k = 2?", "It had the highest silhouette score (0.69); the embedding space mostly splits into two large audience regions."]],
  });
}

// =====================================================================
// SECTION 3 · RIDWAN · Repeat conflict, audiences and language
// =====================================================================
const S3 = "3 · Repeats, audiences, language (Ridwan)";
pres.addSection({ title: S3 });
{
  const s = content(S3, "Conflict on a pair tends to come back", "Ridwan");
  // Timeline
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 1.75, w: 5.6, h: 0.8, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: "before-period" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M + 5.8, y: 1.75, w: 6.33, h: 0.8, rectRadius: 0.1, fill: { color: "E8EEF6" }, line: { color: "E8EEF6" }, objectName: "after-period" });
  text(s, "Before 2016: did pair A→B have a negative link?", { x: M + 0.25, y: 1.75, w: 5.2, h: 0.8, fontSize: 15, bold: true, valign: "middle" });
  text(s, "From 2016: does A→B get a negative link again?", { x: M + 6.05, y: 1.75, w: 5.9, h: 0.8, fontSize: 15, bold: true, valign: "middle" });
  const e = REP.early_pairs_including_later_inactive;
  const lat = REP.later_active_pairs;
  const blocks = [
    ["Same pair", pct(e.exposed.risk, 1), pct(e.unexposed.risk, 1), `${e.risk_ratio.toFixed(2)}×`, `${int(e.exposed.pairs)} previously negative pairs vs ${int(e.unexposed.pairs)} others`],
    ["Attacked a neighbour of the target", pct(lat.early_neighbour.exposed.risk, 1), pct(lat.early_neighbour.unexposed.risk, 1), `${lat.early_neighbour.risk_ratio.toFixed(2)}×`, "A was negative toward some C linked to B"],
    ["Shared an attacker's target", pct(lat.early_attacker.exposed.risk, 1), pct(lat.early_attacker.unexposed.risk, 1), `${lat.early_attacker.risk_ratio.toFixed(2)}×`, "A and C were both negative toward B"],
  ];
  blocks.forEach(([title, a, b, rr, d], i) => {
    const x = M + i * 4.1;
    card(s, x, 2.9, 3.85, 3.75);
    text(s, title, { x: x + 0.25, y: 3.05, w: 3.35, h: 0.65, fontFace: THEME.headFontFace, fontSize: 17, bold: true });
    text(s, a, { x: x + 0.25, y: 3.75, w: 1.6, h: 0.65, fontFace: THEME.headFontFace, fontSize: 30, bold: true, color: C.accent1 });
    text(s, "with earlier negativity", { x: x + 0.25, y: 4.4, w: 1.6, h: 0.5, fontSize: 12, color: C.text2 });
    text(s, b, { x: x + 2.0, y: 3.75, w: 1.6, h: 0.65, fontFace: THEME.headFontFace, fontSize: 30, bold: true, color: C.accent2 });
    text(s, "without", { x: x + 2.0, y: 4.4, w: 1.6, h: 0.5, fontSize: 12, color: C.text2 });
    text(s, `Risk ratio ${rr}`, { x: x + 0.25, y: 5.05, w: 3.35, h: 0.45, fontSize: 17, bold: true });
    text(s, d, { x: x + 0.25, y: 5.55, w: 3.35, h: 0.9, fontSize: 13, color: C.text2 });
  });
  notes(s, {
    who: "Ridwan", time: "1:45",
    message: "A pair that was negative before 2016 is 7.7 times as likely to be negative again afterwards, and conflict also spreads to neighbours.",
    say: ["We split time at 1 January 2016. Exposure is measured before, outcome after, so the order is right.",
      `Of ${int(e.exposed.pairs)} pairs with an early negative link, 19.3% had another negative link from 2016 on, versus 2.5% of the other ${int(e.unexposed.pairs)} early pairs: risk ratio 7.73.`,
      "It spreads: among pairs active later, A was negative toward B in 21.6% of cases where A had earlier attacked a neighbour of B, versus 7.1% otherwise.",
      "If A and another subreddit C had both attacked B earlier ('shared target'), the later rate is 28.0% vs 9.0%.",
      "But: busy pairs have more chances to be labeled negative in both periods. The next slide controls for that."],
    prep: ["Read README 'src/08_repeat.py' (the temporal test paragraph) and key_numbers.json → repeat.temporal.",
      "Understand risk and risk ratio: risk = share of pairs with the outcome; risk ratio = risk in exposed ÷ risk in unexposed.",
      "Look at figures/repeat_negative_pairs.png for how often pairs receive 1, 2, 3… negative links."],
    qa: [["Is this causal?", "No. It is a time-ordered association; shared interests or general activity can drive both periods."],
      ["Why split at 2016?", "It leaves about half the links on each side (455,394 before, 403,094 after); the script accepts any cutoff."]],
  });
}
{
  const s = content(S3, "Matching on activity cuts the effect to about 3×", "Ridwan");
  const rows = RV.by_early_volume;
  s.addChart(pres.charts.LINE, [
    { name: "Early negative label", labels: rows.map(r => r.early_links), values: rows.map(r => +(100 * r.exposed.risk).toFixed(1)) },
    { name: "No early negative label", labels: rows.map(r => r.early_links), values: rows.map(r => +(100 * r.unexposed.risk).toFixed(1)) },
  ], { x: M, y: 1.6, w: 7.9, h: 5.1, chartColors: [NEG, OTH], lineSize: 2, lineDataSymbol: "circle", lineDataSymbolSize: 8,
    valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 25, valAxisLabelFormatCode: '0"%"', showLegend: true, legendPos: "t",
    showTitle: true, title: "Later negative link (%), by links on the pair before 2016", catAxisTitle: "Links on the directed pair before 2016", showCatAxisTitle: true,
    catAxisTitleFontSize: 12, catAxisTitleColor: AXISC, ...chartText, objectName: "volume-chart" });
  const m = RV.early_volume_matched, la = RV.later_active_pairs.early_and_later_volume_matched;
  const st = [[`${RV.crude.risk_ratio.toFixed(2)}×`, "crude risk ratio", C.text2],
    [`${m.risk_ratio.toFixed(2)}×`, `matched on early volume (95% CI ${m.ci95[0].toFixed(2)}–${m.ci95[1].toFixed(2)})`, C.accent1],
    [`${la.risk_ratio.toFixed(2)}×`, "also matched on later volume", C.text1]];
  st.forEach(([v, l, colour], i) => {
    const y = 1.7 + i * 1.62;
    card(s, 8.85, y, 3.85, 1.45);
    text(s, v, { x: 9.1, y: y + 0.15, w: 3.4, h: 0.65, fontFace: THEME.headFontFace, fontSize: 30, bold: true, color: colour });
    text(s, l, { x: 9.1, y: y + 0.8, w: 3.4, h: 0.55, fontSize: 13, color: C.text2 });
  });
  notes(s, {
    who: "Ridwan", time: "2:00",
    message: "Compared like with like, an early negative label roughly triples the later risk; the crude 7.7× overstates it.",
    say: ["Problem: a pair with 100 early links has far more chances to be labeled negative than a pair with one, and busy pairs stay busy.",
      "So we put pairs in bins by how many links they had before 2016 and compare within each bin. Red: pairs with an early negative label; blue: pairs without.",
      "In every bin the red line is higher. For the 1–19 link bins, which hold most pairs, the ratio is between 2.7 and 3.3.",
      "Pooling the bins (Mantel–Haenszel) gives 3.06×, with a 95% interval of 2.92 to 3.21. Also matching on later activity gives 2.74×.",
      "Our headline is therefore 'about 3×', not 7.7×. The 50+ bins have few pairs, so their large ratios are imprecise."],
    prep: ["Read README 'src/11_repeat_by_volume.py' and key_numbers.json → repeat_by_volume.",
      "Understand stratification and the Mantel–Haenszel pooled risk ratio: a weighted average of per-bin comparisons, so each bin compares pairs of similar activity.",
      "Know that the script first reproduces the 7.73× exactly from the Atlas export before stratifying; this is our check that it measures the same thing.",
      "Look at figures/repeat_by_volume.png and the Repeat card on the site's Analytics tab."],
    qa: [["Why does the blue line fall in the 50+ bins?", "Very busy pairs with zero negative links are unusually friendly pairs (for example fan communities); only 96 such pairs exist, so the estimate is noisy."],
      ["Could other confounders remain?", "Yes: shared topics or user overlap could still drive both periods. Matching on volume removes the most obvious one."]],
  });
}
{
  const s = content(S3, "Negative targets share few users with the sender", "Ridwan");
  const d = K.distance;
  const t = d.all_links ? d : null;
  s.addChart(pres.charts.BAR, [
    { name: "Median rank of the target", labels: ["Negative links", "Other links", "Random pairs"], values: [16306, 7959, 15596] },
  ], { x: M, y: 1.6, w: 7.4, h: 5.1, barDir: "bar", barGapWidthPct: 55, chartColors: [NEG, OTH, HEX.accent3], invertedColors: [NEG, OTH, HEX.accent3],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "#,##0", valAxisMinVal: 0, valAxisMaxVal: 20000, valAxisMajorUnit: 5000,
    valAxisLabelFormatCode: "#,##0", catAxisOrientation: "maxMin", showLegend: false, showTitle: true,
    title: "Median rank of the target among 31,237 candidates (1 = most shared users)", ...chartText, objectName: "rank-chart" });
  card(s, 8.4, 1.7, 4.3, 4.95);
  text(s, "How to read it", { x: 8.65, y: 1.9, w: 3.8, h: 0.4, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
  text(s, [
    { text: "For each link, rank every other subreddit by how many users it shares with the sender.", options: { bullet: true, breakLine: true } },
    { text: "Ordinary links go to close audiences (median rank 7,959).", options: { bullet: true, breakLine: true } },
    { text: "Negative links go about as far as a random subreddit (16,306 vs 15,596).", options: { bullet: true, breakLine: true } },
    { text: "Conflict is aimed outside one's own audience, not at neighbours.", options: { bullet: true } },
  ], { x: 8.65, y: 2.4, w: 3.85, h: 4.1, fontSize: 15, paraSpaceAfter: 8 });
  notes(s, {
    who: "Ridwan", time: "1:30",
    message: "Negative links target communities with little audience overlap, about as distant as a random subreddit; ordinary links stay close.",
    say: ["Shared-user embeddings place two subreddits close when the same users post in both.",
      "For each link we rank all 31,237 other embedded subreddits by closeness to the sender and record the target's rank; smaller means closer.",
      "Ordinary links have median rank 7,959: they go to nearby audiences. Negative links have median 16,306, slightly further than a random subreddit (15,596).",
      "Counting each pair only once (its earliest link) gives the same picture: 18,320 for negative pairs vs 15,251 for others.",
      "Interpretation: conflict crosses audience boundaries rather than happening between communities that share users."],
    prep: ["Read README 'src/05_distance.py' (especially the target-rank paragraph) and key_numbers.json → distance.",
      "Understand cosine similarity between embedding vectors.",
      "Look at figures/distance_densities.png (cosine distributions for negative, other and random pairs)."],
    qa: [["Why ranks instead of raw cosine?", "Ranks adjust for each sender's neighbourhood: a sender in a dense region has many close candidates, so a rank is comparable across senders."],
      ["Do embeddings cover all links?", "76,797 of 82,210 negative links (93%) have both endpoints embedded; the rest are excluded from this comparison."]],
  });
}
{
  const s = content(S3, "Negative links are written in angrier language", "Ridwan");
  const top = LANG.top_features.slice(0, 8);
  s.addChart(pres.charts.BAR, [
    { name: "Standardized mean difference", labels: top.map(f => f.feature), values: top.map(f => +f.smd.toFixed(2)) },
  ], { x: M, y: 1.6, w: 7.6, h: 5.1, barDir: "bar", barGapWidthPct: 45, chartColors: [NEG], invertedColors: [OTH],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.00", valAxisMinVal: -1.5, valAxisMaxVal: 2, valAxisMajorUnit: 0.5,
    valAxisLabelFormatCode: "0.0", catAxisOrientation: "maxMin", catAxisLabelPos: "low", showLegend: false, showTitle: true,
    title: "Difference between negative and other links (in standard deviations)", ...chartText, objectName: "language-chart" });
  card(s, 8.6, 1.7, 4.1, 4.95);
  text(s, "What the top features mean", { x: 8.85, y: 1.9, w: 3.6, h: 0.4, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
  text(s, [
    { text: "LIWC_Negemo, LIWC_Anger: ", options: { bold: true } }, { text: "share of negative-emotion and anger words.", options: { breakLine: true } },
    { text: "vader_neg, vader_compound: ", options: { bold: true } }, { text: "rule-based tone scores; compound is lower (more negative).", options: { breakLine: true } },
    { text: "LIWC_Swear, LIWC_Sexual: ", options: { bold: true } }, { text: "swearing and sexual words.", options: { breakLine: true } },
    { text: "Effects of 1.5 SD are very large; intervals from 500 bootstrap draws are narrower than ±0.02.", options: { color: C.text2 } },
  ], { x: 8.85, y: 2.4, w: 3.65, h: 4.1, fontSize: 14, paraSpaceAfter: 8 });
  notes(s, {
    who: "Ridwan", time: "1:30",
    message: "The strongest differences are emotion and anger words, which is expected because the labels come from a sentiment classifier.",
    say: ["For each of the 86 text properties we compare its mean on negative and other links, in standard deviations (Cohen's d style). Positive = higher on negative links.",
      "The top effects are negative emotion (1.60), anger (1.57) and VADER negative tone (1.44); VADER compound is lower by 0.95.",
      "Swearing and sexual words also rise; the original authors' classifier used similar features, so these large effects partly reflect how the label was made.",
      "The next slide asks whether the labels can be predicted without these sentiment features."],
    prep: ["Read README 'src/06_language.py' and key_numbers.json → language.top_features.",
      "Learn what LIWC categories and VADER scores are (one sentence each); feature_names.txt lists all 86 in SNAP order.",
      "Understand standardized mean difference (difference in means ÷ pooled SD) and bootstrap confidence intervals.",
      "Look at figures/language_top_features.png."],
    qa: [["Isn't this circular?", "Partly: the label comes from a text classifier, so text predicts it by construction. That is why we test what remains after removing sentiment features."],
      ["Why bootstrap by post?", "One post can create several link rows; resampling whole posts keeps those rows together so intervals are not too narrow."]],
  });
}
{
  const s = content(S3, "Text predicts labels beyond sentiment words", "Ridwan");
  const m = LANG.models;
  s.addChart(pres.charts.BAR, [
    { name: "All 86 features", labels: ["Gradient boosting", "Logistic regression"], values: [+m.all_features.gradient_boosted.pr_auc.toFixed(3), +m.all_features.logistic.pr_auc.toFixed(3)] },
    { name: "Without 9 sentiment and emotion features", labels: ["Gradient boosting", "Logistic regression"], values: [+m.without_sentiment.gradient_boosted.pr_auc.toFixed(3), +m.without_sentiment.logistic.pr_auc.toFixed(3)] },
  ], { x: M, y: 1.6, w: 7.4, h: 5.1, barDir: "col", barGapWidthPct: 60, chartColors: [HEX.dk1, HEX.accent3], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: "0.000", valAxisMinVal: 0, valAxisMaxVal: 0.8, valAxisMajorUnit: 0.2, valAxisLabelFormatCode: "0.0", showLegend: true, legendPos: "t",
    showTitle: true, title: `PR-AUC on ${int(LANG.test_sources)} unseen source subreddits (guessing = ${LANG.test_negative_share.toFixed(3)})`, ...chartText, objectName: "model-chart" });
  card(s, 8.4, 1.7, 4.3, 4.95);
  text(s, "Takeaways", { x: 8.65, y: 1.9, w: 3.8, h: 0.4, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
  text(s, [
    { text: "Models are tested on subreddits never seen in training, so they cannot memorise senders.", options: { bullet: true, breakLine: true } },
    { text: "Removing VADER and six LIWC emotion features drops PR-AUC from 0.643 to 0.415.", options: { bullet: true, breakLine: true } },
    { text: "That is still 4× the 0.096 baseline: features left in, such as swearing (effect 0.90), still carry signal.", options: { bullet: true } },
  ], { x: 8.65, y: 2.4, w: 3.85, h: 4.1, fontSize: 15, paraSpaceAfter: 8 });
  notes(s, {
    who: "Ridwan", time: "1:30",
    message: "Language predicts negative labels on unseen communities; most but not all of the signal comes from sentiment features.",
    say: ["We train on 80% of source subreddits and test on the other 20% (11,173 subreddits, 171,699 links), so the model cannot just learn which subreddits are negative.",
      "PR-AUC measures how well positives are ranked; random guessing scores the prevalence, 0.096.",
      "Gradient boosting reaches 0.643 with all features. Removing the nine sentiment and emotion features drops it to 0.415, still 4× guessing.",
      "So the labels reflect more than sentiment scores: features that were not removed, such as swearing words (effect 0.90 on the previous slide), still separate the classes.",
      "Hand over: 'Kkshiteej will now show all of this live in the Conflict Atlas.'"],
    prep: ["Read README 'src/06_language.py' (model comparison paragraphs) and key_numbers.json → language.models.",
      "Understand precision-recall curves and why PR-AUC is better than accuracy when only 9.6% of links are negative.",
      "Know what a grouped holdout is (split by source subreddit, not by row)."],
    qa: [["Why not ROC-AUC?", "We report it too (0.932 for boosting), but with rare positives PR-AUC shows the practical difficulty better."],
      ["Which features matter after removal?", "06_language.py saves permutation importances to data/processed/language_importances.parquet; we did not rank them in this talk. Swearing is the largest remaining effect among the top-15 features."]],
  });
}

// =====================================================================
// SECTION 4 · KKSHITEEJ · Demo, extensions, conclusions
// =====================================================================
const S4 = "4 · Demo and conclusions (Kkshiteej)";
pres.addSection({ title: S4 });
{
  const s = content(S4, "Conflict Atlas: explore any community", "Kkshiteej");
  s.addImage({ path: ASSET("atlas_map.png"), x: M, y: 1.6, w: 8.2, h: 8.2 * 900 / 1600, altText: "Conflict Atlas showing r/books on the embedding map with arrows to its counterparts", objectName: "atlas-map" });
  text(s, "aim608-conflict-atlas.violet-horse-4096.chatgpt.site", { x: M, y: 6.3, w: 8.2, h: 0.35, fontSize: 13, color: C.accent2 });
  const views = [["Embedding map", "Every subreddit placed by shared users (UMAP); arrows show who links to whom."],
    ["Who links to whom?", "Incoming on the left, outgoing on the right, counts on every arrow."],
    ["Time series and tables", "Monthly counts, top counterparts and a paginated link table."],
    ["Analytics", "Interactive balance test, Lorenz curves, repeat conflict, language."]];
  views.forEach(([t, d], i) => {
    const y = 1.6 + i * 1.22;
    numberDot(s, 9.15, y + 0.05, i + 1, C.accent2, 0.42);
    text(s, t, { x: 9.75, y, w: 3.0, h: 0.4, fontSize: 16, bold: true });
    text(s, d, { x: 9.75, y: y + 0.4, w: 3.0, h: 0.75, fontSize: 13, color: C.text2 });
  });
  notes(s, {
    who: "Kkshiteej", time: "1:15",
    message: "We built a public website so anyone can explore the real SNAP links community by community.",
    say: ["The Atlas loads all 858,488 links aggregated by month and pair, entirely in the browser.",
      "The map places 51,269 subreddits by shared users using a seeded UMAP projection; colours show structural communities or audience clusters.",
      "Four views: the map, the 'Who links to whom?' direction graph, time series and tables, and the Analytics tab with the network-wide results.",
      "Every view follows the same date range and direction filter."],
    prep: ["Open the site and click through every view at least twice before the talk; read README 'Conflict Atlas demo'.",
      "Know UMAP at a one-sentence level: a 2D layout that keeps nearby points nearby; distances between far regions are not meaningful.",
      "Make sure the redeployed site has the 'Who links?' and 'Analytics' tabs; if not, run it locally: python -m http.server 8765 --bind 127.0.0.1 --directory app/dist."],
    qa: [["Does it send data to a server?", "No. The data file is downloaded once and filtered in the browser; 'Load data' reads files locally."],
      ["Can it show other datasets?", "Yes, any file exported by src/09_export_atlas.py in the same format."]],
  });
}
{
  const s = content(S4, "Live demo: r/books, March to August 2016", "Kkshiteej");
  s.addImage({ path: ASSET("atlas_flow.png"), x: 6.55, y: 1.6, w: 6.18, h: 6.18 * 0.555, altText: "Who links to whom view for r/books, March to August 2016", objectName: "atlas-flow", sizing: { type: "contain", w: 6.18, h: 3.45 } });
  const steps = ["Search books; set months to Mar 2016 – Aug 2016",
    "Who links to whom?: 35 negative links in, 2 out",
    "Click the top counterpart: both directions and the all-link denominator",
    "Switch colour grouping: structural communities vs audience clusters",
    "Range All; drag across the timeline to show 39 active months",
    "Analytics: switch Global → Within-sender shuffle and watch the conclusion change"];
  steps.forEach((t, i) => {
    const y = 1.65 + i * 0.78;
    numberDot(s, M, y, i + 1, C.accent1, 0.42);
    text(s, t, { x: M + 0.6, y: y - 0.02, w: 5.2, h: 0.7, fontSize: 15, valign: "middle" });
  });
  card(s, 6.55, 5.3, 6.18, 1.35);
  text(s, [
    { text: "Backups: ", options: { bold: true } },
    { text: "r/baseball, May – Oct 2015 (4 out, 29 in); r/cooking, All (6 out, 25 in), the site's default view. If the network fails, run the site locally from app/dist.", options: {} },
  ], { x: 6.8, y: 5.45, w: 5.7, h: 1.1, fontSize: 14, color: C.text1 });
  notes(s, {
    who: "Kkshiteej", time: "4:00 (live demo)",
    message: "Show one real community end to end, then show the balance conclusion changing live.",
    say: ["Step 1: type 'books' in Search Reddit and press Enter. Open 'Choose dates' and set Start month = Mar 2016, End month = Aug 2016.",
      "Step 2: click 'Who links?' in the header. Point out the asymmetry: 35 negative links come in from 31 counterparts, only 2 go out. r/books is mostly a target.",
      "Step 3: click the top incoming counterpart; the Pair breakdown shows negative links / all links in both directions.",
      "Step 4: back on Atlas, change 'Colour and group by' from Structural community to Shared-user cluster; the colours regroup (Ansh's slide 10).",
      "Step 5: click 'All' and drag across the timeline to narrow the range; counts update everywhere.",
      "Step 6: open Analytics. Under 'Any negative link', switch 'Global shuffle' to 'Within-sender shuffle': the conclusion changes from 'fewer balanced than chance (z = −64.4)' to 'no clear departure' (Ansh's slides 8–9). Scroll to the repeat chart (Ridwan's slide 12)."],
    prep: ["Rehearse these exact clicks at least twice on the presentation laptop and the projector resolution.",
      "Have the site open in a tab before the talk starts; keep the local fallback command ready (python -m http.server 8765 --bind 127.0.0.1 --directory app/dist).",
      "Read SUBMISSION.md → Live demo; it lists the expected numbers so you can confirm them on screen.",
      "If the venue has no internet, use the local copy; it is identical."],
    qa: [["Why r/books?", "It has negative links in both directions across 39 months, all with map positions, and its busiest six months make a readable graph."],
      ["Are these counts exact?", "Yes, they come from the full export and match results computed by the pipeline; the test suite checks them."]],
  });
}
{
  const s = content(S4, "Extensions: embeddings, bridges, prediction", "Kkshiteej");
  const dw = CO.embedding_comparison, bt = CO.betweenness, pr = CO.prediction;
  const blocks = [
    ["DeepWalk vs shared users", [[dw.negative.row_spearman.toFixed(3), "Spearman correlation on negative links"], [dw.nonnegative.row_spearman.toFixed(3), "on other links"]],
      "Graph position and audience overlap agree moderately, a little less for negative links."],
    ["Bridging communities", [[String(bt.source.top_median_external_neighbours), "median outside-community neighbours, top 1% senders"], [String(bt.target.top_median_external_neighbours), "for top 1% recipients (others: 0)"]],
      `Negative volume correlates with betweenness (Spearman ${bt.source.spearman.toFixed(2)} sending, ${bt.target.spearman.toFixed(2)} receiving).`],
    ["Predicting from network position", [[pr.pr_auc.toFixed(3), "PR-AUC on links from 2016"], [pr.test_prevalence.toFixed(3), "PR-AUC of guessing"]],
      "Degree, audience similarity and community agreement alone give a weak signal (1.5× guessing)."],
  ];
  blocks.forEach(([title, stats, d], i) => {
    const x = M + i * 4.1;
    card(s, x, 1.7, 3.85, 4.95);
    text(s, title, { x: x + 0.25, y: 1.9, w: 3.35, h: 0.75, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
    stats.forEach(([v, l], j) => {
      text(s, v, { x: x + 0.25, y: 2.75 + j * 1.2, w: 3.35, h: 0.6, fontFace: THEME.headFontFace, fontSize: 30, bold: true, color: j ? C.text2 : C.accent1 });
      text(s, l, { x: x + 0.25, y: 3.33 + j * 1.2, w: 3.35, h: 0.55, fontSize: 13, color: C.text2 });
    });
    text(s, d, { x: x + 0.25, y: 5.3, w: 3.35, h: 1.2, fontSize: 14 });
  });
  notes(s, {
    who: "Kkshiteej", time: "1:30",
    message: "Course methods confirm the picture: heavy senders and targets are bridges, and network position alone predicts negativity only weakly.",
    say: ["DeepWalk: we trained random-walk embeddings on the hyperlink graph and compared them with SNAP's shared-user embeddings. They correlate at 0.62–0.67: related but not the same.",
      "Betweenness: the top 1% of negative senders have a median of 56 neighbours outside their own community and the top recipients 96; everyone else has a median of zero. Heavy conflict actors sit between communities.",
      "Prediction: using only pre-2016 network features (degree, audience similarity, same community) to predict which 2016–17 links are negative gives PR-AUC 0.163 vs 0.107 for guessing: a weak signal compared with text."],
    prep: ["Read README 'Course extensions' and key_numbers.json → course.",
      "Know DeepWalk (random walks + skip-gram word2vec on node sequences), betweenness centrality (share of shortest paths through a node), and Spearman correlation.",
      "Look at figures/link_prediction_pr.png."],
    qa: [["Why is betweenness estimated?", "Exact betweenness on 67,180 nodes is expensive; we sample 256 sources and scale up, which gives stable rankings."],
      ["Why is network prediction weak?", "Whether a specific link is negative depends mostly on its text; position tells you who is likely to be involved, not which post will be hostile."]],
  });
}
{
  const s = content(S4, "What we found", "Kkshiteej");
  const items = [
    ["Concentrated", `68 subreddits send half of all negative links; the top 1% send ${pct(NS.neg_out.top["1.0%"].share)}.`],
    ["Not structurally balanced", "The apparent balance effect disappears once each sender's negativity is held fixed."],
    ["Recurring", `Early negativity roughly triples later risk on the same pair (${RV.early_volume_matched.risk_ratio.toFixed(2)}×, volume-matched).`],
    ["Aimed outward", "Negative links target distant audiences and cross community lines slightly more than chance."],
    ["Linguistic", "Text predicts labels on unseen communities, beyond sentiment features alone."],
  ];
  items.forEach(([t, d], i) => {
    const y = 1.6 + i * 0.86;
    numberDot(s, M, y + 0.08, i + 1, C.accent1, 0.48);
    text(s, t, { x: M + 0.7, y, w: 3.3, h: 0.65, fontFace: THEME.headFontFace, fontSize: 18, bold: true, valign: "middle" });
    text(s, d, { x: 4.4, y, w: 4.6, h: 0.75, fontSize: 15, color: C.text1, valign: "middle" });
  });
  card(s, 9.3, 1.6, 3.43, 4.25);
  text(s, "Limitations", { x: 9.55, y: 1.8, w: 3.0, h: 0.4, fontFace: THEME.headFontFace, fontSize: 18, bold: true });
  text(s, [
    { text: "Labels come from a classifier", options: { bullet: true, breakLine: true } },
    { text: "Raw post text is not available", options: { bullet: true, breakLine: true } },
    { text: "Only 46.5% of subreddits have embeddings", options: { bullet: true, breakLine: true } },
    { text: "All comparisons are observational", options: { bullet: true } },
  ], { x: 9.55, y: 2.3, w: 3.0, h: 3.4, fontSize: 14, color: C.text2, paraSpaceAfter: 8 });
  notes(s, {
    who: "Kkshiteej", time: "1:30",
    message: "Reddit conflict is concentrated, recurring and outward-facing, and the structural-balance story does not survive a fair null.",
    say: ["Summarise each of the five findings in one sentence, naming who presented it.",
      "Emphasise our two methodological contributions: the within-sender null for balance, and volume matching for repeat conflict. Both show that a naive comparison can overstate an effect.",
      "Read the limitations honestly; they are the first things an examiner will ask about.",
      "Possible next steps: user-level data to study brigading directly, and testing whether the 2016 effects hold in later Reddit data."],
    prep: ["Read SUBMISSION.md → Conclusions (seven detailed versions with all numbers).",
      "Be ready to point back to the slide that supports each finding: 1 → slide 6, 2 → slides 8–9, 3 → slides 11–12, 4 → slides 10 and 13, 5 → slides 14–15."],
    qa: [["What is the single most important result?", "Negativity is driven by a small set of senders, and accounting for that changes both the balance and the repeat-conflict conclusions."],
      ["What would you do with more time?", "Model brigading with user-level data, and test whether the same senders dominate in other platforms."]],
  });
}
{
  const s = content(S4, "References and questions", "Kkshiteej");
  text(s, [
    { text: "Kumar, S., Hamilton, W. L., Leskovec, J., & Jurafsky, D. (2018). Community Interaction and Conflict on the Web. Proceedings of The Web Conference (WWW).", options: { bullet: true, breakLine: true } },
    { text: "Leskovec, J., Huttenlocher, D., & Kleinberg, J. (2010). Signed Networks in Social Media. Proceedings of CHI.", options: { bullet: true, breakLine: true } },
    { text: "Easley, D., & Kleinberg, J. (2010). Networks, Crowds, and Markets, chapter 5: Positive and Negative Relationships. Cambridge University Press.", options: { bullet: true, breakLine: true } },
    { text: "SNAP Reddit Hyperlink Network and Reddit Embeddings: snap.stanford.edu/data/soc-RedditHyperlinks.html", options: { bullet: true, breakLine: true } },
    { text: "Code, figures and results: github.com/oki-dokii/Conflict-Between-Online-Communities", options: { bullet: true } },
  ], { x: M, y: 1.7, w: 7.4, h: 4.8, fontSize: 15, paraSpaceAfter: 10 });
  card(s, 8.5, 1.7, 4.23, 4.95);
  text(s, "Thank you", { x: 8.75, y: 2.3, w: 3.75, h: 0.9, fontFace: THEME.headFontFace, fontSize: 36, bold: true, align: "center" });
  text(s, "Questions?", { x: 8.75, y: 3.2, w: 3.75, h: 0.6, fontSize: 22, color: C.text2, align: "center" });
  text(s, "Soham · Ansh · Ridwan · Kkshiteej", { x: 8.75, y: 4.6, w: 3.75, h: 0.4, fontSize: 15, bold: true, align: "center" });
  text(s, "Try the Atlas: aim608-conflict-atlas.violet-horse-4096.chatgpt.site", { x: 8.75, y: 5.15, w: 3.75, h: 0.9, fontSize: 13, color: C.accent2, align: "center" });
  notes(s, {
    who: "Kkshiteej (all four take questions)", time: "0:30 + Q&A",
    message: "Close, credit the sources, and invite questions.",
    say: ["Thank the audience and invite questions. Route questions to the member who presented that part: data and pipeline → Soham; concentration, balance, communities → Ansh; repeats, audiences, language → Ridwan; Atlas, extensions, conclusions → Kkshiteej."],
    prep: ["Everyone: read the 'LIKELY QUESTIONS' in your own slides' notes and the 'Limitations' list on slide 19.",
      "Know where each number lives: results/key_numbers.json, with explanations in the README section for each script."],
    qa: [["Where can we see the code?", "The GitHub repository listed on the slide; the README explains every script and every number."]],
  });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("Wrote", OUT);
})();
