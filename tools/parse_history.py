"""
Parse the California History-Social Science Content Standards PDF into
leaf-level standard records.

Input:
  raw-pdfs/HISTORY-CA-finalelaccssstandards.pdf

Output:
  categorized-standards/California/CA-HISTORY.json        - flat list of leaf records
  categorized-standards/California/CA-HISTORY.meta.json   - section / band reference
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

ROOT      = Path("/sessions/keen-lucid-heisenberg/mnt/Standards-Tagger")
PDF_PATH  = ROOT / "raw-pdfs" / "HISTORY-CA-finalelaccssstandards.pdf"
OUT_DIR   = ROOT / "categorized-standards" / "California"
OUT_JSON  = OUT_DIR / "CA-HISTORY.json"
OUT_META  = OUT_DIR / "CA-HISTORY.meta.json"
DEBUG_TXT = ROOT / "artifacts" / "history_extract" / "full_text.txt"

OUT_DIR.mkdir(parents=True, exist_ok=True)

# Section -> (band, page range, mode). PDF page = printed page + 7.
SECTIONS = [
    ("K-5 Analysis Skills",  "K-5",  8,  9,  "skills"),
    ("K-5 Content",          "K-5",  10, 27, "content"),
    ("6-8 Analysis Skills",  "6-8",  28, 29, "skills"),
    ("6-8 Content",          "6-8",  30, 46, "content"),
    ("9-12 Analysis Skills", "9-12", 47, 48, "skills"),
    ("9-12 Content",         "9-12", 49, 68, "content"),
]

GRADE_PAGES = {
    "K":  (10, 11), "1":  (12, 13), "2":  (14, 15), "3":  (16, 18),
    "4":  (19, 22), "5":  (23, 27), "6":  (30, 33), "7":  (34, 39),
    "8":  (40, 46), "10": (49, 53), "11": (54, 60), "12": (61, 68),
}

GRADE_TITLES = {
    "K":  "Learning and Working Now and Long Ago",
    "1":  "A Child's Place in Time and Space",
    "2":  "People Who Make a Difference",
    "3":  "Continuity and Change",
    "4":  "California: A Changing State",
    "5":  "United States History and Geography: Making a New Nation",
    "6":  "World History and Geography: Ancient Civilizations",
    "7":  "World History and Geography: Medieval and Early Modern Times",
    "8":  "United States History and Geography: Growth and Conflict",
    "10": "World History, Culture, and Geography: The Modern World",
    "11": "United States History and Geography: Continuity and Change in the Twentieth Century",
    "12": "Principles of American Democracy and Economics",
}

GRADE_BAND = {
    **{g: "K-5"  for g in ["K", "1", "2", "3", "4", "5"]},
    **{g: "6-8"  for g in ["6", "7", "8"]},
    **{g: "9-12" for g in ["10", "11", "12"]},
}

# Grade 12 = two semester courses sharing the 12.<n> numbering.
COURSE_OVERRIDES = {
    "12": [
        {"header_match": None,
         "code_prefix":  "12",
         "course_title": "Principles of American Democracy"},
        {"header_match": re.compile(r"^\s*Principles of Economics\s*$"),
         "code_prefix":  "12E",
         "course_title": "Principles of Economics"},
    ],
}

SKILL_CATEGORIES = [
    ("CST", "Chronological and Spatial Thinking"),
    ("REP", "Research, Evidence, and Point of View"),
    ("HI",  "Historical Interpretation"),
]
CATEGORY_BY_TITLE = {
    "chronological and spatial thinking":               "CST",
    "research, evidence, and point of view":            "REP",
    "historical research, evidence, and point of view": "REP",
    "historical interpretation":                        "HI",
}
CATEGORY_TITLE_BY_CODE = {code: title for code, title in SKILL_CATEGORIES}
BAND_PREFIX = {"K-5": "HSS-K5", "6-8": "HSS-68", "9-12": "HSS-912"}


# -------- Text extraction --------

def extract_pages(pdf_path):
    r = PdfReader(str(pdf_path))
    return {i + 1: r.pages[i].extract_text() or "" for i in range(len(r.pages))}


# -------- Line cleaning --------

SOFT_HYPHEN = "­"

PAGE_HEADER_RE = re.compile(
    r"""^\s*
        (?:\d+\s+)?
        (?:KINDERGARTEN
           |GRADE\s+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE)
           |GRADES\s+(?:SIX|NINE)\s+(?:THROUGH|Through)\s+(?:EIGHT|TWELVE|Twelve|Eight)
        )
        (?:\s+\d+)?
        \s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)
PAGE_FOOTER_RE = re.compile(
    r"^\s*(California Department of Education|Created\s+May\s+18,\s+2000)\s*$",
    re.IGNORECASE,
)
JUST_NUMBER_RE = re.compile(r"^\s*\d{1,3}\s*$")


