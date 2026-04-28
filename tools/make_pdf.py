"""
Generate a per-edusperience alignment PDF from a .final.json curated
alignment file.

For each objective in the edusperience, the PDF shows:
  - Objective title and description
  - Section it belongs to
  - One or more aligned standards (code, strand, grade, subgroup)
  - Confidence (numeric 0-100 + qualitative label)
  - The full standard text from CA-ELA.json
  - A "why this maps" rationale

Logistical/non-ELA objectives are included with an explanatory note.

Usage:
  python3 tools/make_pdf.py artifacts/romeo_essay.final.json
  python3 tools/make_pdf.py --all
"""
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, HRFlowable,
)

ROOT = Path(__file__).resolve().parent.parent
ART_DIR = ROOT / "artifacts"
EDU_DIR = ROOT / "edusperiences"

# Standards DBs are loaded lazily based on the final.json's `standards_db`
# field, so the same script handles both ELA and math (or any future
# subject) without needing to know the subject up-front.
_STANDARDS_CACHE: dict[str, dict] = {}

def load_standards(rel_path: str) -> dict:
    """Return {code: record} for the standards file referenced by a final.json."""
    if rel_path in _STANDARDS_CACHE:
        return _STANDARDS_CACHE[rel_path]
    full = ROOT / rel_path
    arr = json.load(open(full))
    by_code = {r["code"]: r for r in arr}
    _STANDARDS_CACHE[rel_path] = by_code
    return by_code

# ---- styling ----------------------------------------------------- #
INK = colors.HexColor("#1c1f24")
MUTE = colors.HexColor("#6b7280")
LINE = colors.HexColor("#d1d5db")
ACCENT = colors.HexColor("#2854c5")
ACCENT_SOFT = colors.HexColor("#eaf0fd")
PANEL = colors.HexColor("#fafbfc")

CONF_HIGH_INK = colors.HexColor("#0e7a3e")
CONF_HIGH_BG = colors.HexColor("#e4f5ea")
CONF_MED_INK = colors.HexColor("#a86e00")
CONF_MED_BG = colors.HexColor("#fcf0d7")
CONF_LOW_INK = colors.HexColor("#9b3838")
CONF_LOW_BG = colors.HexColor("#fbe4e4")

STRAND_COLOR = {
    # ELA strands
    "W": colors.HexColor("#2854c5"),
    "RL": colors.HexColor("#7a31b5"),
    "RI": colors.HexColor("#56429a"),
    "L": colors.HexColor("#148a7a"),
    "SL": colors.HexColor("#b26b00"),
    "RF": colors.HexColor("#4a5d23"),
    "RH": colors.HexColor("#365d7a"),
    "RST": colors.HexColor("#365d7a"),
    "WHST": colors.HexColor("#2854c5"),
    # Math conceptual categories (9-12)
    "N": colors.HexColor("#0a6e6e"),    # Number and Quantity
    "A": colors.HexColor("#2854c5"),    # Algebra
    "F": colors.HexColor("#7a31b5"),    # Functions
    "G": colors.HexColor("#b26b00"),    # Geometry
    "S": colors.HexColor("#0e7a3e"),    # Statistics and Probability
    "MP": colors.HexColor("#4b5563"),   # Mathematical Practices
    # History analysis-skill categories
    "CST": colors.HexColor("#3e6dd2"),  # Chronological & Spatial Thinking
    "REP": colors.HexColor("#a86e00"),  # Research, Evidence, & POV
    "HI":  colors.HexColor("#7a31b5"),  # Historical Interpretation
}

# History grade-band colors (used for content standards).
HISTORY_BAND_COLOR = {
    "K-5":  colors.HexColor("#0e7a3e"),
    "6-8":  colors.HexColor("#b26b00"),
    "9-12": colors.HexColor("#2854c5"),
}
# Grade 12 Economics gets its own tint to distinguish from American Democracy.
HISTORY_ECON_COLOR = colors.HexColor("#0a6e6e")
# K-8 math grade prefixes — pick a color based on a deterministic hash
_K8_COLORS = [
    colors.HexColor("#2854c5"), colors.HexColor("#7a31b5"),
    colors.HexColor("#148a7a"), colors.HexColor("#b26b00"),
    colors.HexColor("#0e7a3e"),
]


