import React, { useState, useMemo, useEffect, useRef } from "react";
import { CASES, overallKey, isImprovement, natureLabel } from "./data/model.js";
import { primaryIndustry, styleForText, industryStyle } from "./data/industries.js";
import Icon from "./components/Icon.jsx";
import SeaChart from "./components/SeaChart.jsx";

/* =====================================================================
   Future Industry in a Box — Case Library
   UX follows dashboard-ui-mockup-colorful.html:
   grid → mode chooser → guided walkthrough / comic reader → completion.
   Data model (cases.json) is unchanged; this file only maps it to the new UX.
   Icon, industry taxonomy and the CASES/tier data model have moved into
   src/components and src/data — see CLAUDE.md's UI-rework phase plan.
   ===================================================================== */

/* "About us" opens the course's Moodle page in a new tab. */
const MOODLE_URL = "https://moodle.hof-university.de/course/view.php?id=7457";

/* ---------------- Data helpers ---------------- */
function narrativeOf(c) {
  return (isImprovement(c) ? c.improvement : c.disruption) || [];
}
function hookOf(c) {
  const narrative = narrativeOf(c);
  const key = isImprovement(c) ? "problem" : "trigger";
  return (
    narrative.find((d) => String(d.label).toLowerCase().includes(key))?.value ||
    narrative[0]?.value ||
    ""
  );
}
function blockTitle(source) {
  return String(source || "")
    .replace(/Decision Analysis\s*/i, "")
    .replace(/^by (the )?company:?/i, "Actual response:")
    .trim();
}
function flatDecisions(c) {
  return (c.decision_blocks || []).flatMap((b) =>
    (b.decisions || []).map((d) => ({ group: blockTitle(b.source), data: d }))
  );
}
function friendlyHeading(label, improvement) {
  const l = String(label).toLowerCase();
  if (l.includes("trigger")) return "What happened";
  if (l.includes("problem")) return "What needed to change";
  if (l.includes("root cause")) return "Why it happened";
  if (l.includes("affected")) return "What was impacted";
  if (l.includes("effect")) return improvement ? "What it changed" : "How it rippled through the supply chain";
  return label;
}

/* ---------------- Rating tone (unchanged logic) ---------------- */
function ratingTone(raw) {
  if (raw == null) return null;
  const v = String(raw).toLowerCase();
  if (v.includes("n/a") || v === "neutral" || v === "medium" || v.includes("med")) return "neutral";
  if (v.includes("very high") || v.includes("very poor") || v.includes("collapsed") || v.includes("very low")) return "bad";
  if (v.includes("high") && !v.includes("quality")) return "warn";
  if (v.includes("low") || v.includes("reduced") || v.includes("improved") || v.includes("protected") || v.includes("fast") || v.includes("structurally")) return "good";
  if (v.includes("slow") || v.includes("long") || v.includes("poor")) return "bad";
  return null;
}
function toneColor(tone) {
  switch (tone) {
    case "good": return { fg: "#1F6E63", bg: "#E7F3F1" };
    case "bad": return { fg: "#B8452F", bg: "#FBEAE6" };
    case "warn": return { fg: "#A2720C", bg: "#FDF3DE" };
    default: return { fg: "#5C6D70", bg: "#F3F2EE" };
  }
}

/* ---------------- Guided walkthrough steps ---------------- */
function buildSteps(c) {
  const improvement = isImprovement(c);
  const narrative = narrativeOf(c);
  const decisions = flatDecisions(c);
  const steps = [];

  if (c.normal_flow_nodes?.length) {
    steps.push({
      type: "flow",
      label: improvement ? "Before the change" : "Before the disruption",
      heading: "How this supply chain normally worked",
      nodes: c.normal_flow_nodes,
    });
  }
  if (c.kpis?.length) {
    steps.push({ type: "kv", label: "Normal KPI conditions", heading: "What “normal” looked like", items: c.kpis });
  }

  const key = improvement ? "problem" : "trigger";
  let triggerIdx = narrative.findIndex((d) => String(d.label).toLowerCase().includes(key));
  if (triggerIdx < 0 && narrative.length) triggerIdx = 0;
  if (triggerIdx >= 0) {
    const t = narrative[triggerIdx];
    steps.push({ type: "text", label: improvement ? "The problem" : "The trigger", heading: friendlyHeading(t.label, improvement), text: t.value });
  }

  if (decisions.length) steps.push({ type: "predict", label: "Your turn", heading: "What would you do here?" });

  narrative.forEach((d, i) => {
    if (i !== triggerIdx) steps.push({ type: "text", label: d.label, heading: friendlyHeading(d.label, improvement), text: d.value });
  });

  decisions.forEach((d, i) => {
    steps.push({
      type: "decision",
      label: `Decision ${i + 1} of ${decisions.length}`,
      group: d.group,
      heading: d.data["Description"] || `Decision ${i + 1}`,
      decision: d.data,
    });
  });

  const impact = c.decisions_impact_summary || [];
  const scores = c.decision_scores || [];
  if (impact.length || scores.length) {
    steps.push({ type: "outcome", label: "Outcome", heading: "How the options compare", impact, scores });
  }
  return steps;
}

/* =====================================================================
   Comic artwork
   ---------------------------------------------------------------------
   House format is 12 images per case, numbered 1..12, sitting together in
   one folder. A case points at that folder in cases.json:

      "comic": "/comics/FIB-001"

   …or, when a case departs from the 12-png default:

      "comic": { "dir": "/comics/FIB-001", "count": 12, "ext": "png" }

   The reader groups them 4 to a page for the overview and the panel dots,
   matching how the comics are drawn (3 pages x 4 panels).

   Images live in public/, which Vite copies to the build root as-is, so
   public/comics/FIB-001/1.png is served at /comics/FIB-001/1.png.

   A case with no `comic` entry falls back to cards generated from its own
   data, so the mode still works before artwork exists.
   ===================================================================== */
const PANELS_PER_PAGE = 4;
const COMIC_DEFAULTS = { count: 12, ext: "png" };

function generatedPanels(c) {
  const improvement = isImprovement(c);
  const panels = [];
  const nodes = c.normal_flow_nodes || [];
  if (nodes.length) {
    const chain = nodes.map((n) => n.label.replace(/^Node\s*\d+\s*[–—-]\s*/i, "")).join(" → ");
    panels.push({ title: "Business as usual", caption: chain });
  }
  const hook = hookOf(c);
  if (hook) panels.push({ title: improvement ? "Then, a problem surfaced" : "Then, disruption struck", caption: hook });
  flatDecisions(c).forEach((d) => {
    panels.push({ title: "Decision point", caption: d.data["Description"] || d.data["Action"] || "" });
  });
  const scores = (c.decision_scores || []).filter((s) => typeof s[overallKey(s)] === "number");
  if (scores.length) {
    const best = [...scores].sort((a, b) => b[overallKey(b)] - a[overallKey(a)])[0];
    panels.push({ title: "How it ended", caption: `Best-rated option: ${best.label} — ${best[overallKey(best)].toFixed(1)} / 5` });
  }
  return panels.map((p, i) => ({ ...p, index: i, page: 0, label: `Scene ${i + 1} · ${p.title}` }));
}

function buildComic(c) {
  const raw = c.comic;
  const dir = typeof raw === "string" ? raw : raw?.dir;

  if (dir) {
    const count = raw?.count || COMIC_DEFAULTS.count;
    const ext = raw?.ext || COMIC_DEFAULTS.ext;
    const base = String(dir).replace(/\/+$/, "");
    const panels = Array.from({ length: count }, (_, i) => ({
      index: i,
      page: Math.floor(i / PANELS_PER_PAGE),
      src: `${base}/${i + 1}.${ext}`,
      label: `Panel ${i + 1} of ${count}`,
    }));
    return { kind: "art", perPage: PANELS_PER_PAGE,
             pageCount: Math.ceil(count / PANELS_PER_PAGE), panels };
  }

  // No artwork yet — cards generated from case data.
  return { kind: "generated", perPage: PANELS_PER_PAGE, pageCount: 1, panels: generatedPanels(c) };
}

