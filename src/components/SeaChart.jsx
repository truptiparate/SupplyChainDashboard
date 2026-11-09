import { useEffect, useRef } from "react";
import { TIERS } from "../data/model.js";
import { isImprovement } from "../data/model.js";
import { industryStyle, VERTICALS } from "../data/industries.js";
import { ICONS } from "./Icon.jsx";

/* =====================================================================
   Sea chart — replaces the card grid as the landing view.
   Industries are islands, cases are pins, a ship sails to whichever pin you
   click before the case opens. Ported from the "Supply Chain Expedition"
   prototype (https://claude.ai/artifact/VNqAaHhXPiTNPHyouYrQH1), trimmed of
   its gamification layer (no stars/XP/locking — every pin is always open;
   that prototype's own caseOpen()/tierOpen() already returned true
   unconditionally, so this isn't a behavior change, just removing dead UI
   for it). Built the same way the prototype builds it — one imperative pass
   over a raw SVG DOM tree inside an effect — rather than as declarative JSX,
   because the layout (blob-shaped islands, curved sea lanes, animated
   traffic riding along them) is procedural and much easier to port
   faithfully this way than to re-derive as a JSX tree.
   ===================================================================== */

const NS = "http://www.w3.org/2000/svg";

// Same 9 industries as src/data/industries.js VERTICALS, positioned on the
// 1600x1000 chart and given their own sea-chart palette (distinct from the
// cooler filter-pill palette used elsewhere in the app).
const IND = {
  Automotive: { color: "#E9A04A", x: 330, y: 300 },
  Electronics: { color: "#DE6E98", x: 820, y: 200 },
  Food: { color: "#C4975A", x: 1280, y: 290 },
  Logistics: { color: "#7A83E3", x: 215, y: 690 },
  Chemicals: { color: "#8DBE52", x: 1400, y: 640 },
  Retail: { color: "#B07AD9", x: 500, y: 860 },
  Aviation: { color: "#5AAFDC", x: 760, y: 880 },
  Mining: { color: "#9C9284", x: 1010, y: 860 },
  Healthcare: { color: "#E57A6E", x: 1230, y: 870 },
};
const HQ = { x: 800, y: 520 };
const SEA_RING = [
  ["Automotive", "Electronics"], ["Electronics", "Food"], ["Food", "Chemicals"],
  ["Chemicals", "Healthcare"], ["Healthcare", "Mining"], ["Mining", "Aviation"],
  ["Aviation", "Retail"], ["Retail", "Logistics"], ["Logistics", "Automotive"],
  ["Electronics", "Chemicals"], ["Logistics", "Retail"],
];
const BOX = ["#E3553D", "#FFC83D", "#4FA8F0", "#5CC98A", "#B07AD9", "#F2994A"];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function reduceMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function rng(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function blobPath(cx, cy, r, seed) {
  const R = rng(seed), n = 14, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = 0.78 + R() * 0.38;
    pts.push([cx + Math.cos(a) * r * k * 1.15, cy + Math.sin(a) * r * k * 0.9]);
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function bars(t) {
  return `<svg class="sc-sig" viewBox="0 0 16 12" aria-hidden="true">${[0, 1, 2, 3]
    .map((i) => `<rect x="${i * 4}" y="${9 - i * 3}" width="3" height="${3 + i * 3}" rx=".8" fill="currentColor" opacity="${i <= t ? 1 : 0.28}"/>`)
    .join("")}</svg>`;
}
function edgePoint(from, to, pad) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return { x: from.x + Math.cos(a) * pad, y: from.y + Math.sin(a) * pad * 0.8 };
}
function curve(a, b, bend) {
  const mx = (a.x + b.x) / 2 + (b.y - a.y) * bend, my = (a.y + b.y) / 2 - (b.x - a.x) * bend;
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}
// top-down shapes, pointing +x so animateMotion's rotate="auto" keeps them upright
function shipShape(R) {
  const c = () => BOX[(R() * BOX.length) | 0];
  return `<path d="M-20,-7 L12,-7 Q22,-7 26,0 Q22,7 12,7 L-20,7 Q-23,7 -23,4 L-23,-4 Q-23,-7 -20,-7Z" fill="#F4FBFC" stroke="#0E2A3B" stroke-width="1.6"/>
    <rect x="-18" y="-5" width="7" height="4.6" fill="${c()}"/><rect x="-18" y=".4" width="7" height="4.6" fill="${c()}"/>
    <rect x="-10" y="-5" width="7" height="4.6" fill="${c()}"/><rect x="-10" y=".4" width="7" height="4.6" fill="${c()}"/>
    <rect x="-2" y="-5" width="7" height="4.6" fill="${c()}"/><rect x="-2" y=".4" width="7" height="4.6" fill="${c()}"/>
    <rect x="8" y="-4" width="5" height="8" rx="1" fill="#0E2A3B"/>`;
}
const WAKE = `<path d="M-23,-5 Q-36,-9 -48,-12 M-23,5 Q-36,9 -48,12" stroke="#FFFFFF" stroke-width="2" fill="none" opacity=".75" stroke-linecap="round"/>`;
function truckShape(col) {
  return `<rect x="-11" y="-4.5" width="15" height="9" rx="1.5" fill="${col}" stroke="#0E2A3B" stroke-width="1.3"/><rect x="5" y="-4" width="6" height="8" rx="1.8" fill="#FFFFFF" stroke="#0E2A3B" stroke-width="1.3"/>`;
}
const PLANE = `<path d="M14,0 Q14,-2 10,-2 L3,-2 L-4,-13 L-8,-13 L-4,-2 L-11,-2 L-14,-6 L-17,-6 L-15,0 L-17,6 L-14,6 L-11,2 L-4,2 L-8,13 L-4,13 L3,2 L10,2 Q14,2 14,0Z" fill="#FFFFFF" stroke="#0E2A3B" stroke-width="1.4" stroke-linejoin="round"/>`;
function mover(parent, shape, d, dur, begin, opts = {}) {
  const g = el("g", { "pointer-events": "none" }, parent);
  g.innerHTML = `<g transform="scale(${opts.scale || 1})">${shape}</g>`;
  if (reduceMotion()) {
    const tmp = el("path", { d }, parent);
    const L = tmp.getTotalLength();
    const p = tmp.getPointAtLength(L * (opts.park ?? 0.5));
    const q = tmp.getPointAtLength(Math.min(L, L * (opts.park ?? 0.5) + 1));
    tmp.remove();
    g.setAttribute("transform", `translate(${p.x},${p.y}) rotate(${(Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI})`);
    return g;
  }
  const am = document.createElementNS(NS, "animateMotion");
  am.setAttribute("dur", dur + "s");
  am.setAttribute("begin", begin + "s");
  am.setAttribute("repeatCount", "indefinite");
  am.setAttribute("rotate", "auto");
  am.setAttribute("path", d);
  g.appendChild(am);
  return g;
}
const ISL_R = (byInd, name) => 62 + (byInd[name] || []).length * 20;

function seaDefs(defs) {
  defs.innerHTML = `
    <radialGradient id="scSeaGrad" cx="50%" cy="50%" r="80%"><stop offset="0" stop-color="#6CCBDD"/><stop offset=".55" stop-color="#46B2D0"/><stop offset="1" stop-color="#2A8DB5"/></radialGradient>
    <radialGradient id="scShoal"><stop offset=".45" stop-color="#B6ECEB" stop-opacity=".95"/><stop offset=".75" stop-color="#8EDDE3" stop-opacity=".55"/><stop offset="1" stop-color="#8EDDE3" stop-opacity="0"/></radialGradient>
    <pattern id="scCaust" width="120" height="120" patternUnits="userSpaceOnUse">
      <path d="M0,30 C20,18 40,42 60,30 S100,18 120,30 M0,90 C20,78 40,102 60,90 S100,78 120,90 M30,0 C18,20 42,40 30,60 S18,100 30,120 M90,0 C78,20 102,40 90,60 S78,100 90,120" fill="none" stroke="#FFFFFF" stroke-width="1.4" opacity=".16"/>
    </pattern>
    <filter id="scSoft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#0E4A66" flood-opacity=".35"/></filter>`;
}
function drawSeaTraffic(svgEl, byInd) {
  const R = rng("traffic"), g = el("g", { class: "sc-traffic" }, svgEl);
  SEA_RING.forEach(([a, b], i) => {
    const A = IND[a], B = IND[b], ra = ISL_R(byInd, a), rb = ISL_R(byInd, b);
    const p1 = edgePoint(A, B, ra * 1.05), p2 = edgePoint(B, A, rb * 1.05), bend = i % 2 ? 0.12 : -0.12;
    const d = curve(p1, p2, bend), back = curve(p2, p1, -bend);
    el("path", { class: "sc-sealane", d }, g);
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y), dur = Math.max(14, len / 22);
    mover(g, WAKE + shipShape(R), d, dur.toFixed(1), (-R() * dur).toFixed(1), { scale: 0.95, park: 0.35 });
    if (i % 3 === 0) mover(g, WAKE + shipShape(R), back, (dur * 1.15).toFixed(1), (-R() * dur).toFixed(1), { scale: 0.85, park: 0.7 });
  });
  ["Automotive", "Food", "Logistics", "Healthcare", "Aviation"].forEach((name, i) => {
    const P = IND[name], p1 = edgePoint(HQ, P, 70), p2 = edgePoint(P, HQ, ISL_R(byInd, name) * 1.05);
    const mx = (HQ.x + P.x) / 2 + (P.y - HQ.y) * 0.18, my = (HQ.y + P.y) / 2 - (P.x - HQ.x) * 0.18;
    const out = i % 2 === 0, d = out ? `M${p1.x},${p1.y} Q${mx},${my} ${p2.x},${p2.y}` : `M${p2.x},${p2.y} Q${mx},${my} ${p1.x},${p1.y}`;
    mover(g, WAKE + shipShape(R), d, 16 + i * 2, (-R() * 16).toFixed(1), { scale: 0.8, park: 0.55 });
  });
}
function drawIslandTraffic(svgEl, byInd) {
  const R = rng("trucks"), g = el("g", { class: "sc-traffic" }, svgEl);
  Object.entries(IND).forEach(([name, p], i) => {
    const r = ISL_R(byInd, name), n = (byInd[name] || []).length;
    const rx = n > 1 ? r * 0.68 : r * 0.5, ry = n > 1 ? r * 0.55 : r * 0.38, cy = p.y + 8;
    const d = `M${p.x + rx},${cy} A${rx},${ry} 0 1,1 ${p.x - rx},${cy} A${rx},${ry} 0 1,1 ${p.x + rx},${cy}`;
    el("path", { class: "sc-road", d }, g);
    const trucks = n > 2 ? 2 : 1, dur = 10 + rx / 9;
    for (let k = 0; k < trucks; k++) mover(g, truckShape(BOX[(i + k * 3) % BOX.length]), d, dur.toFixed(1), (-(k / trucks) * dur - R() * 2).toFixed(1), { scale: 1.3, park: (k + 0.3) / trucks });
    const dock = edgePoint(p, HQ, r * 0.92), st = el("g", { transform: `translate(${dock.x - 9},${dock.y - 6})`, "pointer-events": "none" }, g);
    [[0, 6], [7, 6], [14, 6], [3.5, 0], [10.5, 0]].forEach(([x, y], j) => el("rect", { x, y, width: 6.5, height: 5.5, fill: BOX[(i + j) % BOX.length], stroke: "#0E2A3B", "stroke-width": 1 }, st));
  });
}
function drawAirTraffic(svgEl) {
  const g = el("g", { class: "sc-traffic" }, svgEl);
  [["Logistics", "Food", 0.22, 26], ["Healthcare", "Automotive", -0.18, 30], ["Electronics", "Mining", 0.25, 24]].forEach(([a, b, bend, dur], i) => {
    const d = curve(IND[a], IND[b], bend);
    el("path", { class: "sc-airlane", d }, g);
    const sh = el("g", { "pointer-events": "none", opacity: 0.18 }, g);
    mover(sh, `<ellipse cx="0" cy="0" rx="13" ry="10" fill="#0E2A3B"/>`, d.replace(/[\d.]+,[\d.]+/g, (m) => { const [x, y] = m.split(",").map(Number); return `${x + 18},${y + 26}`; }), dur, -i * 7, { park: 0.4 });
    mover(g, PLANE, d, dur, -i * 7, { scale: 1.15, park: 0.4 });
  });
}
const SHIP_SVG = `<g class="sc-bob"><path d="M-30,6 Q-40,16 -52,12" stroke="#FFFFFF" stroke-width="2.4" fill="none" opacity=".8"/><path d="M-30,10 Q-44,22 -60,22" stroke="#FFFFFF" stroke-width="2.4" fill="none" opacity=".55"/>
  <path d="M-26,0 L26,0 L18,12 L-22,12Z" fill="#E3553D" stroke="#0E2A3B" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="-18" y="-9" width="10" height="9" fill="#FFC83D" stroke="#0E2A3B" stroke-width="2"/><rect x="-7" y="-9" width="10" height="9" fill="#4FA8F0" stroke="#0E2A3B" stroke-width="2"/><rect x="4" y="-9" width="10" height="9" fill="#5CC98A" stroke="#0E2A3B" stroke-width="2"/>
  <rect x="15" y="-15" width="7" height="15" fill="#FFFFFF" stroke="#0E2A3B" stroke-width="2"/></g>`;