def strand_color(code: str, rec: dict | None = None):
    """Pick a color from a code. Handles ELA strand codes, math K-8/9-12
    conceptual category codes, and history skill/content codes."""
    if not code:
        return MUTE
    # History analysis skills: HSS-K5.CST.1, HSS-912.HI.4, etc.
    if code.startswith("HSS-"):
        if rec:
            cat = rec.get("skill_category_code")
            if cat and cat in STRAND_COLOR:
                return STRAND_COLOR[cat]
        # Fall through to mute if record not found
        return MUTE
    # History content: grade-12 Economics has its own tint
    if rec and rec.get("course_title") == "Principles of Economics":
        return HISTORY_ECON_COLOR
    # History content (any other): color by grade_band when record indicates history
    if rec and rec.get("grade_band") in HISTORY_BAND_COLOR and rec.get("is_skill") is False:
        return HISTORY_BAND_COLOR[rec["grade_band"]]
    if code.startswith("CCRA"):
        return colors.HexColor("#4b5563")
    # Mathematical Practices: MP.x or MP.3.1
    if code.startswith("MP."):
        return STRAND_COLOR["MP"]
    # 9-12 conceptual category: e.g., N-RN.B.3, A-SSE.A.1, F-IF.B.4
    if rec and rec.get("category") in {"N", "A", "F", "G", "S"}:
        return STRAND_COLOR[rec["category"]]
    # K-8 math: grade-prefixed (e.g., 3.NF.A.2, 6.RP.A.3)
    parts = code.split(".")
    if parts and parts[0].isdigit():
        return _K8_COLORS[int(parts[0]) % len(_K8_COLORS)]
    if parts and parts[0] == "K":
        return _K8_COLORS[0]
    # ELA fallback: first segment is the strand
    return STRAND_COLOR.get(parts[0], MUTE)


def conf_numeric(level: str) -> int:
    """Map qualitative confidence to a numeric 0-100 mid-point."""
    return {"high": 90, "medium": 70, "low": 50}.get(level.lower(), 60)

def conf_colors(level: str):
    l = level.lower()
    if l == "high": return CONF_HIGH_INK, CONF_HIGH_BG
    if l == "medium": return CONF_MED_INK, CONF_MED_BG
    return CONF_LOW_INK, CONF_LOW_BG


def esc(s: str) -> str:
    if not s: return ""
    return (s.replace("&", "&amp;")
             .replace("<", "&lt;")
             .replace(">", "&gt;"))


# ---- styles ------------------------------------------------------ #
def build_styles():
    ss = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "title", parent=ss["Title"], fontSize=20, leading=24,
            textColor=INK, alignment=TA_LEFT, spaceAfter=4),
        "subtitle": ParagraphStyle(
            "subtitle", fontSize=11, leading=14, textColor=MUTE,
            spaceAfter=14),
        "h2": ParagraphStyle(
            "h2", fontSize=13, leading=16, textColor=INK, fontName="Helvetica-Bold",
            spaceBefore=8, spaceAfter=6),
        "section_header": ParagraphStyle(
            "section", fontSize=11, leading=14, textColor=INK,
            fontName="Helvetica-Bold", leftIndent=6,
            spaceBefore=14, spaceAfter=4, backColor=ACCENT_SOFT,
            borderPadding=(6, 8, 6, 8)),
        "obj_title": ParagraphStyle(
            "ot", fontSize=11, leading=14, textColor=INK,
            fontName="Helvetica-Bold", spaceAfter=2),
        "obj_desc": ParagraphStyle(
            "od", fontSize=9, leading=12, textColor=MUTE, spaceAfter=3),
        "obj_path": ParagraphStyle(
            "op", fontSize=8, leading=10, textColor=MUTE,
            fontName="Courier", spaceAfter=4),
        "code": ParagraphStyle(
            "code", fontSize=10, leading=12, fontName="Helvetica-Bold",
            textColor=INK),
        "code_meta": ParagraphStyle(
            "cm", fontSize=8, leading=10, textColor=MUTE, spaceAfter=2),
        "std_text": ParagraphStyle(
            "st", fontSize=9, leading=12, textColor=colors.HexColor("#374151"),
            backColor=PANEL, leftIndent=6, rightIndent=6,
            borderPadding=(4, 6, 4, 6), spaceAfter=3),
        "rationale_label": ParagraphStyle(
            "rl", fontSize=7, leading=9, textColor=MUTE,
            fontName="Helvetica-Bold", spaceAfter=1),
        "rationale": ParagraphStyle(
            "rt", fontSize=9, leading=12, textColor=INK, spaceAfter=2),
        "no_align": ParagraphStyle(
            "na", fontSize=9, leading=12, textColor=MUTE,
            fontName="Helvetica-Oblique", backColor=PANEL,
            leftIndent=6, rightIndent=6, borderPadding=(4, 6, 4, 6)),
        "summary_big": ParagraphStyle(
            "sb", fontSize=18, leading=22, textColor=INK,
            fontName="Helvetica-Bold"),
        "summary_label": ParagraphStyle(
            "sl", fontSize=8, leading=10, textColor=MUTE,
            fontName="Helvetica-Bold"),
        "summary_sub": ParagraphStyle(
            "ssu", fontSize=9, leading=11, textColor=MUTE),
    }
    return styles


