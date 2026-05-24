"""
make_dashboard.py - Regenerate artifacts/alignment_dashboard.html from all
.final.json files in the artifacts/ directory.

Reads each .final.json, looks up its declared standards DB (CA-ELA.json or
CA-MATH.json), enriches every alignment with the standard's text/strand/grade
metadata, computes per-subject summary stats, and renders a single HTML file
with subject-aware coloring and per-edusperience tabs.

Usage:
    python3 tools/make_dashboard.py
    python3 tools/make_dashboard.py --out path/to/output.html
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
STANDARDS_ROOT = ROOT  # resolve relative paths from here


def load_records(db_path: Path) -> dict[str, dict]:
    """Load a standards DB and index records by code."""
    data = json.loads(db_path.read_text(encoding="utf-8"))
    records = data["records"] if isinstance(data, dict) and "records" in data else data
    return {r["code"]: r for r in records}


def enrich_alignment(a: dict, rec: dict | None, subject: str) -> dict:
    """Add display metadata to an alignment dict."""
    out = dict(a)
    if not rec:
        return out
    if subject == "ela":
        out["strand"] = rec.get("strand", "")
        out["strand_name"] = rec.get("strand_name", "")
        out["subgroup"] = rec.get("subgroup", "")
        out["grade"] = rec.get("grade") or rec.get("grade_band") or ""
        out["text"] = rec.get("text", "")
        out["is_anchor"] = bool(rec.get("is_anchor"))
    elif subject == "history":
        # Two flavors: analysis skill (HSS-K5.CST.1) vs content (K.1, 12E.3)
        if rec.get("is_skill"):
            out["badge"] = rec.get("skill_category_code", "HSS")
            out["badge_name"] = rec.get("skill_category", "")
            out["subgroup"] = rec.get("skill_category", "")
            out["grade"] = rec.get("grade_band") or ""
        else:
            ct = rec.get("course_title", "") or ""
            out["badge"] = "Econ" if ct == "Principles of Economics" else (rec.get("grade") or rec.get("grade_band") or "HSS")
            out["badge_name"] = ct
            out["subgroup"] = ct
            out["grade"] = rec.get("grade") or ""
        out["text"] = rec.get("text", "")
        out["is_skill"] = bool(rec.get("is_skill"))
        out["course_title"] = rec.get("course_title", "")
    elif subject == "science":
        # NGSS Performance Expectations: badge = DCI domain (PS/LS/ESS/ETS),
        # subgroup = topic name (e.g. "Motion and Stability: Forces and Interactions")
        out["badge"] = rec.get("domain", "NGSS")
        out["badge_name"] = rec.get("domain_name", "")
        out["topic"] = rec.get("topic", "")
        out["topic_name"] = rec.get("topic_name", "")
        out["subgroup"] = rec.get("topic_name", "")
        out["grade"] = rec.get("grade") or rec.get("grade_band") or ""
        out["text"] = rec.get("text", "") or rec.get("statement", "")
        out["statement"] = rec.get("statement", "")
        out["clarification"] = rec.get("clarification", "")
        out["assessment_boundary"] = rec.get("assessment_boundary", "")
        out["engineering"] = bool(rec.get("engineering"))
        out["modeling"] = bool(rec.get("modeling"))
        out["ca_addition"] = bool(rec.get("ca_addition"))
    else:  # math
        if rec.get("is_practice"):
            out["badge"] = "MP"
            out["badge_name"] = "Mathematical Practice"
            out["subgroup"] = ""
            out["grade"] = ""
        else:
            cat = rec.get("category") or rec.get("domain") or ""
            out["badge"] = cat
            out["badge_name"] = rec.get("category_name") or rec.get("domain_name") or ""
            out["subgroup"] = rec.get("cluster") or rec.get("domain_name") or ""
            out["grade"] = rec.get("grade") or rec.get("grade_band") or ""
        out["text"] = rec.get("text", "")
        out["modeling"] = bool(rec.get("modeling"))
        out["plus_standard"] = bool(rec.get("plus_standard"))
        out["ca_addition"] = bool(rec.get("ca_addition"))
    return out


def section_idx_from_path(path: str) -> int:
    """Extract numeric section index from 'sections[N].objectives[M]' path."""
    try:
        s = path.split("sections[", 1)[1]
        s = s.split("]", 1)[0]
        return int(s)
    except (IndexError, ValueError):
        return 0


def section_title_from_alignment(final_data: dict, section_idx: int) -> str:
    """The .final.json doesn't carry section titles; derive from
    edusperiences/<source> if available, else fall back to 'Section N'."""
    src = final_data.get("source_file")
    if not src:
        return ""
    src_path = ROOT / src
    if not src_path.exists():
        return ""
    try:
        edu = json.loads(src_path.read_text(encoding="utf-8"))
        sections = edu.get("sections", [])
        if 0 <= section_idx < len(sections):
            return sections[section_idx].get("title") or sections[section_idx].get("name") or ""
    except (json.JSONDecodeError, OSError):
        pass
    return ""


def load_source(source_rel: str) -> dict | None:
    """Return a minimal, human-readable subset of an edusperience source
    JSON: only the fields useful for browsing the original lesson.

    We deliberately drop IDs, timestamps, rubric-engine internals,
    resource attachments, and template metadata. Description fields are
    preserved as-is (they're typically HTML from the source CMS) and are
    rendered with innerHTML in the dashboard, so this assumes the source
    files are trusted (your own data)."""
    if not source_rel:
        return None
    src_path = ROOT / source_rel
    if not src_path.exists():
        return None
    try:
        edu = json.loads(src_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    out_sections = []
    for sec in edu.get("sections", []) or []:
        out_objs = []
        for obj in sec.get("objectives", []) or []:
            out_objs.append({
                "title": obj.get("title", "") or "",
                "description": obj.get("description", "") or "",
                "evaluation_type": obj.get("evaluation_type", "") or "",
                "points": obj.get("points"),
            })
        out_sections.append({
            "title": sec.get("title", "") or "",
            "description": sec.get("description", "") or "",
            "objectives": out_objs,
        })
    return {
        "path": source_rel,
        "title": edu.get("title", "") or "",
        "description": edu.get("description", "") or "",
        "sections": out_sections,
    }


def process_final(final_path: Path) -> dict:
    """Load a .final.json, enrich its alignments, and return a dashboard
    edusperience record."""
    data = json.loads(final_path.read_text(encoding="utf-8"))
    subject = data.get("subject", "ela")
    db_rel = data.get("standards_db", "categorized-standards/California/CA-ELA.json")
    db_path = STANDARDS_ROOT / db_rel
    records = load_records(db_path)

    enriched_objs = []
    n_aligned = 0
    code_counter: Counter = Counter()
    conf_counter: Counter = Counter()
    distinct_codes: set[str] = set()

    for obj in data["objectives"]:
        sec_idx = section_idx_from_path(obj.get("path", ""))
        sec_title = section_title_from_alignment(data, sec_idx)
        alignments = obj.get("alignments", []) or []
        enriched = [enrich_alignment(a, records.get(a["code"]), subject) for a in alignments]
        if alignments:
            n_aligned += 1
            for a in alignments:
                code_counter[a["code"]] += 1
                conf_counter[a.get("confidence", "")] += 1
                distinct_codes.add(a["code"])
        enriched_objs.append({
            "path": obj.get("path", ""),
            "section_idx": sec_idx,
            "section_title": sec_title or f"Section {sec_idx + 1}",
            "title": obj.get("title", ""),
            "description": obj.get("description", ""),
            "alignments": enriched,
            "note": obj.get("note", ""),
        })

    slug = final_path.stem.replace(".final", "")
    return {
        "slug": slug,
        "title": data.get("edusperience_title", slug),
        "subject": subject,
        "notes": data.get("notes", ""),
        "inferred_grade_bands": data.get("inferred_grade_bands", []),
        "source_file": data.get("source_file", ""),
        "source": load_source(data.get("source_file", "")),
        "objectives": enriched_objs,
        "n_total": len(enriched_objs),
        "n_aligned": n_aligned,
        "code_counter": dict(code_counter),
        "conf_counter": dict(conf_counter),
        "distinct_codes": sorted(distinct_codes),
    }


def build_summary(edus: list[dict]) -> dict:
    total = sum(e["n_total"] for e in edus)
    aligned = sum(e["n_aligned"] for e in edus)
    code_counter: Counter = Counter()
    conf_counter: Counter = Counter()
    for e in edus:
        for c, n in e["code_counter"].items():
            code_counter[c] += n
        for c, n in e["conf_counter"].items():
            conf_counter[c] += n
    total_assignments = sum(code_counter.values())
    distinct = len(code_counter)
    pct = round(100 * aligned / total, 1) if total else 0.0
    by_subject: Counter = Counter(e["subject"] for e in edus)
    return {
        "total_objectives": total,
        "aligned_objectives": aligned,
        "pct_aligned": pct,
        "total_code_assignments": total_assignments,
        "distinct_codes": distinct,
        "confidence_mix": {
            "high": conf_counter.get("high", 0),
            "medium": conf_counter.get("medium", 0),
            "low": conf_counter.get("low", 0),
        },
        "top_codes": code_counter.most_common(15),
        "by_subject": dict(by_subject),
    }


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Standards Alignment Dashboard</title>
<style>
  :root {
    --bg: #f7f8fa; --panel: #ffffff; --ink: #1c1f24; --mute: #6b7280;
    --line: #e5e7eb; --accent: #2854c5; --accent-soft: #eaf0fd;
    --hi: #0e7a3e; --hi-bg: #e4f5ea; --med: #a86e00; --med-bg: #fcf0d7;
    --lo: #9b3838; --lo-bg: #fbe4e4; --chip: #eef1f6; --chip-ink: #384150;
  }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: var(--ink); background: var(--bg); font-size: 14px; line-height: 1.45; }
  header { background: var(--panel); border-bottom: 1px solid var(--line); padding: 20px 32px; }
  header h1 { margin: 0 0 4px 0; font-size: 20px; font-weight: 600; }
  header .sub { color: var(--mute); font-size: 13px; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 24px 32px 64px; }
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 20px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
          padding: 14px 16px; }
  .card .label { color: var(--mute); font-size: 11px; text-transform: uppercase;
                 letter-spacing: 0.06em; font-weight: 600; }
  .card .value { font-size: 28px; font-weight: 700; line-height: 1.1; margin-top: 4px; }
  .card .sub { color: var(--mute); font-size: 12px; margin-top: 4px; }
  .conf-mix { display: flex; height: 6px; border-radius: 3px; overflow: hidden;
              margin-top: 8px; background: var(--line); }
  .seg { height: 100%; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
           padding: 18px 20px; margin-bottom: 16px; }
  .panel h2 { margin: 0 0 4px 0; font-size: 17px; font-weight: 600; }
  .panel h3 { margin: 18px 0 8px 0; font-size: 13px; font-weight: 600;
              text-transform: uppercase; letter-spacing: 0.05em; color: var(--mute); }
  .pipeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
  .step { background: #fafbfc; border: 1px solid var(--line); border-radius: 6px;
          padding: 12px 14px; }
  .step .n { font-size: 10px; color: var(--accent); font-weight: 700; letter-spacing: 0.08em; }
  .step .t { font-weight: 600; margin: 2px 0 6px 0; font-size: 13px; }
  .step .d { color: var(--mute); font-size: 12px; }
  .bars { display: flex; flex-direction: column; gap: 4px; }
  .bar-row { display: grid; grid-template-columns: 110px 1fr 32px;
             align-items: center; gap: 10px; }
  .bar-row .code { font-family: "SF Mono", Menlo, Consolas, monospace;
                   font-size: 12px; font-weight: 600; }
  .bar-row .trk { background: var(--line); border-radius: 3px; height: 10px; overflow: hidden; }
  .bar-row .fill { height: 100%; }
  .bar-row .n { color: var(--mute); font-size: 12px; text-align: right; }
  .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }
  .tab { padding: 8px 14px; background: var(--panel); border: 1px solid var(--line);
         border-radius: 6px; font-size: 13px; cursor: pointer; color: var(--ink);
         display: inline-flex; align-items: center; gap: 6px; }
  .tab.active { background: var(--accent); color: white; border-color: var(--accent); }
  .tab .subj-pill { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
                    padding: 2px 6px; border-radius: 8px; background: rgba(0,0,0,0.08);
                    color: inherit; opacity: 0.8; }
  .tab.active .subj-pill { background: rgba(255,255,255,0.22); }
  .controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
              margin-bottom: 12px; }
  .controls input[type="text"] { flex: 1; min-width: 240px; padding: 8px 12px;
                                 border: 1px solid var(--line); border-radius: 6px;
                                 font-size: 13px; background: var(--panel); }
  .chip-filter { font-size: 12px; color: var(--mute); display: inline-flex;
                 align-items: center; gap: 6px; }
  .section-hdr { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
                 color: var(--mute); font-weight: 600; margin: 16px 0 6px 0; }
  .obj { display: grid; grid-template-columns: 360px 1fr; gap: 18px;
         padding: 12px 0; border-top: 1px solid var(--line); }
  .obj:first-of-type { border-top: 0; }
  .qtitle { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .qdesc { color: var(--mute); font-size: 12px; }
  .qpath { color: var(--mute); font-size: 11px; font-family: "SF Mono", Menlo, monospace;
           margin-top: 6px; }
  .codes { display: flex; flex-direction: column; gap: 10px; }
  .code-chip { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px;
               background: white; }
  .code-chip .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                    margin-bottom: 6px; }
  .code-chip .code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 13px;
                     font-weight: 600; padding: 3px 8px; border-radius: 4px;
                     background: var(--chip); color: var(--chip-ink); }
  .code-chip .badge { font-size: 10px; text-transform: uppercase; font-weight: 600;
                      padding: 2px 8px; border-radius: 10px; letter-spacing: 0.04em; }
  .badge.high { color: var(--hi); background: var(--hi-bg); }
  .badge.medium { color: var(--med); background: var(--med-bg); }
  .badge.low { color: var(--lo); background: var(--lo-bg); }
  .badge.strand, .badge.category { color: white; font-weight: 500; }
  .code-chip .grade { font-size: 11px; color: var(--mute); }
  .code-chip .db-group { font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
                        color: #4b5563; background: #eef1f6;
                        padding: 2px 6px; border-radius: 4px;
                        font-family: "SF Mono", Menlo, Consolas, monospace; }
  .code-chip .subgroup { font-size: 11px; color: var(--mute); font-style: italic; }
  .code-chip .star { font-size: 11px; color: var(--accent); font-weight: 700; }
  .code-chip .std-text { font-size: 12px; color: #374151; padding: 6px 8px;
                         margin-top: 6px; background: #fafbfc; border-radius: 4px;
                         border-left: 2px solid var(--line); }
  .code-chip .rationale { font-size: 12px; color: var(--ink); margin-top: 6px;
                          padding-top: 6px; border-top: 1px dashed var(--line); }
  .code-chip .rationale-label { font-size: 10px; text-transform: uppercase;
                                color: var(--mute); font-weight: 600; }
  .no-alignment { color: var(--mute); font-style: italic; font-size: 13px;
                  background: #fafbfc; padding: 10px 12px; border-radius: 6px;
                  border: 1px dashed var(--line); }
  .edu-meta { color: var(--mute); font-size: 12px; margin-top: 2px; }
  .src-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
             margin-top: 10px; padding: 8px 12px; background: #fafbfc;
             border: 1px solid var(--line); border-radius: 6px;
             font-size: 12px; color: var(--mute); }
  .src-bar .src-path { font-family: "SF Mono", Menlo, Consolas, monospace;
                       color: var(--ink); font-size: 12px; }
  .src-bar button { font-size: 12px; padding: 4px 10px; background: var(--panel);
                    border: 1px solid var(--line); border-radius: 4px;
                    cursor: pointer; color: var(--ink); }
  .src-bar button:hover { background: var(--accent-soft); border-color: var(--accent); }
  .src-bar button.active { background: var(--accent); color: white; border-color: var(--accent); }
  .src-bar .src-toggle { display: inline-flex; gap: 4px; margin-left: auto; }
  .src-bar .src-missing { color: var(--lo); font-style: italic; }
  .src-panel { margin-top: 10px; padding: 14px 16px; background: #fafbfc;
               border: 1px solid var(--line); border-radius: 6px; }
  .src-panel h3 { margin: 0 0 6px 0; font-size: 16px; font-weight: 600;
                  color: var(--ink); text-transform: none; letter-spacing: normal; }
  .src-panel .src-desc { color: #374151; font-size: 13px; line-height: 1.55;
                         margin-bottom: 12px; }
  .src-panel .src-desc p { margin: 0 0 6px 0; }
  .src-panel .src-desc:last-child { margin-bottom: 0; }
  .src-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
  .src-section h4 { margin: 0 0 4px 0; font-size: 13px; font-weight: 600;
                    color: var(--ink); text-transform: uppercase;
                    letter-spacing: 0.04em; }
  .src-section .src-sec-desc { color: var(--mute); font-size: 12px;
                               margin-bottom: 8px; }
  .src-objs { list-style: none; padding: 0; margin: 0; display: flex;
              flex-direction: column; gap: 8px; }
  .src-obj { padding: 8px 10px; background: var(--panel); border: 1px solid var(--line);
             border-radius: 4px; transition: background 0.4s ease; }
  .src-obj.flash { background: var(--accent-soft); border-color: var(--accent); }
  .src-obj .src-obj-title { font-weight: 600; font-size: 13px; }
  .src-obj .src-obj-desc { color: #374151; font-size: 12px; margin-top: 4px; }
  .src-obj .src-obj-meta { color: var(--mute); font-size: 11px; margin-top: 4px;
                           font-family: "SF Mono", Menlo, Consolas, monospace; }
  .src-raw { background: #1c1f24; color: #e5e7eb; padding: 12px;
             border-radius: 4px; overflow-x: auto; font-size: 11px;
             line-height: 1.5; max-height: 60vh; }
  .src-raw pre { margin: 0; font-family: "SF Mono", Menlo, Consolas, monospace; }
  .view-source-link { font-size: 11px; color: var(--accent); cursor: pointer;
                      margin-top: 6px; display: inline-block; text-decoration: none; }
  .view-source-link:hover { text-decoration: underline; }
  @media (max-width: 800px) {
    .summary { grid-template-columns: repeat(2, 1fr); }
    .obj { grid-template-columns: 1fr; }
    .pipeline { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<header>
  <h1>Standards Alignment Dashboard</h1>
  <div class="sub">__SUBTITLE__</div>
</header>
<div class="wrap">

  <div class="summary" id="summary"></div>

  <div class="panel">
    <h2>Pipeline</h2>
    <div class="pipeline">
      <div class="step"><div class="n">STAGE 1</div><div class="t">TF-IDF Shortlist</div><div class="d">CA-ELA: 1,078. CA-MATH: 519. CA-HISTORY: 642. CA-NGSS: 208. 1-2 ngrams + sublinear TF, top-15 candidates per objective by cosine similarity.</div></div>
      <div class="step"><div class="n">STAGE 2</div><div class="t">Heuristic Rerank</div><div class="d">Subject auto-detection. Grade-band inference and keyword-to-strand/domain boost rules. Hard-skip for purely metacognitive objectives.</div></div>
      <div class="step"><div class="n">STAGE 3</div><div class="t">LLM Curation</div><div class="d">Claude reads shortlist+rerank and commits codes per objective with confidence and rationale.</div></div>
    </div>
    <h3>Top codes (across all curated edusperiences)</h3>
    <div class="bars" id="topcodes"></div>
  </div>

  <div class="tabs" id="tabs"></div>
  <div class="controls">
    <input id="q" type="text" placeholder="Filter by objective title, description, code, or rationale...">
    <label class="chip-filter"><input type="checkbox" id="onlyAligned"> Only show aligned objectives</label>
    <label class="chip-filter"><input type="checkbox" id="showStdText" checked> Show standard text</label>
  </div>
  <div id="content"></div>
</div>

<script>
const DATA = __DATA__;

const STRAND_COLOR = {
  // ELA strands
  W: '#2854c5', RL: '#7a31b5', RI: '#56429a', L: '#148a7a',
  SL: '#b26b00', RF: '#4a5d23', RH: '#365d7a', RST: '#365d7a', WHST: '#2854c5',
  // Math conceptual categories (HS) and K-8 domains commonly seen
  N: '#2854c5', A: '#7a31b5', F: '#148a7a', G: '#b26b00', S: '#9b3838', MP: '#56429a',
  RP: '#a86e00', NS: '#365d7a', EE: '#7a31b5', SP: '#9b3838', NBT: '#0e7a3e',
  OA: '#2854c5', MD: '#148a7a', NF: '#56429a',
  // History analysis-skill categories
  CST: '#3e6dd2', REP: '#a86e00', HI: '#7a31b5',
  // History grade-12 Economics + content shorthands
  Econ: '#0a6e6e', HSS: '#365d7a',
  // NGSS DCI domains
  PS: '#2854c5', LS: '#0e7a3e', ESS: '#a86e00', ETS: '#56429a', NGSS: '#365d7a',
};
function strandColor(code, badge) {
  if (badge && STRAND_COLOR[badge]) return STRAND_COLOR[badge];
  if (!code) return '#4b5563';
  if (code.startsWith('CCRA')) return '#4b5563';
  // Try first dotted token, then first hyphenated category for HS math (e.g. A-SSE.A.1)
  const dot = code.split('.')[0];
  if (STRAND_COLOR[dot]) return STRAND_COLOR[dot];
  const cat = dot.split('-')[0];
  return STRAND_COLOR[cat] || '#4b5563';
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderSummary() {
  const s = DATA.summary;
  const subjectsTxt = Object.entries(s.by_subject||{}).map(([k,v]) => `${v} ${k}`).join(' \u00b7 ');
  const cards = [
    {label: 'Edusperiences', value: DATA.edusperiences.length, sub: subjectsTxt || 'curated'},
    {label: 'Objectives', value: s.total_objectives, sub: `${s.aligned_objectives} aligned (${s.pct_aligned}%)`},
    {label: 'Code assignments', value: s.total_code_assignments, sub: `${s.distinct_codes} distinct codes`},
    {label: 'High confidence', value: s.confidence_mix.high, sub: `${s.confidence_mix.medium} med \u00b7 ${s.confidence_mix.low} low`},
    {label: 'Standards DBs', value: 4, sub: 'CA-ELA + CA-MATH + CA-HISTORY + CA-NGSS'},
  ];
  const wrap = document.getElementById('summary');
  for (const c of cards) {
    const d = el('div','card');
    d.appendChild(el('div','label', esc(c.label)));
    d.appendChild(el('div','value', esc(c.value)));
    d.appendChild(el('div','sub', esc(c.sub)));
    wrap.appendChild(d);
  }
  const mix = s.confidence_mix;
  const tot = mix.high+mix.medium+mix.low || 1;
  const cmix = el('div','conf-mix');
  const segs = [['hi', mix.high], ['med', mix.medium], ['lo', mix.low]];
  for (const [v, n] of segs) {
    const seg = el('div','seg', '');
    seg.style.cssText = `width:${100*n/tot}%; background: var(--${v})`;
    cmix.appendChild(seg);
  }
  wrap.children[3].appendChild(cmix);
}

function renderTopCodes() {
  const wrap = document.getElementById('topcodes');
  if (!DATA.summary.top_codes.length) return;
  const max = DATA.summary.top_codes[0][1];
  for (const [code, n] of DATA.summary.top_codes) {
    const row = el('div','bar-row');
    const codeEl = el('span','code');
    codeEl.textContent = code;
    codeEl.style.color = strandColor(code, null);
    row.appendChild(codeEl);
    const trk = el('div','trk');
    const fill = el('div','fill');
    fill.style.width = (100*n/max) + '%';
    fill.style.background = strandColor(code, null);
    trk.appendChild(fill);
    row.appendChild(trk);
    row.appendChild(el('span','n', n));
    wrap.appendChild(row);
  }
}

let activeTab = 0;
function renderTabs() {
  const wrap = document.getElementById('tabs');
  wrap.innerHTML = '';
  DATA.edusperiences.forEach((e, i) => {
    const t = el('button','tab' + (i===activeTab?' active':''));
    t.appendChild(document.createTextNode(e.title));
    const pill = el('span','subj-pill', esc(e.subject || 'ela'));
    t.appendChild(pill);
    t.onclick = () => { activeTab = i; renderTabs(); renderContent(); };
    wrap.appendChild(t);
  });
  const t = el('button','tab' + (activeTab===-1?' active':''));
  t.textContent = 'All';
  t.onclick = () => { activeTab = -1; renderTabs(); renderContent(); };
  wrap.appendChild(t);
}

function renderChip(a) {
  const chip = el('div','code-chip');
  const top = el('div','top');
  const codeEl = el('span','code', esc(a.code));
  codeEl.style.color = strandColor(a.code, a.badge || a.strand);
  top.appendChild(codeEl);
  const confBadge = el('span','badge '+a.confidence, esc(a.confidence));
  top.appendChild(confBadge);
  const badgeText = a.badge || a.strand;
  if (badgeText) {
    const cls = a.badge ? 'badge category' : 'badge strand';
    const sb = el('span', cls, esc(badgeText));
    sb.style.background = strandColor(a.code, badgeText);
    top.appendChild(sb);
  }
  // Standards-group pill (CA-ELA / CA-MATH / CA-HISTORY / CA-NGSS).
  if (a.standards_group) {
    const sgPill = el('span','db-group', esc(a.standards_group));
    top.appendChild(sgPill);
  }
  if (a.grade) top.appendChild(el('span','grade', 'Grade ' + esc(a.grade)));
  if (a.subgroup) top.appendChild(el('span','subgroup', '\u00b7 ' + esc(a.subgroup)));
  if (a.modeling) top.appendChild(el('span','star', '\u2605 modeling'));
  if (a.plus_standard) top.appendChild(el('span','star', '+ standard'));
  chip.appendChild(top);
  if (document.getElementById('showStdText').checked && a.text) {
    chip.appendChild(el('div','std-text', esc(a.text)));
  }
  const r = el('div','rationale');
  r.appendChild(el('div','rationale-label','Why this maps'));
  r.appendChild(document.createTextNode(a.rationale || ''));
  chip.appendChild(r);
  return chip;
}

// Per-edusperience source-panel state, keyed by slug.
// { open: bool, view: 'rendered' | 'raw' }
const SRC_STATE = {};
function srcState(slug) {
  if (!SRC_STATE[slug]) SRC_STATE[slug] = { open: false, view: 'rendered' };
  return SRC_STATE[slug];
}

function parseObjectivePath(path) {
  // 'sections[2].objectives[1]' -> { sec: 2, obj: 1 }
  const m = /sections\[(\d+)\]\.objectives\[(\d+)\]/.exec(path || '');
  if (!m) return null;
  return { sec: parseInt(m[1], 10), obj: parseInt(m[2], 10) };
}

function buildSourceBar(e) {
  const bar = el('div','src-bar');
  if (!e.source) {
    bar.appendChild(el('span','src-missing',
      `Source file not embedded${e.source_file ? ' ('+esc(e.source_file)+' missing or unreadable)' : ''}.`));
    return bar;
  }
  bar.appendChild(document.createTextNode('Source:'));
  bar.appendChild(el('span','src-path', esc(e.source.path || e.source_file || '')));
  const st = srcState(e.slug);
  const toggle = el('div','src-toggle');
  const btnView = el('button', st.open ? 'active' : '');
  btnView.textContent = st.open ? 'Hide source' : 'View source';
  btnView.onclick = () => { st.open = !st.open; renderContent(); };
  toggle.appendChild(btnView);
  if (st.open) {
    const btnRendered = el('button', st.view === 'rendered' ? 'active' : '');
    btnRendered.textContent = 'Rendered';
    btnRendered.onclick = () => { st.view = 'rendered'; renderContent(); };
    toggle.appendChild(btnRendered);
    const btnRaw = el('button', st.view === 'raw' ? 'active' : '');
    btnRaw.textContent = 'Raw JSON';
    btnRaw.onclick = () => { st.view = 'raw'; renderContent(); };
    toggle.appendChild(btnRaw);
  }
  bar.appendChild(toggle);
  return bar;
}

function buildSourcePanel(e) {
  const st = srcState(e.slug);
  if (!st.open || !e.source) return null;
  const panel = el('div','src-panel');
  panel.id = `src-${e.slug}`;
  if (st.view === 'raw') {
    const wrap = el('div','src-raw');
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(e.source, null, 2);
    wrap.appendChild(pre);
    panel.appendChild(wrap);
    return panel;
  }
  // Rendered view. Source `description` and section/objective `description`
  // values are HTML from the source CMS; render with innerHTML.
  if (e.source.title) {
    panel.appendChild(el('h3', null, esc(e.source.title)));
  }
  if (e.source.description) {
    const desc = el('div','src-desc');
    desc.innerHTML = e.source.description;
    panel.appendChild(desc);
  }
  (e.source.sections || []).forEach((sec, i) => {
    const secEl = el('div','src-section');
    secEl.id = `src-${e.slug}-sec-${i}`;
    secEl.appendChild(el('h4', null, `Section ${i+1}: ${esc(sec.title || '')}`));
    if (sec.description) {
      const sd = el('div','src-sec-desc');
      sd.innerHTML = sec.description;
      secEl.appendChild(sd);
    }
    const list = document.createElement('ul');
    list.className = 'src-objs';
    (sec.objectives || []).forEach((obj, j) => {
      const li = document.createElement('li');
      li.className = 'src-obj';
      li.id = `src-${e.slug}-${i}-${j}`;
      li.appendChild(el('div','src-obj-title', esc(obj.title || '')));
      if (obj.description) {
        const od = el('div','src-obj-desc');
        od.innerHTML = obj.description;
        li.appendChild(od);
      }
      const metaParts = [];
      if (obj.evaluation_type) metaParts.push(esc(obj.evaluation_type));
      if (obj.points != null) metaParts.push(`${obj.points} pt`);
      metaParts.push(`sections[${i}].objectives[${j}]`);
      li.appendChild(el('div','src-obj-meta', metaParts.join(' \u00b7 ')));
      list.appendChild(li);
    });
    secEl.appendChild(list);
    panel.appendChild(secEl);
  });
  return panel;
}

function jumpToSource(slug, secIdx, objIdx) {
  const st = srcState(slug);
  const wasOpenInRendered = st.open && st.view === 'rendered';
  st.open = true;
  st.view = 'rendered';
  if (!wasOpenInRendered) renderContent();
  // After re-render the DOM has the new IDs; defer to next frame.
  requestAnimationFrame(() => {
    const target = document.getElementById(`src-${slug}-${secIdx}-${objIdx}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('flash');
    void target.offsetWidth; // restart animation
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 1500);
  });
}

function renderContent() {
  const q = document.getElementById('q').value.toLowerCase().trim();
  const onlyAligned = document.getElementById('onlyAligned').checked;
  const root = document.getElementById('content');
  root.innerHTML = '';
  const edus = activeTab === -1 ? DATA.edusperiences : [DATA.edusperiences[activeTab]];
  for (const e of edus) {
    const panel = el('div','panel');
    const h = el('h2'); h.textContent = e.title;
    panel.appendChild(h);
    const meta = el('div','edu-meta');
    meta.textContent = `${e.subject||'ela'} \u00b7 ${e.n_aligned}/${e.n_total} objectives aligned \u00b7 grade band ${(e.inferred_grade_bands||[]).join(', ')||'n/a'}`;
    panel.appendChild(meta);
    if (e.notes) {
      const nt = el('div','edu-meta', esc(e.notes));
      nt.style.marginTop = '6px';
      panel.appendChild(nt);
    }
    panel.appendChild(buildSourceBar(e));
    const srcPanel = buildSourcePanel(e);
    if (srcPanel) panel.appendChild(srcPanel);
    let currentSec = -1;
    for (const o of e.objectives) {
      const matchQ = !q ||
        o.title.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        (o.section_title||'').toLowerCase().includes(q) ||
        o.alignments.some(a => a.code.toLowerCase().includes(q) || (a.rationale||'').toLowerCase().includes(q) || (a.text||'').toLowerCase().includes(q));
      if (!matchQ) continue;
      if (onlyAligned && o.alignments.length === 0) continue;
      if (o.section_idx !== currentSec) {
        currentSec = o.section_idx;
        const sh = el('div','section-hdr');
        sh.textContent = `Section ${o.section_idx+1}: ${o.section_title}`;
        panel.appendChild(sh);
      }
      const row = el('div','obj');
      const left = el('div','');
      left.appendChild(el('div','qtitle', esc(o.title)));
      left.appendChild(el('div','qdesc', esc(o.description)));
      left.appendChild(el('div','qpath', esc(o.path)));
      if (o.note) {
        const nt = el('div','edu-meta', esc('Note: ' + o.note));
        nt.style.marginTop = '6px';
        left.appendChild(nt);
      }
      const parsed = parseObjectivePath(o.path);
      if (e.source && parsed) {
        const link = el('a','view-source-link');
        link.href = '#';
        link.textContent = 'View original \u2192';
        link.onclick = (ev) => { ev.preventDefault(); jumpToSource(e.slug, parsed.sec, parsed.obj); };
        left.appendChild(link);
      }
      row.appendChild(left);
      const right = el('div','codes');
      if (o.alignments.length === 0) {
        const fallback = e.subject === 'math'    ? 'No math standard applies.'
                       : e.subject === 'history' ? 'No history standard applies.'
                       : e.subject === 'science' ? 'No NGSS standard applies.'
                       : 'No ELA standard applies.';
        const n = el('div','no-alignment', esc(o.note || fallback));
        right.appendChild(n);
      } else {
        for (const a of o.alignments) right.appendChild(renderChip(a));
      }
      row.appendChild(right);
      panel.appendChild(row);
    }
    root.appendChild(panel);
  }
}

renderSummary();
renderTopCodes();
renderTabs();
renderContent();
document.getElementById('q').addEventListener('input', renderContent);
document.getElementById('onlyAligned').addEventListener('change', renderContent);
document.getElementById('showStdText').addEventListener('change', renderContent);
</script>
</body>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=ARTIFACTS / "alignment_dashboard.html")
    ap.add_argument("--artifacts-dir", type=Path, default=ARTIFACTS)
    args = ap.parse_args(argv)

    final_files = sorted(args.artifacts_dir.glob("*.final.json"))
    if not final_files:
        print(f"No .final.json files found in {args.artifacts_dir}")
        return 1

    edus = [process_final(fp) for fp in final_files]
    # Sort: ELA first, then math, then history, alphabetical within
    SUBJECT_ORDER = {"ela": 0, "math": 1, "history": 2, "science": 3}
    edus.sort(key=lambda e: (SUBJECT_ORDER.get(e["subject"], 99), e["title"].lower()))

    summary = build_summary(edus)
    payload = {"edusperiences": edus, "summary": summary}

    n_ela = summary["by_subject"].get("ela", 0)
    n_math = summary["by_subject"].get("math", 0)
    n_hist = summary["by_subject"].get("history", 0)
    n_sci = summary["by_subject"].get("science", 0)
    parts = []
    if n_ela:  parts.append(f"{n_ela} ELA")
    if n_math: parts.append(f"{n_math} Math")
    if n_hist: parts.append(f"{n_hist} History")
    if n_sci:  parts.append(f"{n_sci} Science")
    n_total = n_ela + n_math + n_hist + n_sci
    subtitle = (
        f"California - {' + '.join(parts)} edusperience"
        f"{'s' if n_total != 1 else ''}. "
        f"TF-IDF shortlist -> heuristic rerank -> LLM curation."
    )

    payload_json = json.dumps(payload, ensure_ascii=False)
    payload_json = payload_json.replace("</", "<\\/")
    html = HTML_TEMPLATE.replace("__SUBTITLE__", subtitle)
    html = html.replace("__DATA__", payload_json)
    args.out.write_text(html, encoding="utf-8")
    print(f"Wrote {args.out}")
    print(f"  edusperiences: {len(edus)} ({n_ela} ELA, {n_math} math, {n_hist} history, {n_sci} science)")
    print(f"  total objectives: {summary['total_objectives']}, aligned {summary['aligned_objectives']} ({summary['pct_aligned']}%)")
    print(f"  code assignments: {summary['total_code_assignments']}, distinct {summary['distinct_codes']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
