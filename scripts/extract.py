"""
Extraction engine for the IndustrialUseCases workbook (Updated Template).

Sheets are semi-structured narrative documents, not tables. Every section is
located by searching for its anchor label text in column B (never a fixed
row number), because row positions shift per sheet depending on node count,
decision count, and number of decision-analysis blocks.

Each sheet is expected to have: header fields (ID, name, industry, nature,
etc.), a baseline flow with KPIs, a nature-specific details section
(Disruption or Improvement), one or more decision blocks, and per-decision
impact-summary / score tables. After extraction, the script prints a summary
of how many usecases were extracted and flags any usecase missing details,
decisions, or per-decision KPI data.

Re-run this script any time the source Excel is updated:
    python3 extract.py <path_to_xlsx> <output_json_path>
"""
import sys
import json
import openpyxl

SKIP_SHEET_SUBSTRINGS = ("directory",)


def cell(ws, row, col):
    v = ws.cell(row=row, column=col).value
    if isinstance(v, str):
        v = v.strip()
        if v == "":
            return None
    return v


def col_letter_to_idx(letter):
    return openpyxl.utils.column_index_from_string(letter)


A = col_letter_to_idx("A")
B = col_letter_to_idx("B")
C = col_letter_to_idx("C")


def find_row_with_label(ws, label, col=B, start=1, end=None):
    end = end or ws.max_row
    label_l = label.lower()
    for r in range(start, end + 1):
        v = cell(ws, r, col)
        if isinstance(v, str) and v.lower() == label_l:
            return r
    return None


def find_row_contains(ws, needle, col=B, start=1, end=None):
    end = end or ws.max_row
    needle = needle.lower()
    for r in range(start, end + 1):
        v = cell(ws, r, col)
        if isinstance(v, str) and needle in v.lower():
            return r
    return None


def read_header_fields(ws):
    def field(label):
        r = find_row_with_label(ws, label, start=1, end=15)
        return cell(ws, r, C) if r else None

    return {
        "id": field("Use case ID"),
        "name": field("Use case Name"),
        "industry": field("Industry Verticle"),
        "brand_group": field("Brand & Group"),
        "nature": field("Nature of usecase"),
        "scale": field("Scale"),
    }


def read_node_descriptions(ws, start_row):
    nodes = []
    r = start_row
    while True:
        label = cell(ws, r, B)
        desc = cell(ws, r, C)
        if label is None:
            break
        nodes.append({"label": label, "description": desc})
        r += 1
    return nodes, r


def read_flow_table(ws, header_row, step_col):
    process_col = step_col + 1
    node_col = step_col + 2
    steps = []
    r = header_row + 1
    while True:
        step = cell(ws, r, step_col)
        if not isinstance(step, (int, float)):
            break
        steps.append({
            "step": int(step),
            "process": cell(ws, r, process_col),
            "node": cell(ws, r, node_col),
        })
        r += 1
    return steps


def read_kv_section(ws, start_row, stop_labels=(), stop_contains=()):
    items = []
    r = start_row
    blank_streak = 0
    while r <= ws.max_row:
        label = cell(ws, r, B)
        if label in stop_labels:
            break
        if isinstance(label, str) and any(s.lower() in label.lower() for s in stop_contains):
            break
        if label is None:
            blank_streak += 1
            if blank_streak >= 2:
                break
            r += 1
            continue
        blank_streak = 0
        items.append({"label": label, "value": cell(ws, r, C)})
        r += 1
    return items, r


def coerce_int(v):
    if isinstance(v, str):
        s = v.strip()
        if s.lstrip("-").isdigit():
            return int(s)
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def read_generic_table(ws, header_row, label_col=B, max_row=None, label_key="label", numeric_labels_only=True):
    headers = []
    c = label_col + 1
    while True:
        v = cell(ws, header_row, c)
        if v is None:
            break
        headers.append((c, str(v)))
        c += 1
    rows = []
    r = header_row + 1
    limit = min(max_row, ws.max_row) if max_row else ws.max_row
    blank_streak = 0
    while r <= limit:
        row_label = cell(ws, r, label_col)
        if row_label is None:
            blank_streak += 1
            if blank_streak >= 2:
                break
            r += 1
            continue
        blank_streak = 0
        row_label = coerce_int(row_label)
        if numeric_labels_only and not isinstance(row_label, (int, float)):
            r += 1
            continue
        entry = {label_key: row_label}
        for c, hname in headers:
            v = cell(ws, r, c)
            if v is not None:
                entry[hname] = v
        rows.append(entry)
        r += 1
    return headers, rows, r