# ---- flowable builders ------------------------------------------ #
def summary_panel(data: dict, styles):
    n = len(data["objectives"])
    a = sum(1 for o in data["objectives"] if o["alignments"])
    assigns = sum(len(o["alignments"]) for o in data["objectives"])
    distinct = len({al["code"] for o in data["objectives"] for al in o["alignments"]})
    mix = {"high": 0, "medium": 0, "low": 0}
    for o in data["objectives"]:
        for al in o["alignments"]:
            mix[al["confidence"].lower()] = mix.get(al["confidence"].lower(), 0) + 1

    def cell(label, big, sub):
        return [
            Paragraph(label.upper(), styles["summary_label"]),
            Spacer(1, 2),
            Paragraph(big, styles["summary_big"]),
            Spacer(1, 1),
            Paragraph(sub, styles["summary_sub"]),
        ]

    cells = [
        cell("Objectives", str(n), f"{a} aligned  ·  {n-a} not"),
        cell("Code assignments", str(assigns), f"{distinct} distinct standards"),
        cell("High confidence", str(mix["high"]),
             f"{mix['medium']} med  ·  {mix['low']} low"),
        cell("Grade band", "/".join(data.get("inferred_grade_bands", [])) or "—",
             "inferred from context"),
    ]
    t = Table([cells], colWidths=[1.6 * inch] * 4)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
    ]))
    return t


def chip_metadata(rec: dict) -> dict:
    """Pull display metadata from a standard record — works for ELA
    (strand/subgroup), math (domain/cluster/category), and history
    (skill_category / course_title)."""
    # History analysis skill
    if rec.get("is_skill"):
        return {"badge": rec.get("skill_category_code", "HSS"),
                "grade": rec.get("grade_band") or "—",
                "subhead": rec.get("skill_category", "")}
    # History content (presence of course_title is the discriminator)
    if rec.get("course_title") and rec.get("section", "").endswith("Content"):
        # Grade 12 Economics gets a clearer label
        if rec.get("course_title") == "Principles of Economics":
            badge = "Econ"
        else:
            badge = rec.get("grade") or rec.get("grade_band") or "HSS"
        # Trim long course titles for display
        ct = rec.get("course_title", "")
        if len(ct) > 60:
            ct = ct[:57] + "..."
        return {"badge": badge,
                "grade": rec.get("grade") or "—",
                "subhead": ct}
    # ELA
    if "strand" in rec:
        return {
            "badge": rec.get("strand", ""),
            "grade": rec.get("grade") or "—",
            "subhead": rec.get("subgroup", ""),
        }
    # Math
    if rec.get("is_practice"):
        return {"badge": "MP", "grade": "—",
                "subhead": "Mathematical Practice"}
    cat = rec.get("category")
    if cat:
        return {"badge": cat,
                "grade": rec.get("grade") or "9-12",
                "subhead": rec.get("cluster") or rec.get("domain_name", "")}
    return {"badge": rec.get("domain", ""),
            "grade": rec.get("grade") or "—",
            "subhead": rec.get("cluster") or rec.get("domain_name", "")}