def is_skip_line(line):
    if not line.strip():
        return True
    if PAGE_HEADER_RE.match(line):
        return True
    if PAGE_FOOTER_RE.match(line):
        return True
    if JUST_NUMBER_RE.match(line):
        return True
    return False


def join_continuation(lines):
    out = []
    for ln in lines:
        ln = ln.rstrip()
        if not ln:
            continue
        if out:
            prev = out[-1]
            if prev.endswith(SOFT_HYPHEN) or prev.endswith("‐") or (
                prev.endswith("-") and ln and ln[0].islower()
            ):
                out[-1] = prev.rstrip("-").rstrip(SOFT_HYPHEN) + ln.lstrip()
                continue
            out[-1] = prev + " " + ln.lstrip()
        else:
            out.append(ln)
    text = " ".join(out) if not out else out[0]
    text = re.sub(r"\s+", " ", text).strip()
    return text


# -------- Skills parser --------

SKILL_NUM_RE = re.compile(r"^\s*(\d+)\.\s+(\S.*)$")
# pypdf occasionally fails to insert a newline between adjacent skill points,
# producing lines like "2.\tStudents X.3.\tStudents Y". Split on the inner
# boundary so each numbered point becomes its own logical line.
INLINE_SKILL_BOUNDARY = re.compile(r"(?<!^)(?=\d+\.\t\s*Students\b)")


def split_inline_skill_points(line):
    parts = re.split(r"(?<=\.)(?=\d+\.\t\s*Students\b)", line)
    return [p for p in parts if p.strip()]


def parse_skills_band(pages_text, band, section_label):
    lines = []
    for raw in pages_text.splitlines():
        lines.extend(split_inline_skill_points(raw))

    records = []
    current_cat_code = None
    current_cat_title = None
    current_num = None
    current_buf = []
    intro_seen = False

    def flush():
        nonlocal current_buf, current_num
        if current_num is not None and current_cat_code:
            text = join_continuation(current_buf)
            text = re.sub(r"^\s*\d+\.\s*", "", text).strip()
            if text:
                code = f"{BAND_PREFIX[band]}.{current_cat_code}.{current_num}"
                records.append({
                    "code": code,
                    "section": section_label,
                    "grade": None,
                    "grade_band": band,
                    "course_title": None,
                    "skill_category": current_cat_title,
                    "skill_category_code": current_cat_code,
                    "number": current_num,
                    "sub_number": None,
                    "parent_code": None,
                    "is_skill": True,
                    "text": text,
                })
        current_num = None
        current_buf = []

    for raw in lines:
        ln = raw.rstrip()
        if is_skip_line(ln):
            continue

        norm = ln.strip().rstrip(".:").lower()
        if norm in CATEGORY_BY_TITLE:
            flush()
            current_cat_code = CATEGORY_BY_TITLE[norm]
            current_cat_title = CATEGORY_TITLE_BY_CODE[current_cat_code]
            intro_seen = True
            continue
        if not intro_seen:
            continue

        m = SKILL_NUM_RE.match(ln)
        if m:
            flush()
            current_num = int(m.group(1))
            current_buf = [m.group(2)]
            continue

        if current_num is not None:
            current_buf.append(ln)

    flush()
    return records


# -------- Content parser --------

TOPLEVEL_RE = re.compile(r"^\s*([K\d]\d*)\.(\d+)\s+(Students\b.*)$", re.IGNORECASE)
SUBSTANDARD_RE = re.compile(r"^(\d+)\.([A-Z\(\"'].*)$")