export default function SeaChart({ cases, visibleIds, onOpen }) {
  const scrollRef = useRef(null);
  const svgRef = useRef(null);
  const tipRef = useRef(null);
  const onOpenRef = useRef(onOpen);
  const stateRef = useRef({ POS: {}, byInd: {}, ship: null, shipPos: null, shipFlip: false, sailing: false });

  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);

  useEffect(() => {
    const svgEl = svgRef.current;
    const st = stateRef.current;
    svgEl.innerHTML = "";
    const POS = (st.POS = {});

    const byInd = (st.byInd = {});
    cases.forEach((c) => {
      const name = industryStyle(c).name;
      (byInd[name] = byInd[name] || []).push(c);
    });
    Object.keys(byInd).forEach((k) => byInd[k].sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id)));

    seaDefs(el("defs", {}, svgEl));
    el("rect", { x: -600, y: -400, width: 2800, height: 1800, fill: "url(#scSeaGrad)" }, svgEl);
    const cg = el("g", { class: "sc-caustics" }, svgEl);
    el("rect", { x: -600, y: -400, width: 3000, height: 2000, fill: "url(#scCaust)" }, cg);

    const grid = el("g", { stroke: "#FFFFFF", "stroke-width": 1, opacity: 0.14 }, svgEl);
    for (let x = 100; x < 1600; x += 100) el("line", { x1: x, y1: -200, x2: x, y2: 1200 }, grid);
    for (let y = 100; y < 1000; y += 100) el("line", { x1: -200, y1: y, x2: 1800, y2: y }, grid);

    const R = rng("waves"), wv = el("g", {}, svgEl);
    for (let i = 0; i < 130; i++) {
      const x = R() * 2200 - 300, y = R() * 1300 - 150;
      if (Math.hypot(x - HQ.x, y - HQ.y) < 110) continue;
      const s = 0.7 + R() * 0.8;
      const w = el("path", { class: "sc-wave", d: `M${x},${y} q${7 * s},${-5 * s} ${14 * s},0 t${14 * s},0` }, wv);
      w.style.setProperty("--d", (5 + R() * 5).toFixed(1) + "s");
      w.style.setProperty("--dl", (-R() * 9).toFixed(1) + "s");
    }
    for (let i = 0; i < 26; i++) {
      const g = el("circle", { class: "sc-glint", cx: R() * 1600, cy: R() * 1000, r: 1.6 + R() * 1.6 }, wv);
      g.style.setProperty("--d", (2.5 + R() * 3).toFixed(1) + "s");
      g.style.setProperty("--dl", (-R() * 5).toFixed(1) + "s");
    }

    const cp = el("g", { transform: "translate(1490,120)" }, svgEl);
    el("circle", { r: 52, fill: "#FFFFFF", "fill-opacity": 0.25, stroke: "#FFFFFF", "stroke-width": 1.5 }, cp);
    el("path", { d: "M0,-48 L8,0 L0,48 L-8,0Z", fill: "#0E2A3B", opacity: 0.8 }, cp);
    el("path", { d: "M0,-48 L8,0 L-8,0Z", fill: "#FFC83D" }, cp);
    el("path", { d: "M-48,0 L0,-6 L48,0 L0,6Z", fill: "#FFFFFF", opacity: 0.85 }, cp);
    const nTxt = el("text", { y: -58, "text-anchor": "middle", fill: "#0E2A3B", "font-family": "Bricolage Grotesque, sans-serif", "font-weight": 800, "font-size": 16 }, cp);
    nTxt.textContent = "N";

    const lanes = el("g", {}, svgEl);
    Object.entries(IND).forEach(([name]) => {
      const p = IND[name];
      const mx = (HQ.x + p.x) / 2 + (p.y - HQ.y) * 0.18, my = (HQ.y + p.y) / 2 - (p.x - HQ.x) * 0.18;
      el("path", { class: "sc-lane", d: `M${HQ.x},${HQ.y} Q${mx},${my} ${p.x},${p.y}` }, lanes);
    });

    drawSeaTraffic(svgEl, byInd);

    const hq = el("g", {}, svgEl);
    el("circle", { cx: HQ.x, cy: HQ.y, r: 120, fill: "url(#scShoal)" }, hq);
    el("path", { class: "sc-surf", d: blobPath(HQ.x, HQ.y, 62, "hq") }, hq);
    el("path", { d: blobPath(HQ.x, HQ.y, 56, "hq"), fill: "#F1E6C8", stroke: "#FFFFFF", "stroke-width": 4, filter: "url(#scSoft)" }, hq);
    const lh = el("g", { transform: `translate(${HQ.x},${HQ.y - 6})` }, hq);
    const beam = el("path", { d: "M0,-19 L150,-62 L150,24Z", fill: "#FFF3B0", opacity: 0.35 }, lh);
    if (!reduceMotion()) beam.innerHTML = '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite"/>';
    el("path", { d: "M-9,26 L-6,-14 L6,-14 L9,26Z", fill: "#FFFFFF", stroke: "#0E2A3B", "stroke-width": 2 }, lh);
    el("path", { d: "M-7,0 L7,0 M-8,12 L8,12", stroke: "#E3553D", "stroke-width": 5 }, lh);
    el("rect", { x: -8, y: -24, width: 16, height: 10, rx: 2, fill: "#FFC83D", stroke: "#0E2A3B", "stroke-width": 2 }, lh);
    el("path", { d: "M-10,-24 L0,-32 L10,-24Z", fill: "#0E2A3B" }, lh);
    const hf = el("g", { transform: `translate(${HQ.x - 54},${HQ.y + 52})` }, hq);
    el("rect", { width: 108, height: 24, rx: 12, fill: "#0E2A3B", opacity: 0.88 }, hf);
    const hfTxt = el("text", { x: 54, y: 16.5, "text-anchor": "middle", fill: "#FFFFFF", "font-family": "Bricolage Grotesque, sans-serif", "font-weight": 700, "font-size": 13 }, hf);
    hfTxt.textContent = "Harbour HQ";

    const pinsG = el("g", { id: "scPins" });
    Object.entries(IND).forEach(([name, p], ii) => {
      const list = byInd[name] || [];
      const r = 62 + list.length * 20;
      const g = el("g", {}, svgEl);
      el("circle", { cx: p.x, cy: p.y, r: r * 1.6, fill: "url(#scShoal)" }, g);
      const sf = el("path", { class: "sc-surf", d: blobPath(p.x, p.y, r * 1.08, name) }, g);
      sf.style.setProperty("--dl", -ii * 0.4 + "s");
      el("path", { class: "sc-foam", d: blobPath(p.x, p.y, r * 1.04, name) }, g);
      el("path", { d: blobPath(p.x, p.y, r, name), fill: "#F1E3BE", filter: "url(#scSoft)" }, g);
      el("path", { d: blobPath(p.x, p.y + 3, r * 0.86, name), fill: p.color }, g);
      el("path", { d: blobPath(p.x - 6, p.y - 2, r * 0.55, name + "in"), fill: "#FFFFFF", opacity: 0.16 }, g);
      const fy = p.y - r * 0.95 - 30, w = Math.max(130, name.length * 9.5 + 60);
      const flag = el("g", { transform: `translate(${p.x - w / 2},${fy})` }, g);
      el("rect", { width: w, height: 30, rx: 15, fill: "#0E2A3B", opacity: 0.9 }, flag);
      const ic = el("g", { transform: "translate(9,5) scale(.83)", fill: "none", stroke: p.color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, flag);
      ic.innerHTML = ICONS[VERTICALS.find((v) => v.name === name)?.icon] || "";
      const flagTxt = el("text", { x: 34, y: 20, fill: "#FFFFFF", "font-family": "Bricolage Grotesque, sans-serif", "font-weight": 700, "font-size": 14 }, flag);
      flagTxt.textContent = name;
      list.forEach((c, i) => {
        let px = p.x, py = p.y + 8;
        if (list.length > 1) {
          const a = -Math.PI / 2 + (i / list.length) * Math.PI * 2 + 0.35;
          px = p.x + Math.cos(a) * r * 0.68;
          py = p.y + 8 + Math.sin(a) * r * 0.55;
        }
        POS[c.id] = { x: px, y: py };
        drawPin(pinsG, c);
      });
    });
    drawIslandTraffic(svgEl, byInd);

    const birds = el("g", {}, svgEl);
    [[200, 140, 0], [560, 620, -6], [1120, 520, -12]].forEach(([x, y, dl]) => {
      const b = el("g", {}, birds);
      el("path", { class: "sc-bird", d: "M-10,0 Q-5,-6 0,0 Q5,-6 10,0" }, b);
      el("path", { class: "sc-bird", d: "M8,10 Q12,5 16,10 Q20,5 24,10" }, b);
      if (!reduceMotion()) b.innerHTML += `<animateMotion dur="22s" begin="${dl}s" repeatCount="indefinite" path="M${x},${y} C${x + 220},${y - 80} ${x + 420},${y + 90} ${x + 640},${y - 20}"/>`;
      else b.setAttribute("transform", `translate(${x},${y})`);
    });
    svgEl.appendChild(pinsG);
    drawAirTraffic(svgEl);
    el("g", { id: "scFx" }, svgEl);
    drawShip(svgEl);

    function drawPin(parent, c) {
      const tier = TIERS[c.tier];
      const g = el("g", {
        class: "sc-pin", transform: `translate(${POS[c.id].x},${POS[c.id].y})`, tabindex: 0, role: "button",
        "aria-label": `${c.id}, ${c.name}. ${tier.name} difficulty.`, "data-id": c.id,
      }, parent);
      el("circle", { class: "sc-focus-ring", r: 32, fill: "none", stroke: "#FFC83D", "stroke-width": 3 }, g);
      const body = el("g", { class: "sc-pin-body" }, g);
      el("ellipse", { cx: 0, cy: 24, rx: 16, ry: 5, fill: "#0E2A3B", opacity: 0.3 }, body);
      el("circle", { r: 24, fill: "#0E2A3B" }, body);
      el("circle", { r: 24, fill: "none", stroke: tier.hex, "stroke-width": 5 }, body);
      const idTxt = el("text", { y: 6, "text-anchor": "middle", fill: "#FFFFFF", "font-family": "JetBrains Mono, monospace", "font-weight": 700, "font-size": 15 }, body);
      idTxt.textContent = c.id.slice(-2);
      const m = el("g", { transform: "translate(17,-17)" }, body);
      const dis = !isImprovement(c);
      el("circle", { r: 8, fill: dis ? "#E3553D" : "#1E9E8A", stroke: "#0E2A3B", "stroke-width": 2 }, m);
      el("path", { d: dis ? "M0,-4 V1 M0,3.6 V3.7" : "M-3.5,1.5 L0,-2.5 L3.5,1.5", stroke: "#fff", "stroke-width": 2.2, "stroke-linecap": "round", fill: "none" }, m);
      g.addEventListener("click", () => sailTo(c));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sailTo(c); } });
      g.addEventListener("mouseenter", () => showTip(c, g));
      g.addEventListener("focus", () => showTip(c, g));
      g.addEventListener("mouseleave", hideTip);
      g.addEventListener("blur", hideTip);
    }

    function dock(id) { return { x: POS[id].x - 52, y: POS[id].y + 6 }; }
    function drawShip() {
      if (!st.shipPos) st.shipPos = { x: HQ.x + 70, y: HQ.y + 26 };
      st.ship = el("g", { id: "scShip", "pointer-events": "none" }, svgEl);
      st.ship.innerHTML = SHIP_SVG;
      placeShip(st.shipPos.x, st.shipPos.y, st.shipFlip);
    }
    function placeShip(x, y, flip) { st.ship.setAttribute("transform", `translate(${x},${y}) scale(${flip ? -1 : 1},1)`); }
    function sailTo(c) {
      if (st.sailing) return;
      hideTip();
      const end = dock(c.id), start = { ...st.shipPos }, dist = Math.hypot(end.x - start.x, end.y - start.y);
      const done = () => { st.shipPos = end; st.sailing = false; onOpenRef.current(c.id); };
      st.shipFlip = end.x < start.x - 2 ? true : end.x > start.x + 2 ? false : st.shipFlip;
      if (dist < 4 || reduceMotion()) { placeShip(end.x, end.y, st.shipFlip); return done(); }
      st.sailing = true;
      const cx = (start.x + end.x) / 2 + (end.y - start.y) * 0.2, cy = (start.y + end.y) / 2 - (end.x - start.x) * 0.2;
      const dur = Math.min(1400, 420 + dist * 0.9), t0 = performance.now();
      ensureVisible(end);
      const fx = svgEl.querySelector("#scFx");
      const stepF = (now) => {
        const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const x = (1 - e) ** 2 * start.x + 2 * (1 - e) * e * cx + e * e * end.x;
        const y = (1 - e) ** 2 * start.y + 2 * (1 - e) * e * cy + e * e * end.y;
        placeShip(x, y, st.shipFlip);
        if (fx && Math.random() < 0.5) {
          const b = el("circle", { cx: x + (st.shipFlip ? 26 : -26), cy: y + 10, r: 3, fill: "#FFFFFF", opacity: 0.8 }, fx);
          b.animate([{ opacity: 0.8, r: 3 }, { opacity: 0, r: 9 }], { duration: 700 }).onfinish = () => b.remove();
        }
        if (t < 1) requestAnimationFrame(stepF);
        else done();
      };
      requestAnimationFrame(stepF);
    }
    function ensureVisible(p) {
      const sc = scrollRef.current, s = svgEl;
      if (!sc || sc.scrollWidth <= sc.clientWidth + 2) return;
      const k = s.clientWidth / 1600;
      sc.scrollTo({ left: p.x * k - sc.clientWidth / 2, top: p.y * k - sc.clientHeight / 2, behavior: "smooth" });
    }
    function showTip(c, g) {
      const tip = tipRef.current;
      if (!tip) return;
      const tier = TIERS[c.tier];
      tip.innerHTML = `<span class="meta">${c.id} · ${esc(industryStyle(c).name)} · ${isImprovement(c) ? "Improvement" : "Disruption"}</span><b>${esc(c.name)}</b>
        <span class="meta">${bars(c.tier)} ${tier.name}</span>`;
      tip.hidden = false;
      const r = g.getBoundingClientRect(), stage = scrollRef.current.getBoundingClientRect();
      tip.style.left = Math.max(140, Math.min(stage.width - 140, r.left + r.width / 2 - stage.left)) + "px";
      tip.style.top = r.top - stage.top + "px";
    }
    function hideTip() { if (tipRef.current) tipRef.current.hidden = true; }

    return () => { svgEl.innerHTML = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases]);

  // Dim pins that don't match the current search/industry/type filter without
  // rebuilding the whole chart.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    svgEl.querySelectorAll("[data-id]").forEach((node) => {
      node.classList.toggle("dim", !visibleIds.has(node.getAttribute("data-id")));
    });
  }, [visibleIds]);

  return (
    <div className="sc-stage">
      <div className="sc-mapscroll" ref={scrollRef}>
        <svg ref={svgRef} className="sc-map" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid meet" role="application" aria-label="Sea chart of case studies. Each port is a case." />
      </div>
      <div className="sc-tip" ref={tipRef} hidden />
      <style>{SEA_CSS}</style>
    </div>
  );
}