def read_decision_block(ws, label_col, decision_no_row, max_row=None):
    decision_cols = []
    c = label_col + 1
    while True:
        v = cell(ws, decision_no_row, c)
        if v is None:
            if cell(ws, decision_no_row, c + 1) is None:
                break
        else:
            decision_cols.append(c)
        c += 1
        if c > ws.max_column:
            break

    def decision_no_value(dc):
        return coerce_int(cell(ws, decision_no_row, dc))

    decisions = [{"decision_no": decision_no_value(dc)} for dc in decision_cols]
    r = decision_no_row
    limit = min(max_row, ws.max_row) if max_row else ws.max_row
    blank_streak = 0
    while r <= limit:
        row_label = cell(ws, r, label_col)
        if row_label is None:
            blank_streak += 1
            if blank_streak >= 2:
                break
            r += 1
            continue
        blank_streak = 0
        if isinstance(row_label, str) and "decision no" in row_label.lower():
            r += 1
            continue
        for idx, dc in enumerate(decision_cols):
            val = cell(ws, r, dc)
            if val is not None:
                decisions[idx][str(row_label)] = val
        r += 1
    decisions = [d for d in decisions if len(d) > 1]
    return decisions, r


def nearest_title_above(ws, row, col, max_lookback=6):
    for r in range(row - 1, max(row - max_lookback, 0), -1):
        v = cell(ws, r, col)
        if v:
            return str(v), r
    return None, None


def compute_overall(score_rows):
    numeric_keys = ["Cost", "Resilience Gain", "Resilience gain", "Feasibility",
                     "Speed", "Speed of implementation", "Sustainability"]
    for row in score_rows:
        overall_key = next((k for k in row if k.lower().startswith("overall")), "Overall")
        if row.get(overall_key) in (None, ""):
            vals = [row[k] for k in numeric_keys if isinstance(row.get(k), (int, float))]
            if vals:
                row[overall_key] = round(sum(vals) / len(vals), 2)
                row["_overall_calculated"] = True
    return score_rows


def read_sources(ws):
    sources = []
    header_row = find_row_with_label(ws, "SOURCES", col=B)
    if header_row is None:
        return sources
    for r in range(header_row + 1, ws.max_row + 1):
        v = cell(ws, r, B)
        if v:
            sources.append(v)
    return sources


def find_all_decision_table_anchors(ws):
    raw = []
    for r in range(1, ws.max_row + 1):
        for c in range(B, ws.max_column + 1):
            v = cell(ws, r, c)
            if isinstance(v, str) and v.strip().lower() in ("decision no", "decision"):
                raw.append((r, c, v.strip().lower()))
    raw.sort()

    anchors = []
    i = 0
    while i < len(raw):
        row, col, kind = raw[i]
        title_lookup_row = row
        while (
            i + 1 < len(raw)
            and raw[i + 1][1] == col
            and raw[i + 1][0] == row + 1
            and kind == "decision"
            and raw[i + 1][2] == "decision"
        ):
            i += 1
            row = raw[i][0]
        anchors.append({"header_row": row, "col": col, "title_lookup_row": title_lookup_row})
        i += 1
    return anchors


def extract_case(ws):
    header = read_header_fields(ws)
    if not header["id"]:
        return None

    row_baseline = find_row_with_label(ws, "Baseline Operations (Normal Flow)")
    if row_baseline is None:
        return {**header, "_error": "missing 'Baseline Operations (Normal Flow)' section"}
    nodes, after_nodes_row = read_node_descriptions(ws, row_baseline + 1)

    flow_header_row = find_row_with_label(ws, "Step", col=B, start=after_nodes_row, end=after_nodes_row + 6)
    flow = read_flow_table(ws, flow_header_row, step_col=B) if flow_header_row else []
    after_flow_row = flow_header_row + len(flow) + 1 if flow_header_row else after_nodes_row

    row_kpi = find_row_with_label(ws, "Normal KPI Conditions", start=after_flow_row)
    kpis, after_kpi_row = ([], after_flow_row)
    if row_kpi:
        kpis, after_kpi_row = read_kv_section(
            ws, row_kpi + 2,
            stop_contains=("Disruption", "Improvement", "Integration", "Technology"),
        )

    DISRUPTION_ALLOWED_LABELS = (
        "trigger event",
        "root cause details",
        "affected nodes",
        "effect on supply chain",
    )

    disruption = []
    after_disruption_row = after_kpi_row
    row_disruption_details = find_row_with_label(ws, "Disruption details", start=after_kpi_row)
    if row_disruption_details:
        disruption, after_disruption_row = read_kv_section(
            ws, row_disruption_details + 1, stop_contains=("Improvement", "Decision")
        )
        disruption = [
            d for d in disruption
            if isinstance(d["label"], str) and d["label"].strip().lower() in DISRUPTION_ALLOWED_LABELS
        ]

    improvement = []
    after_improvement_row = after_disruption_row
    row_integration_details = find_row_with_label(
        ws, "Integration details", start=after_disruption_row
    )
    if row_integration_details:
        improvement, after_improvement_row = read_kv_section(
            ws, row_integration_details + 1, stop_contains=("Decision",)
        )
    disruption = [d for d in disruption if d["value"] is not None]
    improvement = [d for d in improvement if d["value"] is not None]

    sources_row = find_row_with_label(ws, "SOURCES", col=B)
    kpi_change_rows = []
    _scan_from = 1
    while True:
        r = find_row_contains(ws, "KPI Change Summary", start=_scan_from)
        if r is None:
            break
        kpi_change_rows.append(r)
        _scan_from = r + 1

    anchors = [a for a in find_all_decision_table_anchors(ws) if a["header_row"] >= after_improvement_row]

    decision_blocks_out = []
    impact_summary = []
    decision_scores = []
    for i, anchor in enumerate(anchors):
        row, col = anchor["header_row"], anchor["col"]
        next_anchor_row = anchors[i + 1]["title_lookup_row"] if i + 1 < len(anchors) else None
        candidates = [r for r in (next_anchor_row, sources_row, ws.max_row + 1) if r]
        candidates += [kr for kr in kpi_change_rows if kr > row]
        bound = min(candidates) - 1

        title, _ = nearest_title_above(ws, anchor["title_lookup_row"], col)
        title_l = (title or "").lower()
        if "impact summary" in title_l:
            _, rows, _ = read_generic_table(ws, row, label_col=col, max_row=bound, label_key="decision_no")
            rows = [r for r in rows if len(r) > 1]
            impact_summary.extend(rows)
        elif "score" in title_l:
            _, rows, _ = read_generic_table(ws, row, label_col=col, max_row=bound, label_key="decision_no")
            rows = [r for r in rows if len(r) > 1]
            decision_scores.extend(compute_overall(rows))
        else:
            decisions, _ = read_decision_block(ws, col, row, max_row=bound)
            decision_blocks_out.append({"source": title or "Decisions", "decisions": decisions})

    sources = read_sources(ws)

    return {
        **header,
        "normal_flow_nodes": nodes,
        "normal_flow_steps": flow,
        "kpis": kpis,
        "disruption": disruption,
        "improvement": improvement,
        "decision_blocks": decision_blocks_out,
        "decisions_impact_summary": impact_summary,
        "decision_scores": decision_scores,
        "sources": sources,
    }