def parse_grade_content(pages_text, grade, section_label):
    lines = pages_text.splitlines()
    records = []
    band = GRADE_BAND[grade]
    overrides = COURSE_OVERRIDES.get(grade, [])
    if overrides:
        cur_course = overrides[0]
    else:
        cur_course = {
            "header_match": None,
            "code_prefix":  grade.upper(),
            "course_title": GRADE_TITLES[grade],
        }

    cur_code = None
    cur_kind = None
    cur_top_code = None
    cur_top_num = None
    cur_sub_num = None
    cur_buf = []

    def flush():
        nonlocal cur_buf, cur_code, cur_kind
        if not cur_code:
            return
        text = join_continuation(cur_buf)
        if not text:
            cur_code = None; cur_kind = None; cur_buf = []
            return
        if cur_kind == "top":
            records.append({
                "code": cur_code,
                "section": section_label,
                "grade": grade,
                "grade_band": band,
                "course_title": cur_course["course_title"],
                "skill_category": None,
                "skill_category_code": None,
                "number": cur_top_num,
                "sub_number": None,
                "parent_code": None,
                "is_skill": False,
                "text": text,
            })
        elif cur_kind == "sub":
            records.append({
                "code": cur_code,
                "section": section_label,
                "grade": grade,
                "grade_band": band,
                "course_title": cur_course["course_title"],
                "skill_category": None,
                "skill_category_code": None,
                "number": cur_top_num,
                "sub_number": cur_sub_num,
                "parent_code": cur_top_code,
                "is_skill": False,
                "text": text,
            })
        cur_code = None; cur_kind = None; cur_buf = []

    started = False

    for raw in lines:
        ln = raw.rstrip()
        if is_skip_line(ln):
            continue

        switched = False
        for entry in overrides[1:]:
            hm = entry.get("header_match")
            if hm and hm.match(ln):
                flush()
                cur_course = entry
                started = False
                switched = True
                break
        if switched:
            continue

        m_top = TOPLEVEL_RE.match(ln)
        if m_top:
            grade_part, num_part, body = m_top.group(1), m_top.group(2), m_top.group(3)
            if grade_part.upper() != grade.upper():
                continue
            flush()
            started = True
            cur_top_num = int(num_part)
            cur_top_code = f'{cur_course["code_prefix"]}.{num_part}'
            cur_code = cur_top_code
            cur_kind = "top"
            cur_buf = [body]
            continue

        m_sub = SUBSTANDARD_RE.match(ln)
        if m_sub and started and cur_top_code is not None:
            sub_num = int(m_sub.group(1))
            body = m_sub.group(2)
            flush()
            cur_sub_num = sub_num
            cur_code = f"{cur_top_code}.{sub_num}"
            cur_kind = "sub"
            cur_buf = [body]
            continue

        if cur_code is not None:
            cur_buf.append(ln)

    flush()
    return records


# -------- Main --------

def main():
    pages = extract_pages(PDF_PATH)
    if len(pages) != 68:
        print(f"warning: expected 68 PDF pages, got {len(pages)}", file=sys.stderr)

    DEBUG_TXT.parent.mkdir(parents=True, exist_ok=True)
    DEBUG_TXT.write_text(
        "\n".join(f"=== PAGE {n} ===\n{pages[n]}" for n in sorted(pages)),
        encoding="utf-8",
    )

    all_records = []

    for label, band, p_lo, p_hi, mode in SECTIONS:
        if mode != "skills":
            continue
        chunk = "\n".join(pages.get(p, "") for p in range(p_lo, p_hi + 1))
        recs = parse_skills_band(chunk, band, label)
        all_records.extend(recs)
        print(f"{label:<22}  pages {p_lo}-{p_hi}  -> {len(recs):>3} records")

    for grade, (p_lo, p_hi) in GRADE_PAGES.items():
        band = GRADE_BAND[grade]
        section_label = f"{band} Content"
        chunk = "\n".join(pages.get(p, "") for p in range(p_lo, p_hi + 1))
        recs = parse_grade_content(chunk, grade, section_label)
        all_records.extend(recs)
        n_top = sum(1 for r in recs if r["sub_number"] is None)
        n_sub = sum(1 for r in recs if r["sub_number"] is not None)
        print(f"Grade {grade:<2}             pages {p_lo}-{p_hi}  -> {len(recs):>3} records  "
              f"({n_top} top, {n_sub} sub)")

    OUT_JSON.write_text(json.dumps(all_records, indent=2, ensure_ascii=False), encoding="utf-8")

    meta = {
        "source_pdf": PDF_PATH.name,
        "source_label": "California History-Social Science Content Standards "
                        "(CDE, 1998 adoption / 2000 publication)",
        "generated_by": "tools/parse_history.py",
        "sections": [s[0] for s in SECTIONS],
        "grade_bands": ["K-5", "6-8", "9-12"],
        "grade_titles": GRADE_TITLES,
        "grade_12_courses": {
            "12":  "Principles of American Democracy",
            "12E": "Principles of Economics",
        },
        "skill_categories": {code: title for code, title in SKILL_CATEGORIES},
        "code_scheme": {
            "content_top":   "<grade>.<n>            e.g. K.1, 5.4, 10.2",
            "content_sub":   "<grade>.<n>.<sub>      e.g. K.1.1, 5.4.3, 10.2.5",
            "grade_12_econ": "12E.<n>[.<sub>]        Principles of Economics course",
            "skill":         "HSS-<band>.<cat>.<i>   e.g. HSS-K5.CST.1, HSS-912.HI.4",
        },
        "notes": [
            "Grade 9 has no content standards in this PDF; only the 9-12 Analysis Skills apply.",
            "Grade 12 covers two semester courses (American Democracy = prefix 12, Economics = prefix 12E) sharing the same numeric standard ordering.",
            "Top-level standards and substandards are both emitted as records.",
            "Analysis-skills codes (HSS-<band>.<cat>.<i>) are minted; the source has no canonical short code for them.",
        ],
        "record_count": len(all_records),
    }
    OUT_META.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

    print()
    print(f"Total records: {len(all_records)}")
    print(f"Wrote {OUT_JSON.relative_to(ROOT)}")
    print(f"Wrote {OUT_META.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
