import { useMemo } from "react";
import { TIERS, isImprovement, natureLabel } from "../data/model.js";
import { industryStyle } from "../data/industries.js";

/* =====================================================================
   Logbook — flat list alternative to the sea chart, cases grouped by
   difficulty tier. Ported from the prototype's renderLogbook() (see
   SeaChart.jsx's header comment for the source), minus the star-row per
   card — that was gamification (stars earned per case), deferred along
   with the rest of the XP/rank system to a later phase.
   ===================================================================== */

function TierBars({ tier }) {
  return (
    <span className="lb-sig" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i <= tier ? "on" : ""} style={{ height: 3 + i * 3 }} />
      ))}
    </span>
  );
}

export default function Logbook({ cases, visibleIds, onOpen }) {
  const byTier = useMemo(() => {
    const groups = TIERS.map(() => []);
    cases.forEach((c) => groups[c.tier].push(c));
    return groups;
  }, [cases]);

  return (
    <div className="lb-wrap">
      {TIERS.map((t, i) => {
        const list = byTier[i];
        if (!list.length) return null;
        return (
          <section key={t.name} className="lb-tier">
            <div className="lb-tier-head">
              <span style={{ color: t.hex }}><TierBars tier={i} /></span>
              <h2>{t.name}</h2>
              <span className="lb-count">{list.length} case{list.length === 1 ? "" : "s"}</span>
            </div>
            <div className="lb-grid">
              {list.map((c) => (
                <button
                  key={c.id}
                  className={`lb-card ${visibleIds.has(c.id) ? "" : "dim"}`}
                  onClick={() => onOpen(c.id)}
                >
                  <div className="lb-top">
                    <span>{c.id} · {industryStyle(c).name}</span>
                    <span className={isImprovement(c) ? "lb-improve" : "lb-disrupt"}>{natureLabel(c)}</span>
                  </div>
                  <b>{c.name}</b>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