def validate_case(case):
    issues = []

    required_header = ["id", "name", "industry", "brand_group", "nature", "scale"]
    missing_header = [f for f in required_header if not case.get(f)]
    if missing_header:
        issues.append(f"missing header fields: {', '.join(missing_header)}")

    nature = (case.get("nature") or "").strip().lower()
    if nature == "disruption":
        if not case.get("disruption"):
            issues.append("missing disruption details")
    elif nature == "improvement":
        if not case.get("improvement"):
            issues.append("missing improvement details")
    else:
        if not case.get("disruption") and not case.get("improvement"):
            issues.append("nature unclear and no disruption/improvement details found")

    if not case.get("kpis"):
        issues.append("missing baseline KPIs")

    decision_blocks = case.get("decision_blocks") or []
    all_decision_nos = set()
    for block in decision_blocks:
        for d in block.get("decisions", []):
            dn = d.get("decision_no")
            if dn is not None:
                all_decision_nos.add(dn)

    if not all_decision_nos:
        issues.append("no decisions found")
    else:
        impact_nos = {r.get("decision_no") for r in case.get("decisions_impact_summary") or []}
        missing_impact = sorted(all_decision_nos - impact_nos)
        if missing_impact:
            issues.append(f"decisions missing impact summary: {missing_impact}")

    return issues


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads/UpdatedTemplateNew.xlsx"
    out = sys.argv[2] if len(sys.argv) > 2 else "cases.json"

    wb = openpyxl.load_workbook(src, data_only=True)
    cases = []
    errors = []
    for name in wb.sheetnames:
        if any(s in name.lower() for s in SKIP_SHEET_SUBSTRINGS):
            continue
        ws = wb[name]
        try:
            case = extract_case(ws)
            if case:
                case["_sheet_name"] = name
                cases.append(case)
        except Exception as e:
            errors.append({"sheet": name, "error": str(e)})

    with open(out, "w") as f:
        json.dump({"cases": cases, "errors": errors}, f, indent=2, default=str)

    incomplete = []
    for case in cases:
        label = case.get("id") or case.get("_sheet_name")
        if case.get("_error"):
            incomplete.append((label, [case["_error"]]))
            continue
        issues = validate_case(case)
        if issues:
            incomplete.append((label, issues))

    complete_count = len(cases) - len(incomplete)

    print(f"\nExtracted {len(cases)} usecase(s) -> {out}")
    if errors:
        print(f"\n{len(errors)} sheet(s) failed extraction:")
        for e in errors:
            print(f"  {e['sheet']}: {e['error']}")

    print(f"\n{complete_count}/{len(cases)} usecases fully complete")
    if incomplete:
        print("Incomplete usecases:")
        for label, issues in incomplete:
            print(f"  {label}:")
            for issue in issues:
                print(f"    - {issue}")


if __name__ == "__main__":
    main()