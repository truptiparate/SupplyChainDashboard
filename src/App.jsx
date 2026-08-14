import React, { useState, useMemo } from "react";
import DATA from "./data/cases.json";

const ACCENT = "#C1452F"; // coral — disruption / risk
const RESOLVE = "#1F8A5F"; // teal — recovery / resolution / improvement
const INK = "#F7F5F0";
const CARD = "#FFFFFF";
const CARD_HOVER = "#F2EFE8";
const BORDER = "rgba(18,21,26,0.10)";
const BORDER_STRONG = "rgba(18,21,26,0.20)";
const TEXT = "#191B1F";
const TEXT_SUB = "#5C5D58";
const TEXT_MUTE = "#8A8B85";

function isImprovement(c) {
  return String(c.nature || "").toLowerCase().startsWith("improve");
}

function ratingTone(raw) {
  if (raw == null) return null;
  const v = String(raw).toLowerCase();
  const bad = ["very high", "high", "very poor", "poor", "slow", "long", "collapsed", "very low", "worse", "financial only", "uncertain"];
  const good = ["low", "improved", "reduced", "protected", "fast", "structurally", "high" /*quality-high handled below*/];
  if (v.includes("n/a") || v === "neutral" || v === "medium" || v.includes("med")) return "neutral";
  if (v.includes("very high") || v.includes("very poor") || v.includes("collapsed") || v.includes("very low")) return "bad";
  if (v.includes("high") && !v.includes("quality") ) {
    // "High" is good for Quality/Customer satisfaction but bad for Cost/Risk/CO2/Waste — context unknown here,
    // so treat "reduced/low/improved/protected/structurally" as good and leave plain "high" neutral-leaning bad only for clearly cost/risk-flavoured words
    return "warn";
  }
  if (v.includes("low") || v.includes("reduced") || v.includes("improved") || v.includes("protected") || v.includes("fast") || v.includes("structurally")) return "good";
  if (v.includes("slow") || v.includes("long") || v.includes("poor")) return "bad";
  return null;
}

function toneColor(tone) {
  switch (tone) {
    case "good": return { fg: "#1F8A5F", bg: "rgba(31,138,95,0.12)" };
    case "bad": return { fg: "#C1452F", bg: "rgba(193,69,47,0.10)" };
    case "warn": return { fg: "#A2720C", bg: "rgba(162,114,12,0.12)" };
    default: return { fg: TEXT_SUB, bg: "rgba(18,21,26,0.05)" };
  }
}

function Chip({ label, value }) {
  const tone = ratingTone(value);
  const c = toneColor(tone);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 10px", borderRadius: 6, background: c.bg, minWidth: 84 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: TEXT_MUTE }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: c.fg }}>{String(value)}</span>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px" }}>
      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: TEXT_MUTE }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: BORDER }} />
    </div>
  );
}

function NatureBadge({ c, size = "sm" }) {
  const improvement = isImprovement(c);
  const color = improvement ? RESOLVE : ACCENT;
  const bg = improvement ? "rgba(31,138,95,0.10)" : "rgba(193,69,47,0.10)";
  const label = c.nature || (improvement ? "Improvement" : "Disruption");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: size === "sm" ? 10.5 : 11.5,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color,
        background: bg,
        borderRadius: 5,
        padding: size === "sm" ? "3px 7px" : "4px 9px",
      }}
    >
      {label}
    </span>
  );
}