const SEA_CSS = `
.sc-stage{position:relative;height:72vh;min-height:460px;background:#2A8DB5;box-shadow:0 1px 2px rgba(29,43,46,0.08);}
.sc-mapscroll{position:absolute;inset:0;overflow:auto;scrollbar-width:thin;border-radius:18px;}
.sc-map{display:block;width:100%;height:100%;min-width:960px;min-height:600px;}
.sc-wave{fill:none;stroke:#F4FBFC;stroke-width:2.2;stroke-linecap:round;opacity:0;animation:scWave var(--d,7s) ease-in-out var(--dl,0s) infinite;}
@keyframes scWave{0%{opacity:0;transform:translateX(0)}30%{opacity:.75}70%{opacity:.6}100%{opacity:0;transform:translateX(26px)}}
.sc-glint{fill:#FFFFFF;animation:scGlint var(--d,4s) ease-in-out var(--dl,0s) infinite;opacity:0;}
@keyframes scGlint{0%,100%{opacity:0}50%{opacity:.9}}
.sc-foam{fill:none;stroke:#F4FBFC;stroke-width:3;stroke-dasharray:6 9;stroke-linecap:round;opacity:.75;animation:scFoam 9s linear infinite;}
@keyframes scFoam{to{stroke-dashoffset:-150}}
.sc-surf{fill:none;stroke:#F4FBFC;stroke-width:2;transform-box:fill-box;transform-origin:center;animation:scSurf 3.6s ease-out var(--dl,0s) infinite;}
@keyframes scSurf{0%{transform:scale(1);opacity:.65}100%{transform:scale(1.12);opacity:0}}
.sc-caustics{animation:scDrift 26s linear infinite;}
@keyframes scDrift{to{transform:translate(-120px,-60px)}}
.sc-bird{fill:none;stroke:#0E2A3B;stroke-width:2.2;stroke-linecap:round;opacity:.55;}
.sc-lane{fill:none;stroke:#FFFFFF;stroke-width:2.5;stroke-dasharray:2 10;stroke-linecap:round;opacity:.75;animation:scLane 6s linear infinite;}
@keyframes scLane{to{stroke-dashoffset:-120}}
.sc-sealane{fill:none;stroke:#FFFFFF;stroke-width:1.6;stroke-dasharray:1 9;stroke-linecap:round;opacity:.45;}
.sc-airlane{fill:none;stroke:#FFFFFF;stroke-width:1.4;stroke-dasharray:10 8;opacity:.3;}
.sc-road{fill:none;stroke:#0E2A3B;stroke-width:7;opacity:.16;stroke-linecap:round;}
.sc-pin{cursor:pointer;outline:none;}
.sc-pin .sc-pin-body{transition:transform .18s cubic-bezier(.2,.9,.3,1.4);transform-box:fill-box;transform-origin:center;}
.sc-pin:hover .sc-pin-body,.sc-pin:focus-visible .sc-pin-body{transform:scale(1.18);}
.sc-pin:focus-visible .sc-focus-ring{opacity:1;}
.sc-pin .sc-focus-ring{opacity:0;transition:opacity .15s;}
.sc-pin.dim{opacity:.28;}
.sc-bob{animation:scBob 2.6s ease-in-out infinite;}
@keyframes scBob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-2.5px) rotate(-1.5deg)}}
.sc-tip{position:absolute;pointer-events:none;background:#FFFFFF;color:#0E2A3B;border-radius:10px;padding:9px 12px;font-size:13px;max-width:260px;box-shadow:0 10px 30px rgba(14,42,59,.3);z-index:6;transform:translate(-50%,calc(-100% - 18px));font-family:'Atkinson Hyperlegible','Segoe UI',system-ui,sans-serif;}
.sc-tip b{font-family:'Bricolage Grotesque','Trebuchet MS',system-ui,sans-serif;display:block;font-size:14px;line-height:1.25;margin:2px 0 4px;}
.sc-tip .meta{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:11px;color:#4E6472;display:flex;align-items:center;gap:5px;}
.sc-sig{width:13px;height:10px;vertical-align:-1px;}
@media (prefers-reduced-motion:reduce){
  .sc-wave,.sc-glint,.sc-surf,.sc-caustics,.sc-lane,.sc-bob{animation:none!important;}
}
`;
