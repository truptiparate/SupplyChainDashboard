/* Shared case data model for the UI rework.
   Wraps cases.json (unchanged, still produced by scripts/extract.py) with the
   shape-fixes and derived fields the new "Supply Chain Expedition" UI needs:
     - a `scores` lookup keyed by decision number (decision_scores is an array)
     - a computed `tier` (0-3 difficulty), ported from the prototype
   None of this touches extract.py or cases.json — it's a pure in-memory
   adapter, same as the original prototype's own CASES setup at
   https://claude.ai/artifact/VNqAaHhXPiTNPHyouYrQH1 (see assignTiers there).
   Phase 0 of the UI-rework plan — see CLAUDE.md for the full phase list. */
import DATA from "./cases.json";

export function overallKey(row) {
  return Object.keys(row).find((k) => k.toLowerCase().startsWith("overall")) || "Overall";
}

function scoresByDecisionNo(decisionScores) {
  const map = {};
  for (const row of decisionScores || []) {
    if (row.decision_no == null) continue;
    const key = overallKey(row);
    map[row.decision_no] = { ...row, overall: typeof row[key] === "number" ? row[key] : null };
  }
  return map;
}

/* First decision block's decisions that have a numeric score — this is what
   the prototype calls "companyOpts": the real options actually scored
   against each other, used both for the "Your call" prediction game and the
   complexity/tier formula below. */
function scoredCompanyDecisions(c) {
  const firstBlock = c.decision_blocks?.[0];
  if (!firstBlock) return [];
  return firstBlock.decisions.filter((d) => c.scores[d.decision_no]?.overall != null);
}

/* Rough per-case complexity score — more decisions, more flow nodes, more
   KPIs, and a tighter race between the top two scored options all push a
   case to be ranked harder. Only used to bucket cases into difficulty tiers
   below; not stored or extracted anywhere, recomputed every load. */
function complexity(c) {
  const decisionCount = (c.decision_blocks || []).reduce((n, b) => n + b.decisions.length, 0);
  const scoredOpts = scoredCompanyDecisions(c);
  const sorted = scoredOpts.map((d) => c.scores[d.decision_no].overall).sort((a, b) => b - a);
  const gap = sorted.length > 1 ? sorted[0] - sorted[1] : 1;
  return (
    decisionCount +
    (c.normal_flow_nodes?.length || 0) * 1.2 +
    scoredOpts.length * 0.8 +
    (gap < 0.05 ? 4 : gap <= 0.2 ? 2 : 0) +
    (c.kpis?.length || 0) * 0.15
  );
}

export const TIERS = [
  { name: "Easy", hex: "#5CC98A" },
  { name: "Intermediate", hex: "#4FA8F0" },
  { name: "Hard", hex: "#F2994A" },
  { name: "Expert", hex: "#E35D8F" },
];

export const CASES = DATA.cases.map((c) => ({ ...c, scores: scoresByDecisionNo(c.decision_scores) }));

// Rank every case by complexity, then bucket into four tiers by rank — same
// breakpoints as the prototype (first 6 = Easy, next 5 = Intermediate, next
// 5 = Hard, rest = Expert). Buckets shift automatically as cases are added.
(function assignTiers() {
  const ranked = CASES.map((c, i) => ({ i, v: complexity(c) })).sort((a, b) => a.v - b.v);
  ranked.forEach(({ i }, rank) => {
    CASES[i].tier = rank < 6 ? 0 : rank < 11 ? 1 : rank < 16 ? 2 : 3;
  });
})();

export function caseById(id) {
  return CASES.find((c) => c.id === id);
}