function IndustryPill({ industry, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12.5,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? ACCENT : BORDER}`,
        background: active ? "rgba(193,69,47,0.10)" : "transparent",
        color: active ? ACCENT : TEXT_SUB,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {industry}
    </button>
  );
}

function CaseCard({ c, onOpen }) {
  const [hover, setHover] = useState(false);
  const improvement = isImprovement(c);
  const narrative = improvement ? (c.improvement || []) : (c.disruption || []);
  const hook =
    narrative.find((d) => d.label.toLowerCase().includes(improvement ? "problem" : "trigger"))?.value ||
    narrative[0]?.value ||
    "";
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        background: hover ? CARD_HOVER : CARD,
        border: `1px solid ${hover ? BORDER_STRONG : BORDER}`,
        borderRadius: 10,
        padding: "18px 18px 16px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transition: "background 120ms, border-color 120ms",
        boxShadow: hover ? "0 2px 10px rgba(18,21,26,0.06)" : "0 1px 2px rgba(18,21,26,0.03)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, color: ACCENT, letterSpacing: "0.06em" }}>{c.id}</span>
        <NatureBadge c={c} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 500, color: TEXT, margin: 0, lineHeight: 1.35 }}>{c.name}</h3>
      <p style={{ fontSize: 13, color: TEXT_SUB, margin: 0, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {hook}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4 }}>
        <span style={{ fontSize: 12, color: TEXT_MUTE }}>{c.brand_group.split(".")[0]}</span>
        <span style={{ fontSize: 10.5, color: TEXT_MUTE, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right", maxWidth: 140 }}>{c.industry.split(";")[0].split("/")[0].trim()}</span>
      </div>
    </button>
  );
}

function KVList({ items }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16 }}>
          <span style={{ fontSize: 12.5, color: TEXT_MUTE, fontWeight: 500 }}>{it.label}</span>
          <span style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.6 }}>{String(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

function FlowStrip({ nodes }) {
  return (
    <div style={{ display: "flex", overflowX: "auto", gap: 0, paddingBottom: 6 }}>
      {nodes.map((n, i) => (
        <React.Fragment key={i}>
          <div style={{ minWidth: 190, maxWidth: 190, padding: "12px 14px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: ACCENT, fontFamily: "ui-monospace, monospace", marginBottom: 4 }}>N{i + 1}</div>
            <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.5 }}>{n.label.replace(/^Node\s*\d+\s*[–—-]\s*/i, "")}</div>
            {n.description && <div style={{ fontSize: 11.5, color: TEXT_SUB, marginTop: 6, lineHeight: 1.5 }}>{n.description}</div>}
          </div>
          {i < nodes.length - 1 && (
            <div style={{ display: "flex", alignItems: "center", padding: "0 8px", color: TEXT_MUTE, fontSize: 14 }}>→</div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function DecisionCard({ d }) {
  const skip = new Set(["decision_no", "Description", "Action", "Best when"]);
  const ratingKeys = Object.keys(d).filter((k) => !skip.has(k));
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h4 style={{ fontSize: 14, fontWeight: 500, color: TEXT, margin: 0 }}>{d["Description"] || `Decision ${d.decision_no ?? ""}`}</h4>
        {d.decision_no != null && <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: TEXT_MUTE }}>#{d.decision_no}</span>}
      </div>
      {d["Action"] && <p style={{ fontSize: 13, color: TEXT_SUB, margin: 0, lineHeight: 1.55 }}>{d["Action"]}</p>}
      {ratingKeys.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {ratingKeys.map((k) => (
            <Chip key={k} label={k} value={d[k]} />
          ))}
        </div>
      )}
      {d["Best when"] && (
        <div style={{ fontSize: 12, color: TEXT_MUTE, fontStyle: "italic", marginTop: 4, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
          Best when {d["Best when"].charAt(0).toLowerCase() + d["Best when"].slice(1)}
        </div>
      )}
    </div>
  );
}

function ScoreRanking({ scores }) {
  const overallKey = (row) => Object.keys(row).find((k) => k.toLowerCase().startsWith("overall")) || "Overall";
  const sorted = [...scores]
    .filter((s) => typeof s[overallKey(s)] === "number")
    .sort((a, b) => b[overallKey(b)] - a[overallKey(a)]);
  const max = 5;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {sorted.map((s, i) => {
        const val = s[overallKey(s)];
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 220px 42px", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: TEXT }}>{s.label}</span>
            <div style={{ height: 8, background: "rgba(18,21,26,0.07)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(val / max) * 100}%`, background: i === 0 ? RESOLVE : ACCENT, opacity: i === 0 ? 1 : 0.7 }} />
            </div>
            <span style={{ fontSize: 12.5, color: TEXT_SUB, fontFamily: "ui-monospace, monospace", textAlign: "right" }}>{val.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ScenarioTimeline({ rows }) {
  const metricKeys = rows.length ? Object.keys(rows[0]).filter((k) => k !== "label") : [];
  return (
    <div style={{ display: "flex", overflowX: "auto", gap: 12, paddingBottom: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ minWidth: 220, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: i === 0 ? TEXT_SUB : i === rows.length - 1 ? RESOLVE : ACCENT, marginBottom: 10 }}>{r.label}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {metricKeys.map((k) => (
              r[k] != null && (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, color: TEXT_MUTE }}>{k}</span>
                  <span style={{ fontSize: 11.5, color: TEXT, textAlign: "right" }}>{String(r[k])}</span>
                </div>
              )
            ))}
          </div>
        </div>
      ))}
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
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 10px", color: TEXT_MUTE, fontWeight: 500, borderBottom: `1px solid ${BORDER}` }}>Decision</th>
            {cols.map((c) => (
              <th key={c} style={{ textAlign: "left", padding: "6px 10px", color: TEXT_MUTE, fontWeight: 500, borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: "8px 10px", color: TEXT, borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>{r.label}</td>
              {cols.map((c) => {
                const tone = ratingTone(r[c]);
                const col = toneColor(tone);
                return (
                  <td key={c} style={{ padding: "8px 10px", borderBottom: `1px solid ${BORDER}`, color: r[c] ? col.fg : TEXT_MUTE, whiteSpace: "nowrap" }}>
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

function getSections(c) {
  const improvement = isImprovement(c);
  return [
    { key: "overview", label: "Overview" },
    { key: "normal", label: "Normal operations" },
    { key: "narrative", label: improvement ? "Improvement" : "Disruption" },
    { key: "decisions", label: improvement ? "Implementation" : "Decisions" },
    { key: "outcome", label: "Outcome" },
  ];
}

function CaseDetail({ c, onBack }) {
  const [section, setSection] = useState("overview");
  const improvement = isImprovement(c);
  const sections = getSections(c);
  const narrativeItems = improvement ? (c.improvement || []) : (c.disruption || []);
  const narrativeSectionLabel = improvement ? "What was improved" : "What happened";
  const decisionsLabel = improvement ? "Implementation options" : "Decisions";

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px 80px" }}>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: TEXT_SUB, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}
      >
        ← All cases
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: ACCENT, letterSpacing: "0.06em" }}>{c.id}</span>
        <NatureBadge c={c} size="lg" />
        <span style={{ fontSize: 11, color: TEXT_MUTE, textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.industry}</span>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 500, color: TEXT, margin: "0 0 14px", lineHeight: 1.3 }}>{c.name}</h1>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: TEXT_SUB, marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${BORDER}` }}>
        <div><span style={{ color: TEXT_MUTE }}>Brand & group  </span>{c.brand_group}</div>
        <div><span style={{ color: TEXT_MUTE }}>Scale  </span>{c.scale}</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 30, flexWrap: "wrap" }}>
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            style={{
              fontSize: 12.5,
              padding: "7px 14px",
              borderRadius: 7,
              border: `1px solid ${section === s.key ? ACCENT : BORDER}`,
              background: section === s.key ? "rgba(193,69,47,0.09)" : "transparent",
              color: section === s.key ? ACCENT : TEXT_SUB,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div>
          <SectionLabel>Normal KPI conditions</SectionLabel>
          <KVList items={c.kpis} />
        </div>
      )}

      {section === "normal" && (
        <div>
          <SectionLabel>Baseline flow</SectionLabel>
          <FlowStrip nodes={c.normal_flow_nodes} />
        </div>
      )}

      {section === "narrative" && (
        <div>
          <SectionLabel>{narrativeSectionLabel}</SectionLabel>
          {narrativeItems.length > 0 ? (
            <KVList items={narrativeItems} />
          ) : (
            <p style={{ fontSize: 13, color: TEXT_MUTE, margin: 0 }}>No {improvement ? "improvement" : "disruption"} details recorded for this case.</p>
          )}
        </div>
      )}

      {section === "decisions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {c.decision_blocks.map((block, i) => (
            <div key={i}>
              <SectionLabel>{block.source.replace(/Decision Analysis\s*/i, "").replace(/^by (the )?company:?/i, "Actual response:").trim() || decisionsLabel}</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {block.decisions.map((d, j) => (
                  <DecisionCard key={j} d={d} />
                ))}
              </div>
            </div>
          ))}
          {c.decisions_impact_summary.length > 0 && (
            <div>
              <SectionLabel>Impact summary</SectionLabel>
              <ImpactTable rows={c.decisions_impact_summary} />
            </div>
          )}
          {c.decision_scores.length > 0 && (
            <div>
              <SectionLabel>Scored ranking (out of 5)</SectionLabel>
              <ScoreRanking scores={c.decision_scores} />
            </div>
          )}
        </div>
      )}

      {section === "outcome" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {c.kpi_change_summary.length > 0 && (
            <div>
              <SectionLabel>How it evolved</SectionLabel>
              <ScenarioTimeline rows={c.kpi_change_summary} />
            </div>
          )}
          {c.sources.length > 0 && (
            <div>
              <SectionLabel>Sources</SectionLabel>
              <div style={{ display: "grid", gap: 8 }}>
                {c.sources.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: TEXT_MUTE, lineHeight: 1.6 }}>{s}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState(null);

  const industries = useMemo(() => {
    const set = new Set();
    DATA.cases.forEach((c) => set.add(c.industry.split(";")[0].split("/")[0].trim()));
    return Array.from(set).sort();
  }, []);

  const filtered = useMemo(() => {
    return DATA.cases.filter((c) => {
      const matchesQuery =
        !query ||
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.industry.toLowerCase().includes(query.toLowerCase()) ||
        c.brand_group.toLowerCase().includes(query.toLowerCase());
      const matchesIndustry = !industry || c.industry.split(";")[0].split("/")[0].trim() === industry;
      return matchesQuery && matchesIndustry;
    });
  }, [query, industry]);

  const selectedCase = selected ? DATA.cases.find((c) => c.id === selected) : null;

  return (
    <div style={{ background: INK, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {selectedCase ? (
        <CaseDetail c={selectedCase} onBack={() => setSelected(null)} />
      ) : (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px 80px" }}>
          <div style={{ marginBottom: 32 }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase" }}>Supply chain intelligence</span>
            <h1 style={{ fontSize: 30, fontWeight: 500, color: TEXT, margin: "8px 0 6px" }}>Disruption case file library</h1>
            <p style={{ fontSize: 14, color: TEXT_SUB, margin: 0, maxWidth: 620, lineHeight: 1.6 }}>
              {DATA.cases.length} documented supply chain cases — disruptions and improvements — what triggered them, how each company responded, and what it cost or saved them.
            </p>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company, industry, or scenario..."
            style={{
              width: "100%",
              maxWidth: 420,
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              background: CARD,
              color: TEXT,
              fontSize: 13.5,
              marginBottom: 16,
              outline: "none",
            }}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
            <IndustryPill industry="All" active={!industry} onClick={() => setIndustry(null)} />
            {industries.map((ind) => (
              <IndustryPill key={ind} industry={ind} active={industry === ind} onClick={() => setIndustry(ind)} />
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {filtered.map((c) => (
              <CaseCard key={c.id} c={c} onOpen={() => setSelected(c.id)} />
            ))}
          </div>

          {filtered.length === 0 && (
            <p style={{ color: TEXT_MUTE, fontSize: 13.5 }}>No cases match that search.</p>
          )}
        </div>
      )}
    </div>
  );
}
