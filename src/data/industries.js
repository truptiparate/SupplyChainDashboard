/* Industry verticals: one colour + icon each ----------------
   One entry per vertical produced by the extraction pipeline. `match` catches the
   free-text variants that show up in cases.json ("Automotive; Tier-1 supplier",
   "Fashion/Apparel", "Pharmaceuticals"…) so a case still lands on its vertical
   even when the string isn't an exact label. Add a vertical by adding a row here
   — nothing else needs to change.
   Moved out of App.jsx in the UI-rework scaffolding so the sea chart / voyage
   page components can share the same taxonomy instead of redefining it. */
export const VERTICALS = [
  { name: "Automotive",  fg: "#C2410C", bg: "#FDEDE3", deep: "#F6C39E", icon: "car",
    match: ["automotive", "auto", "vehicle", "mobility", "tier-1", "oem"] },
  { name: "Aviation",    fg: "#0E7490", bg: "#DEF1F6", deep: "#9AD5E4", icon: "plane",
    match: ["aviation", "aerospace", "airline", "aircraft", "air cargo", "airport"] },
  { name: "Chemicals",   fg: "#047857", bg: "#DFF3EA", deep: "#9BD9BF", icon: "flask",
    match: ["chemical", "petrochem", "polymer", "specialty chem", "fertiliz", "fertiliser"] },
  { name: "Electronics", fg: "#6D28D9", bg: "#EDE6FD", deep: "#C4B0F7", icon: "cpu",
    match: ["electronic", "semiconductor", "chip", "component", "hardware", "telecom", "computer"] },
  { name: "Food",        fg: "#3F6212", bg: "#EFF6DE", deep: "#C5E29A", icon: "utensils",
    match: ["food", "beverage", "agri", "dairy", "grocery", "fmcg", "cpg"] },
  { name: "Healthcare",  fg: "#BE123C", bg: "#FCE4E9", deep: "#F4AABC", icon: "heartPulse",
    match: ["health", "pharma", "medic", "hospital", "biotech", "vaccine", "life science"] },
  { name: "Logistics",   fg: "#1D4ED8", bg: "#E4EAFD", deep: "#B0C3F8", icon: "truck",
    match: ["logistic", "shipping", "transport", "freight", "port", "courier", "maritime", "warehous", "3pl"] },
  { name: "Mining",      fg: "#8A5206", bg: "#FBF2DC", deep: "#EBD08A", icon: "mountain",
    match: ["mining", "metal", "steel", "ore", "mineral", "extraction", "raw material"] },
  { name: "Retail",      fg: "#A21CAF", bg: "#F9E4FB", deep: "#EAAEF0", icon: "cart",
    match: ["retail", "fashion", "apparel", "textile", "consumer", "commerce", "e-commerce"] },
];
export const FALLBACK_STYLE = { name: "Other", bg: "#F1F1EE", fg: "#5C6D70", deep: "#D2CFC3", icon: "layers" };

export function primaryIndustry(c) {
  return String(c.industry || "").split(";")[0].split("/")[0].trim() || "Other";
}
// Exact label first (the pill list uses canonical names), then keyword fallback.
export function styleForText(text) {
  const s = String(text || "").trim().toLowerCase();
  if (!s) return null;
  return (
    VERTICALS.find((v) => v.name.toLowerCase() === s) ||
    VERTICALS.find((v) => v.match.some((w) => s.includes(w))) ||
    null
  );
}
export function industryStyle(c) {
  return styleForText(primaryIndustry(c)) || styleForText(c.industry) || FALLBACK_STYLE;
}