def code_chip(al: dict, styles, std_by_code: dict):
    """Return a mini-table that visually groups code + metadata + confidence + text + rationale."""
    code = al["code"]
    rec = std_by_code.get(code, {})
    conf_level = al.get("confidence", "medium")
    conf_num = conf_numeric(conf_level)
    conf_ink, conf_bg = conf_colors(conf_level)

    # Subject-aware metadata
    meta = chip_metadata(rec)
    badge = meta["badge"]
    grade = meta["grade"]
    subhead = meta["subhead"]
    color = strand_color(code, rec)

    code_para = Paragraph(
        f'<font color="{color.hexval()}" name="Helvetica-Bold" size="11">{esc(code)}</font>',
        styles["code"])
    strand_para = Paragraph(
        f'<font color="white" backcolor="{color.hexval()}" '
        f'name="Helvetica-Bold" size="7">&nbsp;{esc(badge)}&nbsp;</font>',
        styles["code_meta"])
    grade_para = Paragraph(f'<font size="8" color="#6b7280">Grade {esc(grade)}</font>',
                           styles["code_meta"])
    subgroup_para = Paragraph(f'<font size="8" color="#6b7280"><i>{esc(subhead)}</i></font>',
                              styles["code_meta"])
    conf_para = Paragraph(
        f'<font color="{conf_ink.hexval()}" name="Helvetica-Bold" size="9">'
        f'{conf_num}</font>'
        f'<font color="{conf_ink.hexval()}" size="7"> / 100 &nbsp;</font>'
        f'<font color="{conf_ink.hexval()}" name="Helvetica-Bold" size="7">'
        f'{esc(conf_level.upper())}</font>',
        styles["code_meta"])

    header_row = [[code_para, strand_para, grade_para, subgroup_para, conf_para]]
    header = Table(header_row,
                   colWidths=[0.9 * inch, 0.6 * inch, 0.6 * inch,
                              1.7 * inch, 1.0 * inch])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("BOX", (4, 0), (4, 0), 0, colors.white),
        ("BACKGROUND", (4, 0), (4, 0), conf_bg),
    ]))

    # Standard text
    stext = rec.get("text", "")
    text_flow = Paragraph(esc(stext), styles["std_text"]) if stext else Paragraph(
        "(standard text not found)", styles["std_text"])
    # Rationale
    rationale_flow = [
        Paragraph("WHY THIS MAPS", styles["rationale_label"]),
        Paragraph(esc(al.get("rationale", "")), styles["rationale"]),
    ]

    chip_rows = [[header], [text_flow]] + [[f] for f in rationale_flow]
    chip = Table(chip_rows, colWidths=[4.85 * inch])
    chip.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
    ]))
    return chip


def objective_block(obj: dict, styles, std_by_code: dict, subject_label: str):
    # Left column: title, description, path
    left_flow = [
        Paragraph(esc(obj["title"]), styles["obj_title"]),
        Paragraph(esc(obj.get("description", "")), styles["obj_desc"]),
        Paragraph(esc(obj["path"]), styles["obj_path"]),
    ]
    if obj.get("note"):
        left_flow.append(Paragraph(f'<i>Note: {esc(obj["note"])}</i>', styles["obj_desc"]))

    # Right column: code chips OR "no alignment" note
    if obj["alignments"]:
        right_flow = []
        for al in obj["alignments"]:
            right_flow.append(code_chip(al, styles, std_by_code))
            right_flow.append(Spacer(1, 4))
    else:
        msg = obj.get("note") or f"No {subject_label} standard applies (logistical/platform objective)."
        right_flow = [Paragraph(esc(msg), styles["no_align"])]

    row = Table([[left_flow, right_flow]],
                colWidths=[2.2 * inch, 5.0 * inch])
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, LINE),
    ]))
    return row