/* Reads a bitmap's intrinsic size so one panel can be given its true aspect
   ratio — that's what lets a panel fill the stage without letterboxing. */
function useImageSize(src) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    setSize(null);
    if (!src || typeof window === "undefined" || typeof window.Image !== "function") return;
    let alive = true;
    const img = new window.Image();
    img.onload = () => alive && setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => alive && setSize({ error: true });
    img.src = src;
    return () => { alive = false; };
  }, [src]);
  return size;
}

/* Warms the neighbouring bitmaps so turning panels doesn't flash. */
function usePreload(sources) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.Image !== "function") return;
    const imgs = sources.filter(Boolean).map((s) => { const i = new window.Image(); i.src = s; return i; });
    return () => imgs.forEach((i) => { i.onload = null; i.src = ""; });
  }, [sources.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* =====================================================================
   Small presentational components
   ===================================================================== */
function IconCircle({ c, size = 52 }) {
  const s = industryStyle(c);
  return (
    <div className="node-icon" style={{ background: s.bg, width: size, height: size }} title={primaryIndustry(c)}>
      <Icon name={s.icon} size={Math.round(size / 2)} color={s.fg} />
    </div>
  );
}

function NatureBadge({ c }) {
  const imp = isImprovement(c);
  return (
    <span className={`badge ${imp ? "improvement" : "disruption"}`}>
      <Icon name={imp ? "trendUp" : "trendDown"} size={12} />
      {c.nature || natureLabel(c)}
    </span>
  );
}

function Chip({ label, value }) {
  const col = toneColor(ratingTone(value));
  return (
    <div className="rating-chip" style={{ background: col.bg }}>
      <span className="rating-chip-label">{label}</span>
      <span className="rating-chip-value" style={{ color: col.fg }}>{String(value)}</span>
    </div>
  );
}

function KVList({ items }) {
  return (
    <div className="kv-list">
      {items.map((it, i) => (
        <div className="kv-row" key={i}>
          <span className="kv-label">{it.label}</span>
          <span className="kv-value">{String(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

function FlowChain({ nodes, compact }) {
  return (
    <div className={`flow-chain ${compact ? "compact" : ""}`}>
      {nodes.map((n, i) => (
        <React.Fragment key={i}>
          <div className="flow-node">
            <div className="flow-node-id">N{i + 1}</div>
            <div className="flow-node-label">{n.label.replace(/^Node\s*\d+\s*[–—-]\s*/i, "")}</div>
            {!compact && n.description && <div className="flow-node-desc">{n.description}</div>}
          </div>
          {i < nodes.length - 1 && <div className="flow-arrow">→</div>}
        </React.Fragment>
      ))}
    </div>
  );
}

function DecisionDetail({ d, full }) {
  const skip = new Set(["Decision No", "Description", "Action", "Best when"]);
  const ratingKeys = Object.keys(d).filter((k) => !skip.has(k));
  return (
    <>
      {d["Action"] && <p className="step-text">{d["Action"]}</p>}
      {full && ratingKeys.length > 0 && (
        <div className="rating-row">
          {ratingKeys.map((k) => <Chip key={k} label={k} value={d[k]} />)}
        </div>
      )}
      {full && d["Best when"] && (
        <div className="best-when">
          Best when {d["Best when"].charAt(0).toLowerCase() + d["Best when"].slice(1)}
        </div>
      )}
    </>
  );
}

function ScoreRanking({ scores }) {
  const sorted = [...scores]
    .filter((s) => typeof s[overallKey(s)] === "number")
    .sort((a, b) => b[overallKey(b)] - a[overallKey(a)]);
  return (
    <div className="score-list">
      {sorted.map((s, i) => {
        const val = s[overallKey(s)];
        return (
          <div className="score-row" key={i}>
            <span className="score-name">{s.label}</span>
            <div className="kpi-bar-track">
              <div className={`kpi-bar-fill ${i === 0 ? "up" : "down"}`} style={{ width: `${(val / 5) * 100}%` }} />
            </div>
            <span className="score-val">{val.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ImpactTable({ rows }) {
  const cols = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => k !== "label" && set.add(k)));
    return Array.from(set);
  }, [rows]);
  return (
    <div className="impact-wrap">
      <table className="impact-table">
        <thead>
          <tr>
            <th>Decision</th>
            {cols.map((c) => <th key={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="impact-label">{r.label}</td>
              {cols.map((c) => {
                const col = toneColor(ratingTone(r[c]));
                return (
                  <td key={c} style={{ color: r[c] != null ? col.fg : "#8A8B85" }}>
                    {r[c] != null ? String(r[c]) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndustryBanner({ c }) {
  const col = industryStyle(c);
  const dots = [{ x: 40, y: 30 }, { x: 110, y: 70 }, { x: 70, y: 110 }, { x: 180, y: 40 }, { x: 230, y: 90 }, { x: 300, y: 55 }];
  const d = `M${dots[0].x},${dots[0].y} L${dots[1].x},${dots[1].y} L${dots[2].x},${dots[2].y} M${dots[1].x},${dots[1].y} L${dots[3].x},${dots[3].y} L${dots[4].x},${dots[4].y} L${dots[5].x},${dots[5].y}`;
  return (
    <div className="industry-banner" style={{ background: `linear-gradient(135deg, ${col.bg} 0%, ${col.deep} 100%)` }}>
      <svg className="banner-nodes" viewBox="0 0 480 160" preserveAspectRatio="none">
        <path d={d} stroke={col.fg} strokeWidth="1.2" fill="none" opacity="0.25" />
        {dots.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={col.fg} opacity="0.35" />)}
      </svg>
      <Icon name={col.icon} className="banner-watermark" color={col.fg} strokeWidth={1.2} />
      <div className="banner-caption">
        <IconCircle c={c} size={26} />
        {primaryIndustry(c)}
      </div>
    </div>
  );
}

/* =====================================================================
   Grid card
   ===================================================================== */
/* =====================================================================
   Case detail: chooser → guided / comic → complete
   ===================================================================== */
function DetailHeader({ c, onBack }) {
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={14} /> Back to all cases
      </button>
      <div className="detail-header">
        <IconCircle c={c} size={56} />
        <div>
          <div className="detail-title-row">
            <span className="detail-case-id">{c.id}</span>
            <NatureBadge c={c} />
          </div>
          <h1 className="detail-name">{c.name}</h1>
          <div className="detail-industry">{c.industry}</div>
          {(c.brand_group || c.scale) && (
            <div className="detail-meta">
              {c.brand_group && <span><span className="muted">Brand & group</span> {c.brand_group}</span>}
              {c.scale && <span><span className="muted">Scale</span> {c.scale}</span>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SwitchLinks({ current, onSwitch }) {
  return (
    <div className="switch-row">
      {current !== "guided" && (
        <button className="switch-view" onClick={() => onSwitch("guided")}>
          <Icon name="compass" size={13} /> Guided walkthrough
        </button>
      )}
      {current !== "comic" && (
        <button className="switch-view" onClick={() => onSwitch("comic")}>
          <Icon name="speech" size={13} /> Comic
        </button>
      )}
    </div>
  );
}

function PastStep({ step, note }) {
  const cls = `flow-section is-past ${step.type === "decision" ? "is-decision" : ""}`;
  let body;
  switch (step.type) {
    case "flow":
      body = <FlowChain nodes={step.nodes} compact />;
      break;
    case "kv":
      body = <KVList items={step.items} />;
      break;
    case "predict":
      body = <div className="flow-content"><p className="predict-recap">{note?.trim() ? note : "No prediction noted — moving on."}</p></div>;
      break;
    case "decision":
      body = (
        <div className="decision-block">
          <div className="decision-block-title">{step.heading}</div>
          {step.decision["Action"] && <p>{step.decision["Action"]}</p>}
        </div>
      );
      break;
    case "outcome":
      body = step.scores.length ? <ScoreRanking scores={step.scores} /> : <ImpactTable rows={step.impact} />;
      break;
    default:
      body = <div className="flow-content"><p>{step.text}</p></div>;
  }
  return (
    <div className={cls}>
      <div className="flow-label">{step.label}{step.group ? ` · ${step.group}` : ""}</div>
      {body}
    </div>
  );
}

function CurrentStep({ step, note, onNote }) {
  if (step.type === "predict") {
    return (
      <div className="step-card predict">
        <h2 className="step-heading">
          <Icon name="bulb" size={18} color="#B8791C" style={{ verticalAlign: -3, marginRight: 6 }} />
          {step.heading}
        </h2>
        <p className="step-text">Before you see what the team actually decided, take a moment to think it through.</p>
        <textarea
          className="predict-textarea"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Jot down your instinct — this isn't graded, just for you."
        />
        <div className="predict-note">Your notes stay on this page only.</div>
      </div>
    );
  }
  return (
    <div className="step-card">
      {step.type === "decision" && step.group && <div className="decision-step-label">{step.group}</div>}
      <h2 className="step-heading">{step.heading}</h2>
      {step.type === "flow" && <FlowChain nodes={step.nodes} />}
      {step.type === "kv" && <KVList items={step.items} />}
      {step.type === "text" && <p className="step-text">{step.text}</p>}
      {step.type === "decision" && <DecisionDetail d={step.decision} full />}
      {step.type === "outcome" && (
        <div className="outcome-stack">
          {step.impact.length > 0 && (
            <div>
              <div className="flow-label">Impact summary</div>
              <ImpactTable rows={step.impact} />
            </div>
          )}
          {step.scores.length > 0 && (
            <div>
              <div className="flow-label">Scored ranking (out of 5)</div>
              <ScoreRanking scores={step.scores} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GuidedMode({ c, note, onNote, onFinish }) {
  const steps = useMemo(() => buildSteps(c), [c]);
  const [stepIndex, setStepIndex] = useState(0);
  const currentRef = useRef(null);

  useEffect(() => {
    if (stepIndex > 0) currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [stepIndex]);

  if (!steps.length) return <p className="muted">No walkthrough content recorded for this case yet.</p>;

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const nextLabel = step.type === "predict" ? "Reveal what happened" : isLast ? "Finish" : "Next";

  return (
    <>
      <div className="progress-row">
        {steps.map((_, i) => (
          <div key={i} className={`progress-dot ${i < stepIndex ? "done" : ""} ${i === stepIndex ? "current" : ""}`} />
        ))}
      </div>
      <div className="flow">
        {steps.slice(0, stepIndex).map((s, i) => <PastStep key={i} step={s} note={note} />)}
        <div className="flow-section is-current" ref={currentRef}>
          <div className="step-label-row">
            <div className="step-label">{step.label}</div>
            <div className="step-count">{stepIndex + 1} / {steps.length}</div>
          </div>
          <CurrentStep step={step} note={note} onNote={onNote} />
        </div>
      </div>
      <div className="step-controls">
        <button className="step-btn ghost" disabled={isFirst} onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
          <Icon name="arrowLeft" size={15} /> Back
        </button>
        <button className="step-btn primary" onClick={() => (isLast ? onFinish() : setStepIndex((i) => i + 1))}>
          {nextLabel} {!isLast && <Icon name="arrowRight" size={15} />}
        </button>
      </div>
    </>
  );
}

/* One panel at reading size. Clicking it hands off to the full-screen overlay. */
function ComicPanelImage({ panel, onOpen }) {
  const size = useImageSize(panel.src);

  if (size?.error) {
    return (
      <div className="comic-missing">
        <Icon name="image" size={30} />
        <p>Panel artwork didn’t load.</p>
        <code>{panel.src}</code>
      </div>
    );
  }

  const aspect = size ? size.w / size.h : 3 / 2;

  return (
    <button className="comic-open" onClick={onOpen} aria-label={`Open ${panel.label} full screen`}>
      <div className="comic-frame" style={{ "--a": aspect, aspectRatio: `${aspect}` }}>
        {!size && <div className="comic-skeleton" />}
        <img className="comic-bitmap" src={panel.src} alt={panel.label} draggable="false" />
        <span className="comic-open-badge"><Icon name="expand" size={14} /> Click to enlarge</span>
      </div>
    </button>
  );
}

/* The four panels of the current page at once — click one to read it full size. */
function ComicPageView({ comic, pageIndex, activeIndex, onPick }) {
  const pagePanels = comic.panels.filter((p) => p.page === pageIndex);
  return (
    <div className="comic-pagegrid">
      {pagePanels.map((p) => (
        <button
          key={p.index}
          className={`comic-thumb ${p.index === activeIndex ? "active" : ""}`}
          onClick={() => onPick(p.index)}
          aria-label={`Read ${p.label}`}
        >
          <img src={p.src} alt={p.label} draggable="false" />
        </button>
      ))}
    </div>
  );
}

/* Full-screen overlay: one panel filling the viewport, with prev / next / exit.
   It drives the same index as the reader, so closing leaves you on the panel
   you stopped at rather than snapping back. */
function ComicLightbox({ panels, index, onIndex, onClose }) {
  const panel = panels[index];
  const isFirst = index === 0;
  const isLast = index === panels.length - 1;

  usePreload([panels[index - 1]?.src, panels[index + 1]?.src]);

  // Lock the page behind the overlay.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") { if (!isLast) onIndex(index + 1); }
      else if (e.key === "ArrowLeft") { if (!isFirst) onIndex(index - 1); }
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, isFirst, isLast, onIndex, onClose]);

  return (
    <div className="comic-lightbox" role="dialog" aria-modal="true" aria-label={panel.label}>
      {/* Clicking anywhere off the artwork exits. */}
      <div className="comic-lb-backdrop" onClick={onClose} />

      <button className="comic-lb-exit" onClick={onClose}>
        <Icon name="close" size={17} /> Exit
      </button>

      <button className="comic-lb-arrow prev" onClick={() => onIndex(index - 1)}
              disabled={isFirst} aria-label="Previous panel">
        <Icon name="arrowLeft" size={26} />
      </button>

      <img className="comic-lb-img" src={panel.src} alt={panel.label} draggable="false" />

      <button className="comic-lb-arrow next" onClick={() => onIndex(index + 1)}
              disabled={isLast} aria-label="Next panel">
        <Icon name="arrowRight" size={26} />
      </button>

      <div className="comic-lb-counter">{panel.label}</div>
    </div>
  );
}

function ComicMode({ c, onFinish }) {
  const comic = useMemo(() => buildComic(c), [c]);
  const rootRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState("panel");   // opens on a single panel; "page" is the 2x2 overview
  const [lightbox, setLightbox] = useState(false);
  const col = industryStyle(c);

  const panels = comic.panels;
  const panel = panels[index];
  const pageIndex = panel?.page ?? 0;
  const hasArt = comic.kind !== "generated";

  // Keep the neighbouring panels warm so turning pages doesn't flash.
  usePreload([panels[index - 1]?.src, panels[index + 1]?.src, panels[index + 2]?.src]);

  const go = (d) => setIndex((i) => Math.min(panels.length - 1, Math.max(0, i + d)));

  // A full-height panel would otherwise open below the fold: the detail header
  // alone eats most of a laptop screen. Deferred a frame so it lands after the
  // parent's scroll-to-top on mode change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.requestAnimationFrame !== "function") return;
    const id = window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  // The overlay owns the keyboard while it's open.
  useEffect(() => {
    if (typeof window === "undefined" || lightbox) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "o" && hasArt) setView((v) => (v === "panel" ? "page" : "panel"));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, hasArt, panels.length]);

  if (!panels.length) return <p className="muted">No comic content available for this case yet.</p>;

  const isFirst = index === 0;
  const isLast = index === panels.length - 1;

  return (
    <div className="comic-reader" ref={rootRef}>
      <div className="comic-toolbar">
        <div className="comic-position">
          <strong>Panel {index + 1}</strong>
          <span>of {panels.length}</span>
          {comic.pageCount > 1 && <span className="comic-pagetag">Page {pageIndex + 1} / {comic.pageCount}</span>}
        </div>
        {hasArt && (
          <div className="comic-tools">
            <button className={`comic-tool ${view === "page" ? "on" : ""}`} onClick={() => setView(view === "panel" ? "page" : "panel")}>
              <Icon name="grid" size={14} /> {view === "panel" ? "Whole page" : "Single panel"}
            </button>
          </div>
        )}
      </div>

      <div className="comic-stage">
        {!hasArt ? (
          <div className="comic-placeholder" style={{ "--dot-color": col.fg }}>
            <div className="comic-placeholder-bg" />
            <div className="comic-placeholder-scene"><Icon name={col.icon} size={110} color={col.fg} /></div>
            <div className="comic-placeholder-caption">
              <span className="comic-caption-label">{panel.label}</span>
              <p>{panel.caption}</p>
            </div>
          </div>
        ) : view === "panel" ? (
          <ComicPanelImage panel={panel} onOpen={() => setLightbox(true)} />
        ) : (
          <ComicPageView comic={comic} pageIndex={pageIndex} activeIndex={index}
                         onPick={(i) => { setIndex(i); setView("panel"); }} />
        )}
      </div>

      <div className="comic-nav-row">
        <button className="step-btn ghost" disabled={isFirst} onClick={() => go(-1)}>
          <Icon name="arrowLeft" size={15} /> Back
        </button>
        <div className="comic-dots" role="tablist" aria-label="Comic panels">
          {panels.map((p, i) => (
            <button
              key={i}
              className={`comic-dot ${i === index ? "active" : ""} ${comic.pageCount > 1 && i % comic.perPage === 0 && i > 0 ? "page-break" : ""}`}
              onClick={() => setIndex(i)}
              aria-label={p.label}
              aria-selected={i === index}
              role="tab"
            />
          ))}
        </div>
        <button className="step-btn primary" onClick={() => (isLast ? onFinish() : go(1))}>
          {isLast ? "Finish" : "Next"} {!isLast && <Icon name="arrowRight" size={15} />}
        </button>
      </div>

      <div className="comic-hint">
        {hasArt
          ? "Click a panel to open it full screen · ← → to turn panels · O for the whole page"
          : "Preview panels — this shows the flow only. Point this case at its artwork folder with `\"comic\": \"comics/" + c.id + "\"` in cases.json."}
      </div>

      {lightbox && hasArt && (
        <ComicLightbox panels={panels} index={index} onIndex={setIndex} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}

function CaseDetail({ c, onBack, onPrev, onNext, note, onNote }) {
  const [mode, setMode] = useState(null); // null | "guided" | "comic" | "complete"
  const [modeKey, setModeKey] = useState(0); // remount a mode when re-entered so it restarts at step 1

  useEffect(() => { window.scrollTo(0, 0); }, [mode]);

  const enter = (m) => { setMode(m); setModeKey((k) => k + 1); };

  return (
    <>
      <div className="detail">
        <DetailHeader c={c} onBack={onBack} />

        {mode === null && (
          <>
            <IndustryBanner c={c} />
            <div className="chooser-prompt">How would you like to explore this case?</div>
            <div className="chooser-options">
              <button className="chooser-card guided" onClick={() => enter("guided")}>
                <div className="chooser-icon guided"><Icon name="compass" size={21} /></div>
                <div className="chooser-text">
                  <div className="chooser-title">Guided walkthrough</div>
                  <div className="chooser-desc">
                    Move through the case one step at a time — each step stays visible as you go, so nothing you've already read disappears, with a quick "what would you do?" moment along the way.
                  </div>
                </div>
              </button>
              <button className="chooser-card comic" onClick={() => enter("comic")}>
                <div className="chooser-icon comic"><Icon name="speech" size={21} /></div>
                <div className="chooser-text">
                  <div className="chooser-title">Understand with comic</div>
                  <div className="chooser-desc">Read the case as a 12-panel comic — one panel at a time, and click any panel to open it full screen.</div>
                </div>
              </button>
            </div>
          </>
        )}

        {(mode === "guided" || mode === "comic") && <SwitchLinks current={mode} onSwitch={enter} />}

        {mode === "guided" && (
          <GuidedMode key={modeKey} c={c} note={note} onNote={onNote} onFinish={() => setMode("complete")} />
        )}
        {mode === "comic" && <ComicMode key={modeKey} c={c} onFinish={() => setMode("complete")} />}

        {mode === "complete" && (
          <div className="complete-wrap">
            <div className="complete-burst"><Icon name="award" size={36} /></div>
            <div className="complete-title">Case complete!</div>
            <div className="complete-sub">You've walked through {c.id} — {c.name}.</div>
            <div className="complete-actions">
              <button className="step-btn ghost" onClick={onBack}><Icon name="arrowLeft" size={15} /> Back to all cases</button>
              <button className="step-btn primary" onClick={onNext}>Next case <Icon name="arrowRight" size={15} /></button>
            </div>
          </div>
        )}
      </div>

      <div className="detail-nav">
        <button className="nav-btn" onClick={onPrev}><Icon name="arrowLeft" size={15} /> Previous case</button>
        <button className="nav-btn next" onClick={onNext}>Next case <Icon name="arrowRight" size={15} /></button>
      </div>
    </>
  );
}

/* =====================================================================
   App
   ===================================================================== */
export default function App() {
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState(null);
  const [nature, setNature] = useState(null); // null | "Disruption" | "Improvement"
  const [predictionNotes, setPredictionNotes] = useState({}); // keyed by case id, kept across modes/cases

  const industries = useMemo(() => {
    const set = new Set();
    CASES.forEach((c) => set.add(primaryIndustry(c)));
    return Array.from(set).sort();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return CASES.filter((c) => {
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        String(c.industry || "").toLowerCase().includes(q) ||
        String(c.brand_group || "").toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q);
      const matchesIndustry = !industry || primaryIndustry(c) === industry;
      const matchesNature = !nature || natureLabel(c) === nature;
      return matchesQuery && matchesIndustry && matchesNature;
    });
  }, [query, industry, nature]);

  const selectedCase = selected ? CASES.find((c) => c.id === selected) : null;

  // Prev/next follow the current filtered list when the open case is in it.
  const navList = selectedCase && filtered.some((c) => c.id === selectedCase.id) ? filtered : CASES;
  const step = (dir) => {
    const i = navList.findIndex((c) => c.id === selected);
    setSelected(navList[(i + dir + navList.length) % navList.length].id);
  };

  const openCase = (id) => { setSelected(id); window.scrollTo(0, 0); };
  const visibleIds = useMemo(() => new Set(filtered.map((c) => c.id)), [filtered]);
  const backToGrid = () => { setSelected(null); window.scrollTo(0, 0); };

  return (
    <div className="fib-app">
      <style>{CSS}</style>

      <div className="topbar-wrap">
        <div className="topbar">
          <div className="brand-block">
            <div className="brand">Future Industry in a Box</div>
            <div className="tagline">We make supply chain easy to learn.</div>
          </div>
          <div className="topbar-right">
            <nav className="topnav">
              <span className="help-wrap">
                <a href="#" onClick={(e) => e.preventDefault()} aria-describedby="help-wip-tip">Help</a>
                <span className="wip-tip" id="help-wip-tip" role="tooltip">
                  <span className="wip-emoji" aria-hidden="true">🐣</span>
                  <strong>Lead time: a little longer!</strong> This hasn't shipped yet. We're working through the backlog, promise.
                </span>
              </span>
              <span className="help-wrap">
                <a href={MOODLE_URL} target="_blank" rel="noopener noreferrer" aria-describedby="about-hi-tip">About us</a>
                <span className="wip-tip tip-green" id="about-hi-tip" role="tooltip">
                  <span className="wip-emoji" aria-hidden="true">👋</span>
                  <strong>Come say hi on Moodle!</strong>
                </span>
              </span>
            </nav>
            <div className="case-count">{CASES.length} cases</div>
          </div>
        </div>

        {!selectedCase && (
          <>
            <div className="filterbar">
              <div className="search-field">
                <Icon name="search" size={15} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cases…" />
              </div>
              <div className="filter-divider" />
              <button className={`pill ${!industry ? "active" : ""}`} onClick={() => setIndustry(null)}>All industries</button>
              {industries.map((ind) => {
                const s = styleForText(ind) || FALLBACK_STYLE;
                return (
                  <button key={ind} className={`pill ${industry === ind ? "active" : ""}`} onClick={() => setIndustry(ind)}>
                    <span className="pill-dot" style={{ background: s.fg }} />
                    {ind}
                  </button>
                );
              })}
              <div className="filter-divider" />
              <button className={`pill ${!nature ? "active" : ""}`} onClick={() => setNature(null)}>All types</button>
              <button className={`pill nature-disruption ${nature === "Disruption" ? "active" : ""}`} onClick={() => setNature("Disruption")}>Disruption</button>
              <button className={`pill nature-improvement ${nature === "Improvement" ? "active" : ""}`} onClick={() => setNature("Improvement")}>Improvement</button>
            </div>
            <div className="legend">
              <div className="legend-item"><span className="legend-swatch disruption" />Disruption — something broke, a response was needed</div>
              <div className="legend-item"><span className="legend-swatch improvement" />Improvement — a proactive change was made</div>
            </div>
          </>
        )}
      </div>

      {selectedCase ? (
        <CaseDetail
          key={selectedCase.id}
          c={selectedCase}
          onBack={backToGrid}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          note={predictionNotes[selectedCase.id] || ""}
          onNote={(v) => setPredictionNotes((n) => ({ ...n, [selectedCase.id]: v }))}
        />
      ) : (
        <>
          <SeaChart cases={CASES} visibleIds={visibleIds} onOpen={openCase} />
          {filtered.length === 0 && <p className="empty-note">No cases match that search — every port is still on the chart, just dimmed.</p>}
        </>
      )}
    </div>
  );
}

/* =====================================================================
   Styles (ported from the colorful mockup)
   ===================================================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

.fib-app{
  --canvas:#F8F7F3;--surface:#FFFFFF;--ink:#1D2B2E;--muted:#5C6D70;
  --hairline:#E4E2DA;--hairline-strong:#D2CFC3;
  --disruption:#E1604A;--disruption-tint:#FBEAE6;
  --improvement:#2E9587;--improvement-tint:#E7F3F1;
  --focus:#1D2B2E;--accent-yellow:#F4B740;--accent-yellow-tint:#FDF3DE;
  background:var(--canvas);color:var(--ink);min-height:100vh;
  font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;
}
.fib-app *{box-sizing:border-box;}
.fib-app h1,.fib-app h2,.fib-app h3{font-family:'Space Grotesk',sans-serif;}
.fib-app button{font-family:inherit;}
.fib-app .muted{color:var(--muted);}

/* Top bar */
.topbar-wrap{background:linear-gradient(120deg,#FDEFE3 0%,#F3E8FF 35%,#E0F2FE 70%,#E0F7EF 100%);border-bottom:1px solid var(--hairline);}
.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:36px 48px 28px;max-width:1280px;margin:0 auto;}
.brand-block{display:flex;flex-direction:column;gap:4px;}
.brand{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.01em;}
.tagline{font-size:13px;color:var(--muted);}
.topbar-right{display:flex;align-items:center;gap:22px;}
.topnav{display:flex;align-items:center;gap:18px;}
.topnav a{font-size:13.5px;color:var(--ink);text-decoration:none;font-weight:500;padding-bottom:2px;border-bottom:1.5px solid transparent;transition:border-color .15s ease;}
.topnav a:hover{border-bottom-color:var(--ink);}
.case-count{font-size:13px;color:var(--muted);}

/* "Still hatching" tooltip on Help. Opens just below the link (the top bar has
   too little headroom above it), layered over everything on the page. */
.help-wrap{position:relative;display:inline-flex;}
.wip-tip{position:absolute;top:calc(100% + 12px);left:50%;z-index:100;
  width:max-content;max-width:230px;transform:translate(-50%,4px);
  display:block;text-align:center;font-size:12px;line-height:1.5;color:var(--ink);font-weight:400;
  background:#FFF9EC;border:1.5px solid #F6DFA6;border-radius:14px;padding:10px 14px 11px;
  box-shadow:0 10px 24px rgba(29,43,46,0.12);
  opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .16s ease,transform .16s ease,visibility .16s;}
.wip-tip::before{content:"";position:absolute;top:-7px;left:50%;width:12px;height:12px;
  background:#FFF9EC;border-left:1.5px solid #F6DFA6;border-top:1.5px solid #F6DFA6;
  border-radius:3px 0 0 0;transform:translateX(-50%) rotate(45deg);}
.wip-tip strong{font-family:'Space Grotesk',sans-serif;font-weight:700;color:#A2720C;}
/* Green variant for "About us" */
.wip-tip.tip-green{background:#EEF8F2;border-color:#BFE3CD;}
.wip-tip.tip-green::before{background:#EEF8F2;border-color:#BFE3CD;}
.wip-tip.tip-green strong{color:#1F6E63;}
.wip-emoji{display:block;font-size:20px;line-height:1;margin-bottom:4px;transform-origin:50% 100%;}
.help-wrap:hover .wip-tip,.help-wrap:focus-within .wip-tip{opacity:1;visibility:visible;transform:translate(-50%,0);}
.help-wrap:hover .wip-emoji,.help-wrap:focus-within .wip-emoji{animation:wipWobble .8s ease-in-out;}
@keyframes wipWobble{
  0%,100%{transform:rotate(0deg);}
  25%{transform:rotate(-10deg);}
  55%{transform:rotate(8deg);}
  80%{transform:rotate(-4deg);}
}
@media (prefers-reduced-motion:reduce){
  .help-wrap:hover .wip-emoji,.help-wrap:focus-within .wip-emoji{animation:none;}
}

/* Filter bar */
.filterbar{max-width:1280px;margin:0 auto;padding:0 48px 28px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;}
.search-field{position:relative;flex:1;min-width:220px;max-width:340px;}
.search-field input{width:100%;border:none;border-bottom:1.5px solid var(--hairline-strong);background:transparent;padding:8px 4px 8px 26px;font-size:14px;font-family:'Inter',sans-serif;color:var(--ink);outline:none;transition:border-color .15s ease;}
.search-field input:focus{border-bottom-color:var(--ink);}
.search-field input::placeholder{color:var(--muted);}
.search-field svg{position:absolute;left:2px;top:9px;stroke:var(--muted);}
.pill{border:1.5px solid var(--hairline-strong);background:var(--surface);color:var(--muted);padding:7px 14px;border-radius:100px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:border-color .15s ease,color .15s ease,background .15s ease,transform .1s ease;}
.pill:hover{border-color:var(--ink);color:var(--ink);transform:translateY(-1px);}
.pill.active{background:var(--ink);color:#fff;border-color:var(--ink);}
.pill.active.nature-disruption{background:var(--disruption);border-color:var(--disruption);}
.pill.active.nature-improvement{background:var(--improvement);border-color:var(--improvement);}
.pill:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}
.pill-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.filter-divider{width:1px;height:20px;background:var(--hairline-strong);margin:0 4px;}
.legend{max-width:1280px;margin:0 auto;padding:0 48px 18px;display:flex;flex-wrap:wrap;gap:20px;font-size:12.5px;color:var(--muted);}
.legend-item{display:flex;align-items:center;gap:7px;}
.legend-swatch{width:10px;height:10px;border-radius:3px;}
.legend-swatch.disruption{background:var(--disruption);}
.legend-swatch.improvement{background:var(--improvement);}

/* Grid */
.grid{max-width:1280px;margin:0 auto;padding:28px 48px 80px;display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:20px;}
.empty-note{max-width:1280px;margin:-60px auto 80px;padding:0 48px;color:var(--muted);font-size:13.5px;}
.card{position:relative;background:var(--surface);border:1.5px solid var(--hairline);border-radius:14px;padding:18px 20px;cursor:pointer;display:flex;flex-direction:column;gap:14px;text-align:left;color:var(--ink);transition:border-color .15s ease,transform .15s ease,box-shadow .18s ease;box-shadow:0 1px 2px rgba(29,43,46,0.04);}
.card:hover{border-color:var(--ink);transform:translateY(-3px);box-shadow:0 10px 24px rgba(29,43,46,0.10);}
.card:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}
.card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.node-icon{border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1.5px solid rgba(0,0,0,0.04);}
.card-meta{text-align:right;display:flex;flex-direction:column;gap:2px;padding-top:2px;}
.case-id{font-family:'Space Grotesk',sans-serif;font-size:12px;color:var(--muted);font-weight:600;}
.industry-tag{font-size:11px;color:var(--muted);}
.card-body{display:flex;flex-direction:column;gap:6px;}
.case-name{font-size:16px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;}
.case-desc{font-size:13px;color:var(--muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;}
.card-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;}
.badge{font-size:12px;font-weight:700;padding:5px 12px;border-radius:100px;display:inline-flex;align-items:center;gap:5px;}
.badge.disruption{background:var(--disruption-tint);color:#B8452F;}
.badge.improvement{background:var(--improvement-tint);color:#1F6E63;}
.decision-count{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);font-weight:500;}

/* Comic bookmark on cards that have a comic.
   Hangs from the top edge just right of the industry icon, so it never covers
   the icon or the case ID. Wrapper = position + wiggle; .cb-ribbon = the clipped
   purple shape; .cb-sparkle sits outside the clip so it can poke over the corner. */
.comic-bookmark{position:absolute;top:-1.5px;left:86px;z-index:1;display:block;pointer-events:none;
  transform-origin:50% 0;filter:drop-shadow(0 2px 4px rgba(29,43,46,0.10));}
.cb-ribbon{display:inline-flex;align-items:center;gap:5px;padding:6px 10px 13px 8px;
  border-radius:0 0 4px 4px;
  clip-path:polygon(0 0,100% 0,100% 100%,50% calc(100% - 6px),0 100%);}
.cb-face{display:block;flex-shrink:0;}
.cb-text{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.03em;line-height:1;}
.cb-sparkle{position:absolute;top:-5px;right:-7px;transform-origin:50% 50%;}
.card.has-comic:hover .comic-bookmark{animation:cbWiggle .7s ease-in-out;}
.card.has-comic:hover .cb-sparkle{animation:cbTwinkle .9s ease-in-out;}
@keyframes cbWiggle{
  0%,100%{transform:rotate(0deg);}
  20%{transform:rotate(-7deg);}
  45%{transform:rotate(5deg);}
  70%{transform:rotate(-3deg);}
  88%{transform:rotate(1.5deg);}
}
@keyframes cbTwinkle{
  0%,100%{transform:scale(1) rotate(0deg);opacity:1;}
  40%{transform:scale(1.45) rotate(45deg);opacity:0.85;}
  70%{transform:scale(0.8) rotate(90deg);opacity:1;}
}
@media (prefers-reduced-motion:reduce){
  .card.has-comic:hover .comic-bookmark,.card.has-comic:hover .cb-sparkle{animation:none;}
}

/* Detail */
.detail{max-width:820px;margin:0 auto;padding:40px 48px 60px;}
.back-link{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0 0 28px;}
.back-link:hover{color:var(--ink);}
.detail-header{display:flex;align-items:flex-start;gap:16px;padding-bottom:24px;border-bottom:1px solid var(--hairline);margin-bottom:28px;}
.detail-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;}
.detail-case-id{font-family:'Space Grotesk',sans-serif;font-size:13px;color:var(--muted);font-weight:600;}
.detail-name{font-size:26px;font-weight:700;letter-spacing:-0.015em;margin:0 0 8px;}
.detail-industry{font-size:13px;color:var(--muted);}
.detail-meta{display:flex;flex-wrap:wrap;gap:18px;font-size:13px;margin-top:8px;}
.detail-meta .muted{margin-right:4px;}

/* Chooser */
.industry-banner{position:relative;height:160px;border-radius:16px;overflow:hidden;margin-bottom:22px;display:flex;align-items:flex-end;}
.industry-banner .banner-watermark{position:absolute;right:-10px;top:50%;transform:translateY(-50%);width:170px;height:170px;opacity:0.16;}
.industry-banner .banner-nodes{position:absolute;inset:0;width:100%;height:100%;}
.industry-banner .banner-caption{position:relative;margin:16px;display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.82);backdrop-filter:blur(2px);padding:7px 14px 7px 8px;border-radius:100px;font-size:12.5px;font-weight:600;}
.industry-banner .banner-caption .node-icon{border:none;}
.chooser-prompt{font-size:14px;color:var(--muted);margin-bottom:16px;}
.chooser-options{display:flex;flex-direction:column;gap:14px;margin-bottom:12px;}
.chooser-card{border:1.5px solid var(--hairline-strong);border-radius:14px;padding:18px 22px;text-align:left;background:var(--surface);color:var(--ink);cursor:pointer;transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease;display:flex;align-items:center;gap:18px;width:100%;}
.chooser-card:hover{border-color:var(--ink);transform:translateY(-3px);box-shadow:0 10px 24px rgba(29,43,46,0.10);}
.chooser-card:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}
.chooser-card.guided{background:linear-gradient(100deg,#FDF3DE 0%,#FFFFFF 45%);}
.chooser-card.comic{background:linear-gradient(100deg,#F1EBFF 0%,#FFFFFF 45%);}
.chooser-icon{width:46px;height:46px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.chooser-icon.guided{background:var(--accent-yellow-tint);color:#B8791C;}
.chooser-icon.comic{background:#F1EBFF;color:#7C3AED;}
.chooser-text{display:flex;flex-direction:column;gap:4px;}
.chooser-title{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:700;}
.chooser-flag{font-family:'Inter',sans-serif;font-size:10.5px;font-weight:600;color:#7C3AED;background:#F1EBFF;padding:2px 8px;border-radius:100px;margin-left:8px;vertical-align:middle;}
.chooser-desc{font-size:13px;color:var(--muted);line-height:1.5;}
.switch-row{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:20px;}
.switch-view{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0;}
.switch-view:hover{color:var(--ink);}

/* Cumulative flow */
.flow{position:relative;padding-left:28px;margin-top:8px;}
.flow::before{content:"";position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:linear-gradient(180deg,#F4B740,#E1604A,#8B5CF6,#2E9587);opacity:0.35;}
.flow-section{position:relative;margin-bottom:36px;}
.flow-section::before{content:"";position:absolute;left:-28px;top:3px;width:10px;height:10px;border-radius:50%;background:var(--surface);border:2.5px solid var(--ink);}
.flow-section.is-decision::before{border-color:var(--disruption);}
.flow-section.is-current::before{border-color:var(--accent-yellow);width:12px;height:12px;left:-29px;}
.flow-label{font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600;}
.flow-content{font-size:14.5px;line-height:1.65;}
.flow-content p{margin:0;}
.predict-recap{font-style:italic;color:var(--muted);white-space:pre-wrap;}
.decision-block{background:var(--surface);border:1.5px solid var(--hairline);border-radius:12px;padding:14px 16px;}
.decision-block-title{font-weight:600;font-size:14px;margin-bottom:4px;}
.decision-block p{margin:0;font-size:13.5px;line-height:1.55;color:var(--muted);}
.decision-step-label{font-family:'Space Grotesk',sans-serif;font-size:12px;color:var(--disruption);margin-bottom:6px;font-weight:700;}

/* Data blocks */
.kv-list{display:grid;gap:10px;}
.kv-row{display:grid;grid-template-columns:180px 1fr;gap:16px;}
.kv-label{font-size:12.5px;color:var(--muted);font-weight:500;}
.kv-value{font-size:13.5px;line-height:1.6;}
.flow-chain{display:flex;overflow-x:auto;padding-bottom:6px;align-items:stretch;}
.flow-node{min-width:170px;max-width:190px;padding:12px 14px;background:var(--surface);border:1.5px solid var(--hairline);border-radius:10px;}
.flow-chain.compact .flow-node{min-width:130px;padding:8px 10px;}
.flow-node-id{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:700;color:var(--disruption);margin-bottom:4px;}
.flow-node-label{font-size:12.5px;line-height:1.45;}
.flow-node-desc{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.5;}
.flow-arrow{display:flex;align-items:center;padding:0 8px;color:var(--muted);}
.rating-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;}
.rating-chip{display:flex;flex-direction:column;gap:2px;padding:6px 10px;border-radius:8px;min-width:84px;}
.rating-chip-label{font-size:10.5px;color:var(--muted);}
.rating-chip-value{font-size:12.5px;font-weight:600;}
.best-when{font-size:12.5px;color:var(--muted);font-style:italic;margin-top:14px;border-top:1px solid var(--hairline);padding-top:10px;}
.outcome-stack{display:flex;flex-direction:column;gap:22px;}
.impact-wrap{overflow-x:auto;}
.impact-table{border-collapse:collapse;width:100%;font-size:12px;}
.impact-table th{text-align:left;padding:6px 10px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--hairline);white-space:nowrap;}
.impact-table td{padding:8px 10px;border-bottom:1px solid var(--hairline);white-space:nowrap;}
.impact-table td.impact-label{color:var(--ink);}
.score-list{display:grid;gap:10px;}
.score-row{display:grid;grid-template-columns:1fr 200px 36px;align-items:center;gap:12px;}
.score-name{font-size:13px;}
.score-val{font-family:'Space Grotesk',sans-serif;font-size:12.5px;font-weight:600;color:var(--muted);text-align:right;}
.kpi-bar-track{height:6px;border-radius:3px;background:var(--hairline);overflow:hidden;}
.kpi-bar-fill{height:100%;border-radius:3px;}
.kpi-bar-fill.down{background:linear-gradient(90deg,#E1604A,#F4B740);}
.kpi-bar-fill.up{background:linear-gradient(90deg,#2E9587,#6EE7D8);}

/* Guided walkthrough */
.progress-row{display:flex;align-items:center;gap:6px;margin-bottom:28px;}
.progress-dot{height:5px;flex:1;border-radius:3px;background:var(--hairline-strong);transition:background .2s ease;}
.progress-dot.done{background:var(--improvement);}
.progress-dot.current{background:var(--accent-yellow);}
.step-label-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.step-label{font-size:12px;color:var(--muted);font-weight:600;}
.step-count{font-family:'Space Grotesk',sans-serif;font-size:12px;color:var(--muted);}
.step-card{background:var(--surface);border:1.5px solid var(--hairline);border-radius:16px;padding:30px;min-height:180px;display:flex;flex-direction:column;justify-content:center;box-shadow:0 2px 10px rgba(29,43,46,0.05);}
.step-card.predict{background:linear-gradient(160deg,var(--accent-yellow-tint) 0%,#FFFFFF 55%);}
.step-heading{font-size:19px;font-weight:700;margin:0 0 12px;letter-spacing:-0.01em;}
.step-text{font-size:15px;line-height:1.7;margin:0;}
.predict-textarea{width:100%;min-height:80px;margin-top:16px;border:1.5px solid var(--hairline-strong);border-radius:10px;padding:12px 14px;font-family:'Inter',sans-serif;font-size:14px;color:var(--ink);resize:vertical;outline:none;background:#fff;}
.predict-textarea:focus{border-color:var(--accent-yellow);}
.predict-note{font-size:12px;color:var(--muted);margin-top:8px;}
.step-controls{display:flex;justify-content:space-between;align-items:center;margin-top:24px;}
.step-btn{display:inline-flex;align-items:center;gap:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;padding:11px 22px;border-radius:100px;transition:transform .1s ease,background .15s ease;}
.step-btn.primary{background:var(--ink);color:#fff;}
.step-btn.primary:hover{background:#33474C;transform:translateY(-1px);}
.step-btn.ghost{background:none;color:var(--muted);}
.step-btn.ghost:hover{color:var(--ink);}
.step-btn:disabled{opacity:0.35;cursor:default;transform:none;}

/* Comic reader
   The reader breaks out of the 820px prose column: artwork with lettering in it
   needs every pixel it can get, and a panel confined to body-copy width is
   exactly the problem this replaces. --stageh is the height the artwork may
   occupy inline; the full-screen overlay below is its own world. */
.comic-reader{--stageh:78vh;scroll-margin-top:20px;width:min(1180px,94vw);margin-left:50%;transform:translateX(-50%);}

.comic-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;min-height:34px;}
.comic-position{display:flex;align-items:baseline;gap:6px;font-size:13px;color:var(--muted);}
.comic-position strong{font-family:'Space Grotesk',sans-serif;font-size:15px;color:var(--ink);font-weight:700;}
.comic-pagetag{margin-left:8px;padding:3px 10px;border-radius:100px;background:var(--surface);border:1px solid var(--hairline-strong);font-size:11.5px;}
.comic-tools{display:flex;gap:8px;flex-wrap:wrap;}
.comic-tool{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;color:var(--muted);
  background:var(--surface);border:1.5px solid var(--hairline-strong);border-radius:100px;padding:7px 14px;cursor:pointer;
  transition:border-color .15s ease,color .15s ease,background .15s ease;}
.comic-tool:hover{border-color:var(--ink);color:var(--ink);}
.comic-tool.on{background:var(--ink);border-color:var(--ink);color:#fff;}
.comic-tool:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}

.comic-stage{display:flex;align-items:center;justify-content:center;background:#EFEDE6;border:1px solid var(--hairline-strong);
  border-radius:14px;padding:clamp(10px,2vw,22px);min-height:320px;}

/* The inline panel is a button — the whole thing is the hit target for the overlay.
   width:100% matters: .comic-frame sizes itself with min(100%, ...), and a
   shrink-to-fit parent would leave that percentage with nothing definite to
   resolve against, collapsing the panel to a few pixels. */
.comic-open{background:none;border:none;padding:0;cursor:zoom-in;display:flex;
  align-items:center;justify-content:center;width:100%;border-radius:8px;}
.comic-open:focus-visible{outline:3px solid var(--focus);outline-offset:4px;}
.comic-open:hover .comic-open-badge{opacity:1;transform:translateY(0);}
.comic-open:hover .comic-frame{box-shadow:0 12px 34px rgba(29,43,46,0.22);}
/* width:min(100%, stage-height x aspect) is the fit-inside-the-box rule — the
   panel grows until it runs out of either height or width, never distorting. */
.comic-frame{position:relative;overflow:hidden;background:#fff;border:3px solid var(--ink);border-radius:6px;
  width:min(100%,calc(var(--stageh) * var(--a,1.5)));height:auto;max-height:var(--stageh);
  box-shadow:0 8px 28px rgba(29,43,46,0.14);flex-shrink:0;transition:box-shadow .18s ease;}
.comic-bitmap{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;display:block;
  image-rendering:auto;user-select:none;}
.comic-open-badge{position:absolute;right:12px;bottom:12px;display:inline-flex;align-items:center;gap:6px;
  background:rgba(29,43,46,0.86);color:#fff;font-size:11.5px;font-weight:600;padding:6px 12px;border-radius:100px;
  opacity:0;transform:translateY(4px);transition:opacity .18s ease,transform .18s ease;pointer-events:none;}
.comic-skeleton{position:absolute;inset:0;background:linear-gradient(100deg,#F1EFE8 30%,#F8F7F3 50%,#F1EFE8 70%);
  background-size:200% 100%;animation:comicshim 1.2s ease-in-out infinite;}
@keyframes comicshim{from{background-position:180% 0;}to{background-position:-40% 0;}}
.comic-missing{text-align:center;color:var(--muted);padding:50px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;}
.comic-missing p{margin:0;font-size:14px;}
.comic-missing code{font-size:11.5px;background:var(--surface);border:1px solid var(--hairline);padding:3px 8px;border-radius:5px;}

/* Full-screen overlay */
.comic-lightbox{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;
  gap:clamp(8px,2vw,28px);padding:clamp(12px,3vw,40px);animation:lbfade .16s ease-out;}
@keyframes lbfade{from{opacity:0;}to{opacity:1;}}
.comic-lb-backdrop{position:absolute;inset:0;background:rgba(16,22,24,0.94);cursor:zoom-out;}
.comic-lb-img{position:relative;max-width:calc(100vw - 190px);max-height:calc(100vh - 116px);
  object-fit:contain;display:block;background:#fff;border-radius:4px;user-select:none;
  box-shadow:0 20px 60px rgba(0,0,0,0.5);}
.comic-lb-arrow{position:relative;flex-shrink:0;width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;
  background:rgba(255,255,255,0.12);color:#fff;display:flex;align-items:center;justify-content:center;
  transition:background .15s ease,transform .15s ease;}
.comic-lb-arrow:hover:not(:disabled){background:rgba(255,255,255,0.26);transform:scale(1.06);}
.comic-lb-arrow:disabled{opacity:0.22;cursor:default;}
.comic-lb-arrow:focus-visible{outline:2px solid #fff;outline-offset:3px;}
.comic-lb-exit{position:absolute;top:clamp(12px,2.4vw,26px);right:clamp(12px,2.4vw,26px);z-index:2;
  display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#fff;cursor:pointer;
  background:rgba(255,255,255,0.12);border:none;border-radius:100px;padding:9px 18px;transition:background .15s ease;}
.comic-lb-exit:hover{background:rgba(255,255,255,0.26);}
.comic-lb-exit:focus-visible{outline:2px solid #fff;outline-offset:3px;}
.comic-lb-counter{position:absolute;bottom:clamp(12px,2.4vw,26px);left:50%;transform:translateX(-50%);
  font-family:'Space Grotesk',sans-serif;font-size:12.5px;font-weight:600;color:rgba(255,255,255,0.78);
  background:rgba(255,255,255,0.10);padding:7px 16px;border-radius:100px;white-space:nowrap;}

/* Whole-page overview: the four panels of the current page, side by side */
.comic-pagegrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-height:var(--stageh);overflow:auto;width:100%;
  align-content:start;padding:2px;}
.comic-thumb{border:3px solid var(--ink);border-radius:6px;overflow:hidden;background:#fff;cursor:pointer;padding:0;line-height:0;
  transition:transform .15s ease,box-shadow .15s ease;}
.comic-thumb:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(29,43,46,0.16);}
.comic-thumb.active{outline:3px solid var(--accent-yellow);outline-offset:2px;}
.comic-thumb:focus-visible{outline:3px solid var(--focus);outline-offset:2px;}
.comic-thumb img{width:100%;height:auto;display:block;}

.comic-nav-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;}
.comic-dots{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;}
.comic-dot{width:10px;height:10px;border-radius:50%;background:var(--hairline-strong);border:none;padding:0;cursor:pointer;transition:background .15s ease,transform .15s ease;}
.comic-dot:hover{transform:scale(1.25);}
.comic-dot.active{background:var(--ink);transform:scale(1.25);}
.comic-dot.page-break{margin-left:14px;position:relative;}
.comic-dot.page-break::before{content:"";position:absolute;left:-8px;top:-1px;width:1px;height:12px;background:var(--hairline-strong);}
.comic-hint{font-size:11.5px;color:var(--muted);margin-top:14px;text-align:center;}
.placeholder-note{font-size:11.5px;color:var(--muted);font-style:italic;margin-top:16px;text-align:center;}

/* Caption-card fallback for cases with no artwork yet */
.comic-placeholder{border:3px solid var(--ink);border-radius:8px;width:100%;max-width:820px;min-height:340px;position:relative;
  overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;background:#fff;}
.comic-placeholder-bg{position:absolute;inset:0;background-image:radial-gradient(circle,var(--dot-color,var(--muted)) 1.6px,transparent 1.7px);background-size:16px 16px;opacity:0.28;}
.comic-placeholder-scene{position:relative;flex:1;display:flex;align-items:center;justify-content:center;min-height:190px;}
.comic-placeholder-caption{position:relative;background:var(--ink);color:#fff;padding:16px 20px;}
.comic-caption-label{display:inline-block;background:var(--accent-yellow);color:var(--ink);font-family:'Space Grotesk',sans-serif;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:4px;margin-bottom:8px;}
.comic-placeholder-caption p{margin:0;font-size:14.5px;line-height:1.55;font-weight:500;}

/* Completion */
.complete-wrap{text-align:center;padding:30px 10px 10px;}
.complete-burst{width:88px;height:88px;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;background:conic-gradient(from 0deg,#F4B740,#E1604A,#8B5CF6,#2E9587,#F4B740);position:relative;color:var(--ink);}
.complete-burst::before{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--surface);}
.complete-burst svg{position:relative;z-index:1;}
.complete-title{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0 0 8px;}
.complete-sub{font-size:14px;color:var(--muted);margin-bottom:28px;line-height:1.5;}
.complete-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}

/* Bottom case nav */
.detail-nav{max-width:820px;margin:0 auto;padding:20px 48px 100px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--hairline);}
.nav-btn{display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;color:var(--ink);font-size:13.5px;font-weight:500;padding:8px;}
.nav-btn:hover{color:var(--muted);}
.nav-btn.next{margin-left:auto;}

@media (max-width:640px){
  .topbar,.filterbar,.grid,.detail,.legend,.detail-nav,.empty-note{padding-left:16px;padding-right:16px;}
  .topbar{flex-direction:column;}
  .wip-tip{left:-6px;transform:translateY(4px);}
  .help-wrap:hover .wip-tip,.help-wrap:focus-within .wip-tip{transform:translateY(0);}
  .wip-tip::before{left:18px;}
  .kv-row{grid-template-columns:1fr;gap:2px;}
  .score-row{grid-template-columns:1fr 90px 32px;}
  .step-card{padding:20px;}
  .comic-reader{width:100vw;--stageh:66vh;}
  .comic-stage{padding:8px;border-radius:0;border-left:none;border-right:none;}
  .comic-nav-row{flex-wrap:wrap;justify-content:center;}
  .comic-lb-img{max-width:calc(100vw - 24px);max-height:calc(100vh - 168px);}
  .comic-lb-arrow{position:fixed;bottom:18px;width:48px;height:48px;background:rgba(255,255,255,0.18);}
  .comic-lb-arrow.prev{left:22px;}
  .comic-lb-arrow.next{right:22px;}
  .comic-lb-counter{bottom:34px;}
  .comic-nav-row .comic-dots{order:3;width:100%;margin-top:10px;}
  .comic-toolbar{justify-content:center;}
}
  `;