# ---- main build ------------------------------------------------- #
def build_pdf(final_path: Path, out_path: Path):
    data = json.load(open(final_path))
    styles = build_styles()

    # Resolve which standards DB to use, infer subject from path or field
    db_rel = data.get("standards_db", "categorized-standards/California/CA-ELA.json")
    std_by_code = load_standards(db_rel)
    db_upper = db_rel.upper()
    if "HISTORY" in db_upper:
        subject_label = "History"
        subtitle = "California History–Social Science Standards Alignment"
    elif "MATH" in db_upper:
        subject_label = "Math"
        subtitle = "California CCSS Mathematics Standards Alignment"
    else:
        subject_label = "ELA"
        subtitle = "California CCSS ELA Standards Alignment"

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=LETTER,
        leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        topMargin=0.5 * inch, bottomMargin=0.5 * inch,
        title=f"Alignment — {data['edusperience_title']}",
        author="Standards Tagger",
    )
    story = []
    # Header
    story.append(Paragraph(esc(data["edusperience_title"]), styles["title"]))
    story.append(Paragraph(subtitle, styles["subtitle"]))
    story.append(summary_panel(data, styles))
    story.append(Spacer(1, 10))
    if data.get("notes"):
        story.append(Paragraph(f'<i>{esc(data["notes"])}</i>',
                               ParagraphStyle(
                                   "notes", fontSize=9, leading=12,
                                   textColor=MUTE)))
        story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))
    story.append(Spacer(1, 4))

    # Group by section
    current_section = None
    for obj in data["objectives"]:
        m = re.match(r"sections\[(\d+)\]\.objectives\[(\d+)\]", obj["path"])
        sec_idx = int(m.group(1)) if m else 0
        if sec_idx != current_section:
            current_section = sec_idx
            sec_title = section_title(data, sec_idx)
            story.append(Paragraph(
                f"Section {sec_idx + 1}: {esc(sec_title)}",
                styles["section_header"]))
        story.append(objective_block(obj, styles, std_by_code, subject_label))

    doc.build(story)


def section_title(data: dict, sec_idx: int) -> str:
    src = data.get("source_file")
    if src:
        path = ROOT / src
        if path.exists():
            edu = json.load(open(path))
            secs = edu.get("sections", [])
            if sec_idx < len(secs):
                t = secs[sec_idx].get("title") or ""
                t = re.sub(r"<[^>]+>", " ", t)
                return re.sub(r"\s+", " ", t).strip()
    return f"Section {sec_idx + 1}"


# ---- CLI -------------------------------------------------------- #
def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("finals", nargs="*", help="Paths to *.final.json files")
    p.add_argument("--all", action="store_true",
                   help="Process every artifacts/*.final.json")
    args = p.parse_args()

    if args.all:
        paths = sorted(ART_DIR.glob("*.final.json"))
    else:
        paths = [Path(x) for x in args.finals]
    if not paths:
        print("No inputs", file=sys.stderr)
        return 1

    for fp in paths:
        stem = fp.name.replace(".final.json", "")
        out = ART_DIR / f"{stem}.alignment.pdf"
        build_pdf(fp, out)
        print(f"  -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
ory.append(Paragraph(f'<i>{esc(data["notes"])}</i>',
                               ParagraphStyle(
                                   "notes", fontSize=9, leading=12,
                                   textColor=MUTE)))
        story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))
    story.append(Spacer(1, 4))

    # Group by section
    current_section = None
    for obj in data["objectives"]:
        m = re.match(r"sections\[(\d+)\]\.objectives\[(\d+)\]", obj["path"])
        sec_idx = int(m.group(1)) if m else 0
        if sec_idx != current_section:
            current_section = sec_idx
            sec_title = section_title(data, sec_idx)
            story.append(Paragraph(
                f"Section {sec_idx + 1}: {esc(sec_title)}",
                styles["section_header"]))
        story.append(objective_block(obj, styles, std_by_code, subject_label))

    doc.build(story)


def section_title(data: dict, sec_idx: int) -> str:
    src = data.get("source_file")
    if src:
        path = ROOT / src
        if path.exists():
            edu = json.load(open(path))
            secs = edu.get("sections", [])
            if sec_idx < len(secs):
                t = secs[sec_idx].get("title") or ""
                t = re.sub(r"<[^>]+>", " ", t)
                return re.sub(r"\s+", " ", t).strip()
    return f"Section {sec_idx + 1}"


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("finals", nargs="*", help="Paths to *.final.json files")
    p.add_argument("--all", action="store_true",
                   help="Process every artifacts/*.final.json")
    args = p.parse_args()

    if args.all:
        paths = sorted(ART_DIR.glob("*.final.json"))
    else:
        paths = [Path(x) for x in args.finals]
    if not paths:
        print("No inputs", file=sys.stderr)
        return 1

    for fp in paths:
        stem = fp.name.replace(".final.json", "")
        out = ART_DIR / f"{stem}.alignment.pdf"
        build_pdf(fp, out)
        print(f"  -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
