"""
Parse the California CCSS ELA PDF into leaf-level standard records.

Output:
  categorized-standards/California/CA-ELA.json       — list of standard records
  categorized-standards/California/CA-ELA.meta.json  — strand + subgroup metadata

Page types handled:
  - "grade_table": 3-column (K/1/2, 3/4/5, 6/7/8) or 2-column (9-10 / 11-12) grade pages
  - "anchor": CCR anchor-standards intro pages
  - "progressive": Language Progressive Skills compact tables (parsed best-effort)
  - "skip": front matter, section dividers, appendix, blank

Subgroups are looked up by (strand, standard_number) from a hard-coded map
derived from the CCSS document — much more reliable than parsing rotated
sidebar labels.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from collections import defaultdict
import pdfplumber

PDF_PATH = Path("/sessions/keen-lucid-heisenberg/mnt/Standards-Tagger/California/raw-pdfs/ELA-CA-finalelaccssstandards.pdf")
OUT_DIR  = Path("/sessions/keen-lucid-heisenberg/mnt/Standards-Tagger/categorized-standards/California")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------ #
# Reference metadata
# ------------------------------------------------------------------ #
STRAND_NAMES = {
    "RL":  "Reading Standards for Literature",
    "RI":  "Reading Standards for Informational Text",
    "RF":  "Reading Standards for Foundational Skills",
    "W":   "Writing Standards",
    "SL":  "Speaking and Listening Standards",
    "L":   "Language Standards",
    "RH":  "Reading Standards for Literacy in History/Social Studies",
    "RST": "Reading Standards for Literacy in Science and Technical Subjects",
    "WHST":"Writing Standards for Literacy in History/Social Studies, Science, and Technical Subjects",
}

# Subgroup lookups keyed by (strand, standard_number)
SUBGROUPS = {
    "RL":  {1:"Key Ideas and Details", 2:"Key Ideas and Details", 3:"Key Ideas and Details",
            4:"Craft and Structure", 5:"Craft and Structure", 6:"Craft and Structure",
            7:"Integration of Knowledge and Ideas", 8:"Integration of Knowledge and Ideas",
            9:"Integration of Knowledge and Ideas",
            10:"Range of Reading and Level of Text Complexity"},
    "RI":  {1:"Key Ideas and Details", 2:"Key Ideas and Details", 3:"Key Ideas and Details",
            4:"Craft and Structure", 5:"Craft and Structure", 6:"Craft and Structure",
            7:"Integration of Knowledge and Ideas", 8:"Integration of Knowledge and Ideas",
            9:"Integration of Knowledge and Ideas",
            10:"Range of Reading and Level of Text Complexity"},
    "RF":  {1:"Print Concepts", 2:"Phonological Awareness",
            3:"Phonics and Word Recognition", 4:"Fluency"},
    "W":   {1:"Text Types and Purposes", 2:"Text Types and Purposes", 3:"Text Types and Purposes",
            4:"Production and Distribution of Writing", 5:"Production and Distribution of Writing",
            6:"Production and Distribution of Writing",
            7:"Research to Build and Present Knowledge", 8:"Research to Build and Present Knowledge",
            9:"Research to Build and Present Knowledge",
            10:"Range of Writing"},
    "SL":  {1:"Comprehension and Collaboration", 2:"Comprehension and Collaboration",
            3:"Comprehension and Collaboration",
            4:"Presentation of Knowledge and Ideas", 5:"Presentation of Knowledge and Ideas",
            6:"Presentation of Knowledge and Ideas"},
    "L":   {1:"Conventions of Standard English", 2:"Conventions of Standard English",
            3:"Knowledge of Language",
            4:"Vocabulary Acquisition and Use", 5:"Vocabulary Acquisition and Use",
            6:"Vocabulary Acquisition and Use"},
    "RH":  {1:"Key Ideas and Details", 2:"Key Ideas and Details", 3:"Key Ideas and Details",
            4:"Craft and Structure", 5:"Craft and Structure", 6:"Craft and Structure",
            7:"Integration of Knowledge and Ideas", 8:"Integration of Knowledge and Ideas",
            9:"Integration of Knowledge and Ideas",
            10:"Range of Reading and Level of Text Complexity"},
    "RST": {1:"Key Ideas and Details", 2:"Key Ideas and Details", 3:"Key Ideas and Details",
            4:"Craft and Structure", 5:"Craft and Structure", 6:"Craft and Structure",
            7:"Integration of Knowledge and Ideas", 8:"Integration of Knowledge and Ideas",
            9:"Integration of Knowledge and Ideas",
            10:"Range of Reading and Level of Text Complexity"},
    "WHST":{1:"Text Types and Purposes", 2:"Text Types and Purposes",
            4:"Production and Distribution of Writing", 5:"Production and Distribution of Writing",
            6:"Production and Distribution of Writing",
            7:"Research to Build and Present Knowledge", 8:"Research to Build and Present Knowledge",
            9:"Research to Build and Present Knowledge",
            10:"Range of Writing"},  # WHST has no standard 3
}

CCR_STRAND_FOR = {
    "RL":"R", "RI":"R", "RF":None, "RH":"R", "RST":"R",
    "W":"W", "WHST":"W",
    "SL":"SL",
    "L":"L",
}

# Map PDF page number (1-indexed) to page classification.
# Hand-compiled from survey_pages.py output.
PAGE_MAP = {
    # === Front matter ===
    # 1..15: title, copyright, TOC, "How to read", intro. Skipped.

    # === K-5 ELA section ===
    16: ("anchor", {"section":"K-5 ELA", "ccr_strand":"R"}),
    17: ("grade_table", {"strand":"RL", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":list(range(1,10))}),
    18: ("grade_table", {"strand":"RL", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[10]}),
    19: ("grade_table", {"strand":"RL", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":list(range(1,11))}),
    20: ("grade_table", {"strand":"RI", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":list(range(1,10))}),
    21: ("grade_table", {"strand":"RI", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[10]}),
    22: ("grade_table", {"strand":"RI", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":list(range(1,11))}),
    23: ("grade_table", {"strand":"RF", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1"],     "numbers":[1,2]}),
    24: ("grade_table", {"strand":"RF", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[3,4]}),
    25: ("grade_table", {"strand":"RF", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[3,4]}),
    26: ("anchor", {"section":"K-5 ELA", "ccr_strand":"W"}),
    27: ("grade_table", {"strand":"W", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":list(range(1,6))}),
    28: ("grade_table", {"strand":"W", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[6,7,8,9,10]}),
    29: ("grade_table", {"strand":"W", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[1]}),
    30: ("grade_table", {"strand":"W", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[2,3,4,5,6]}),
    31: ("grade_table", {"strand":"W", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[7,8,9,10]}),
    32: ("anchor", {"section":"K-5 ELA", "ccr_strand":"SL"}),
    33: ("grade_table", {"strand":"SL", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[1,2,3]}),
    34: ("grade_table", {"strand":"SL", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[4,5,6]}),
    35: ("grade_table", {"strand":"SL", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[1,2,3]}),
    36: ("grade_table", {"strand":"SL", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[4,5,6]}),
    37: ("anchor", {"section":"K-5 ELA", "ccr_strand":"L"}),
    38: ("grade_table", {"strand":"L", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[1]}),
    39: ("grade_table", {"strand":"L", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[2,3]}),
    40: ("grade_table", {"strand":"L", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["K","1","2"], "numbers":[4,5,6]}),
    41: ("grade_table", {"strand":"L", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[1]}),
    42: ("grade_table", {"strand":"L", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[1]}),  # overflow?
    43: ("grade_table", {"strand":"L", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[2]}),
    44: ("grade_table", {"strand":"L", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[3]}),
    45: ("grade_table", {"strand":"L", "section":"K-5 ELA", "grade_band":"K-5",
                         "grades":["3","4","5"], "numbers":[4,5,6]}),
    # p46 Language Progressive Skills K-5 — special/compact; skip for now
    # p47-50 Standard 10 text complexity + appendix blurbs; skip

    # === 6-12 ELA section ===
    52: ("anchor", {"section":"6-12 ELA", "ccr_strand":"R"}),
    53: ("grade_table", {"strand":"RL", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[1,2,3,4,5]}),
    54: ("grade_table", {"strand":"RL", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[6,7,8,9,10]}),
    55: ("grade_table", {"strand":"RL", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[1,2,3,4,5]}),
    56: ("grade_table", {"strand":"RL", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[6,7,8,9,10]}),
    57: ("grade_table", {"strand":"RI", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[1,2,3,4,5]}),
    58: ("grade_table", {"strand":"RI", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[6,7,8,9,10]}),
    59: ("grade_table", {"strand":"RI", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[1,2,3,4,5]}),
    60: ("grade_table", {"strand":"RI", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[6,7,8,9,10]}),
    61: ("anchor", {"section":"6-12 ELA", "ccr_strand":"W"}),
    62: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[1]}),
    63: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[2]}),
    64: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[3]}),
    65: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[4,5,6,7,8,9]}),
    66: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[10]}),
    67: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[1]}),
    68: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[2]}),
    69: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[3,4,5,6,7,8,9]}),
    70: ("grade_table", {"strand":"W", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[10]}),
    71: ("anchor", {"section":"6-12 ELA", "ccr_strand":"SL"}),
    72: ("grade_table", {"strand":"SL","section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[1,2,3]}),
    73: ("grade_table", {"strand":"SL","section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[4,5,6]}),
    74: ("grade_table", {"strand":"SL","section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[1,2,3]}),
    75: ("grade_table", {"strand":"SL","section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[4,5,6]}),
    76: ("anchor", {"section":"6-12 ELA", "ccr_strand":"L"}),
    77: ("grade_table", {"strand":"L", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[1,2,3]}),
    78: ("grade_table", {"strand":"L", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[4,5,6]}),
    79: ("grade_table", {"strand":"L", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["6","7","8"], "numbers":[6]}),  # overflow
    80: ("grade_table", {"strand":"L", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[1,2,3]}),
    81: ("grade_table", {"strand":"L", "section":"6-12 ELA", "grade_band":"6-12",
                         "grades":["9-10","11-12"], "numbers":[4,5,6]}),
    # p82-84 Progressive/Standard 10/texts — skip

    # === 6-12 Literacy in H/SS, Sci, Tech ===
    86: ("anchor", {"section":"6-12 Literacy", "ccr_strand":"R"}),
    87: ("grade_table", {"strand":"RH", "section":"6-12 Literacy in H/SS",
                         "grade_band":"6-12", "grades":["6-8","9-10","11-12"],
                         "numbers":[1,2,3,4,5]}),
    88: ("grade_table", {"strand":"RH", "section":"6-12 Literacy in H/SS",
                         "grade_band":"6-12", "grades":["6-8","9-10","11-12"],
                         "numbers":[6,7,8,9,10]}),
    89: ("grade_table", {"strand":"RST","section":"6-12 Literacy in Science/Tech",
                         "grade_band":"6-12", "grades":["6-8","9-10","11-12"],
                         "numbers":[1,2,3,4,5]}),
    90: ("grade_table", {"strand":"RST","section":"6-12 Literacy in Science/Tech",
                         "grade_band":"6-12", "grades":["6-8","9-10","11-12"],
                         "numbers":[6,7,8,9,10]}),
    91: ("anchor", {"section":"6-12 Literacy", "ccr_strand":"W"}),
    92: ("grade_table", {"strand":"WHST","section":"6-12 Literacy in H/SS/Sci/Tech",
                         "grade_band":"6-12","grades":["6-8","9-10","11-12"],
                         "numbers":[1]}),
    93: ("grade_table", {"strand":"WHST","section":"6-12 Literacy in H/SS/Sci/Tech",
                         "grade_band":"6-12","grades":["6-8","9-10","11-12"],
                         "numbers":[2]}),
    94: ("grade_table", {"strand":"WHST","section":"6-12 Literacy in H/SS/Sci/Tech",
                         "grade_band":"6-12","grades":["6-8","9-10","11-12"],
                         "numbers":[4,5,6,7,8,9]}),
    95: ("grade_table", {"strand":"WHST","section":"6-12 Literacy in H/SS/Sci/Tech",
                         "grade_band":"6-12","grades":["6-8","9-10","11-12"],
                         "numbers":[10]}),
}

BULLET_NUM_RE  = re.compile(r'^(\d{1,2})\.$')
BULLET_LET_RE  = re.compile(r'^([a-z])\.$')

# Y-coordinate tolerance (points). pdfplumber can report the same line of text
# with microscopic y differences between a leading bullet and following words
# (e.g. 203.211 vs 203.2099998). Without tolerance, a word belonging to the
# *next* bullet slips into the *previous* bullet's range and contaminates it.
Y_TOL = 1.0

# ------------------------------------------------------------------ #
# Grade-header detection
# ------------------------------------------------------------------ #
#
# Grade bands carry their own headers: "Kindergartners | Grade 1 Students |
# Grade 2 Students", "Grade 3 Students | Grade 4 Students | Grade 5 Students",
# "Grade 6 Students | Grade 7 Students | Grade 8 Students", "Grades 9–10
# Students | Grades 11–12 Students", and the 3-column WHST/RH/RST form
# "Grades 6–8 | Grades 9–10 | Grades 11–12".
#
# Some pages carry TWO headers (one at top, another mid-page) when a new
# grade band begins on the same page. The parser must split those pages
# vertically and process each band independently.

# Detect grade labels starting with either "Kindergartners" or "Grade(s)"
_GRADE_WORD_MAP = {
    "Kindergartners": "K",
}
# We intentionally parse "Grade N Students" / "Grades A-B Students" tokens
# dynamically from the word stream (see _extract_header_band below) rather
# than via a full string match — this is robust to pdfplumber splitting the
# en-dash "–" vs ASCII "-".

def _normalize_dash(s: str) -> str:
    return s.replace("–", "-").replace("—", "-")

def _extract_grade_from_words(line_words):
    """Given words on a single visual line (sorted by x0), yield (grade, x0)
    for each grade label found. Handles:
      - "Kindergartners"                       -> "K"
      - "Grade", N, "Students"                 -> "N"
      - "Grades", A-B, "Students"              -> "A-B" (dashes normalized)
    """
    out = []
    i = 0
    while i < len(line_words):
        w = line_words[i]
        t = w["text"]
        if t == "Kindergartners":
            out.append(("K", w["x0"]))
            i += 1
            continue
        if t == "Grade" and i + 2 < len(line_words):
            nxt = line_words[i+1]["text"]
            aft = line_words[i+2]["text"]
            if re.match(r'^\d+$', nxt) and aft == "Students":
                out.append((nxt, w["x0"]))
                i += 3
                continue
        if t == "Grades" and i + 2 < len(line_words):
            nxt = _normalize_dash(line_words[i+1]["text"])
            aft = line_words[i+2]["text"]
            if re.match(r'^\d+-\d+$', nxt) and aft == "Students":
                out.append((nxt, w["x0"]))
                i += 3
                continue
            # Some WHST/RH/RST pages use "Grades 6-8" without "Students"
            if re.match(r'^\d+-\d+$', nxt):
                out.append((nxt, w["x0"]))
                i += 2
                continue
        i += 1
    return out

def detect_bands(body_words, page_h):
    """Find all grade-header rows on the page. Each returned band has:
        { y_top: header y, y_bot: next header y (or page bottom),
          grades: [grade_labels in column order],
          grade_xs: [x0 positions of each grade label] }
    Returns [] if no header found.
    """
    # Group words into visual lines by y (2pt bucket)
    lines = defaultdict(list)
    for w in body_words:
        if w.get("size", 0) >= 12:
            continue  # skip bigger titles
        key = round(w["top"] / 2) * 2
        lines[key].append(w)
    headers = []
    for y, ws in sorted(lines.items()):
        ws.sort(key=lambda w: w["x0"])
        hits = _extract_grade_from_words(ws)
        if len(hits) >= 2:
            grades = [g for g, _ in hits]
            xs = [x for _, x in hits]
            headers.append((y, grades, xs))
    if not headers:
        return []
    bands = []
    for i, (y, grades, xs) in enumerate(headers):
        y_bot = headers[i+1][0] if i+1 < len(headers) else page_h - 40
        bands.append({"y_top": y, "y_bot": y_bot, "grades": grades, "grade_xs": xs})
    return bands

def _col_of(x, col_centers):
    """Return the index of the column whose center is nearest to x (with
    preference for columns whose center is <= x, i.e. we are inside that
    column). Falls back to the nearest column overall."""
    if not col_centers:
        return 0
    best_i, best_d = 0, 1e9
    for i, c in enumerate(col_centers):
        # Prefer the column whose center is <= x + slack
        if x + 5 >= c - 15:
            d = x - (c - 15)
            if 0 <= d < best_d:
                best_i, best_d = i, d
    if best_d < 1e9:
        return best_i
    # Fallback: nearest by |x - center|
    best_i, best_d = 0, 1e9
    for i, c in enumerate(col_centers):
        d = abs(x - c)
        if d < best_d:
            best_i, best_d = i, d
    return best_i


def cluster_xs(xs, tol=30):
    """Cluster x-values into groups whose members are within `tol` points
    of some previously-seen member. Returns sorted cluster centers."""
    if not xs:
        return []
    xs = sorted(xs)
    clusters = [[xs[0]]]
    for x in xs[1:]:
        if x - clusters[-1][-1] < tol:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    return [sum(c) / len(c) for c in clusters]


def classify_columns(bullet_xs, expected_cols):
    """Cluster bullet x-positions into expected_cols columns. Return sorted left edges."""
    if not bullet_xs:
        return []
    xs = sorted(bullet_xs)
    # Greedy clustering: anything within 30pt is same column
    clusters = [[xs[0]]]
    for x in xs[1:]:
        if x - clusters[-1][-1] < 40:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    # Return cluster centers
    return [sum(c)/len(c) for c in clusters]

def parse_grade_table_page(page, info, page_no):
    """Extract standard records from a grade-table page.

    Auto-detects all grade-header bands on the page and processes each
    band's Y range independently (some pages carry TWO bands — e.g. K/1/2
    standard 10 at the top and 3/4/5 standards 1-3 at the bottom).
    """
    words = [w for w in page.extract_words(extra_attrs=["upright","size"])
             if w.get("upright", True)]
    page_h = page.height
    body = [w for w in words
            if w.get("size", 0) < 12
            and 60 < w["top"] < page_h - 40
            and w["x0"] > 35]
    if not body:
        return []

    bands = detect_bands(body, page_h)
    if not bands:
        # Page has no grade-header row (shouldn't happen for grade_table pages).
        # Fall back to whatever info supplies (if any).
        if info.get("grades"):
            bands = [{"y_top": 90, "y_bot": page_h - 30,
                      "grades": info["grades"], "grade_xs": []}]
        else:
            print(f"    WARN p{page_no}: no grade-header rows detected", file=sys.stderr)
            return []

    records = []
    for band in bands:
        records.extend(_parse_band(band, body, info, page_no))
    return records


def _parse_band(band, page_body, info, page_no):
    """Parse the records inside a single (vertical) grade-header band."""
    y_top = band["y_top"]
    y_bot = band["y_bot"]
    grades = band["grades"]
    # Header takes up ~25pt (multi-line headers like "Grade 1 Students"
    # have "Grade"/"1"/"Students" stacked across two lines). Push the
    # band start down a bit so header words themselves don't get
    # classified as body text.
    body = [w for w in page_body
            if y_top + 10 < w["top"] < y_bot - 2]
    if not body:
        return []

    # Collect bullet tokens in this band
    num_bullets = []
    let_bullets = []
    for w in body:
        t = w["text"]
        m = BULLET_NUM_RE.match(t)
        if m:
            num_bullets.append((w["top"], w["x0"], int(m.group(1)), w))
            continue
        m = BULLET_LET_RE.match(t)
        if m:
            let_bullets.append((w["top"], w["x0"], m.group(1), w))

    if not num_bullets:
        return []

    # Cluster numbered-bullet x-positions into columns
    col_centers = cluster_xs([b[1] for b in num_bullets], tol=40)
    if len(col_centers) != len(grades):
        print(f"    WARN p{page_no} band@y={y_top:.0f}: detected {len(col_centers)} cols, expected {len(grades)} "
              f"(grades={grades}, centers={col_centers})", file=sys.stderr)
        # Align by order; drop extras or be lenient
        col_centers = col_centers[:len(grades)] if len(col_centers) > len(grades) else col_centers

    # Second-pass: the PDF occasionally drops the trailing period on a
    # numbered bullet (e.g. W.5.6 on p30 appears as bare "6" at x=505.8).
    # Recognize bare-integer tokens whose x-position matches a column's
    # left edge AND that fall on a bullet-height y-row (i.e. there isn't
    # already a numbered bullet on that row). Treat them as bullets too.
    existing_bullet_ys = {(round(b[0], 1), _col_of(b[1], col_centers)) for b in num_bullets}
    for w in body:
        t = w["text"]
        if not re.match(r'^\d{1,2}$', t):
            continue
        # x must be within a small delta of a column center's left edge
        col_i = _col_of(w["x0"], col_centers)
        c = col_centers[col_i] if col_i < len(col_centers) else None
        if c is None or abs(w["x0"] - c) > 15:
            continue
        key = (round(w["top"], 1), col_i)
        if key in existing_bullet_ys:
            continue
        num_bullets.append((w["top"], w["x0"], int(t), w))
        existing_bullet_ys.add(key)

    # Determine the numbered standards for each column independently
    numbers_by_col = defaultdict(set)
    for y, x, n, w in num_bullets:
        ci = _col_of(x, col_centers)
        numbers_by_col[ci].add(n)

    def assign_col(x):
        # Nearest-column-whose-center-is-<=-x
        best_i, best_d = 0, 1e9
        for i, c in enumerate(col_centers):
            if x + 5 >= c - 15:
                d = x - (c - 15)
                if 0 <= d < best_d:
                    best_i, best_d = i, d
        return best_i

    col_words = defaultdict(list)
    for w in body:
        col_words[assign_col(w["x0"])].append(w)

    records = []
    for col_i, grade in enumerate(grades):
        if col_i >= len(col_centers):
            continue
        valid_numbers = numbers_by_col.get(col_i, set())
        ws = sorted(col_words[col_i], key=lambda w: (w["top"], w["x0"]))
        col_center = col_centers[col_i]
        # Identify bullet positions in this column
        col_bullets = []
        for w in ws:
            t = w["text"]
            m = BULLET_NUM_RE.match(t)
            if m and int(m.group(1)) in valid_numbers:
                col_bullets.append((w["top"], w["x0"], int(m.group(1)), "num"))
                continue
            # Also accept bare-integer bullets (missing period) at column edge
            m_bare = re.match(r'^(\d{1,2})$', t)
            if (m_bare and int(m_bare.group(1)) in valid_numbers
                    and abs(w["x0"] - col_center) <= 15):
                col_bullets.append((w["top"], w["x0"], int(m_bare.group(1)), "num"))
                continue
            m2 = BULLET_LET_RE.match(t)
            if m2:
                col_bullets.append((w["top"], w["x0"], m2.group(1), "let"))
        col_bullets.sort()
        # Build a range for each bullet: from its y to next bullet's y (same col)
        for i, b in enumerate(col_bullets):
            y_start, x_bul, bid, btype = b
            y_end = col_bullets[i+1][0] if i+1 < len(col_bullets) else y_bot
            # Collect words in this column strictly AFTER the bullet token, whose y is
            # in [y_start-Y_TOL, y_end-Y_TOL). The -Y_TOL on both sides makes the
            # comparison robust against float-precision noise where a word on the
            # next bullet's line has y just below y_end by ~0.001pt.
            text_words = []
            for w in ws:
                # A word belongs to this bullet if:
                #   - its y is in the vertical range of this bullet
                #   - it is not itself one of the bullet tokens for this column
                #   - it is not the bullet's own token
                t = w["text"]
                if y_start - Y_TOL <= w["top"] < y_end - Y_TOL:
                    if w["x0"] == x_bul and w["top"] == y_start and t in (f"{bid}.", f"{bid}"):
                        continue
                    if BULLET_NUM_RE.match(t) and int(BULLET_NUM_RE.match(t).group(1)) in valid_numbers:
                        continue  # skip any other numbered bullet token
                    # bare-integer bullet at column edge — skip
                    m_bare = re.match(r'^(\d{1,2})$', t)
                    if (m_bare and int(m_bare.group(1)) in valid_numbers
                            and abs(w["x0"] - col_center) <= 15):
                        continue
                    if BULLET_LET_RE.match(t):
                        # skip sub-letter bullet tokens themselves
                        continue
                    text_words.append(w)
            # Group text_words into logical lines by y
            text_words.sort(key=lambda w: (round(w["top"]/2)*2, w["x0"]))
            text = " ".join(w["text"] for w in text_words)
            text = re.sub(r'\s+', ' ', text).strip()
            # Strip footnote text that starts with asterisked definitions
            # (e.g. "*Words, syllables, or phonemes written in /slashes/...")
            text = re.sub(r'\s+\*(Words|These broad|Please see).*$', '', text).strip()
            # Strip trailing lone footnote markers like " 1 " or " 1"
            text = re.sub(r'\s+\d{1,2}\s*$', '', text).strip()
            # Detect CA-addition suffix
            ca = False
            # The suffix "CA" is a standalone word at end
            if re.search(r'\bCA\b\s*$', text):
                ca = True
                text = re.sub(r'\s*CA\s*$', '', text).strip()
            # Also the pattern "...) CA" or "... CA"
            if btype == "num":
                code_base = f"{info['strand']}.{grade}.{bid}"
                rec = {
                    "code": code_base,
                    "full_code": f"CCSS.ELA-LITERACY.{info['strand']}.{grade}.{bid}",
                    "strand": info["strand"],
                    "strand_name": STRAND_NAMES.get(info["strand"], info["strand"]),
                    "section": info["section"],
                    "grade": grade,
                    "grade_band": info["grade_band"],
                    "subgroup": SUBGROUPS.get(info["strand"], {}).get(bid),
                    "number": bid,
                    "sub_letter": None,
                    "parent_code": None,
                    "anchor_code": (f"CCRA.{CCR_STRAND_FOR[info['strand']]}.{bid}"
                                    if CCR_STRAND_FOR.get(info["strand"]) else None),
                    "is_anchor": False,
                    "ca_addition": ca,
                    "text": text,
                    "source_page": page_no,
                }
                records.append(rec)
            else:
                # sub-letter: find the most recent numbered standard in this column
                parent_num = None
                for j in range(i, -1, -1):
                    if col_bullets[j][3] == "num":
                        parent_num = col_bullets[j][2]
                        break
                if parent_num is None:
                    # fallback: attach to the highest-numbered standard we saw in this column
                    parent_num = max(valid_numbers) if valid_numbers else 1
                code = f"{info['strand']}.{grade}.{parent_num}.{bid}"
                rec = {
                    "code": code,
                    "full_code": f"CCSS.ELA-LITERACY.{info['strand']}.{grade}.{parent_num}.{bid}",
                    "strand": info["strand"],
                    "strand_name": STRAND_NAMES.get(info["strand"], info["strand"]),
                    "section": info["section"],
                    "grade": grade,
                    "grade_band": info["grade_band"],
                    "subgroup": SUBGROUPS.get(info["strand"], {}).get(parent_num),
                    "number": parent_num,
                    "sub_letter": bid,
                    "parent_code": f"{info['strand']}.{grade}.{parent_num}",
                    "anchor_code": (f"CCRA.{CCR_STRAND_FOR[info['strand']]}.{parent_num}"
                                    if CCR_STRAND_FOR.get(info["strand"]) else None),
                    "is_anchor": False,
                    "ca_addition": ca,  # sub-bullets are often CA additions
                    "text": text,
                    "source_page": page_no,
                }
                records.append(rec)
    return records


def parse_anchor_page(page, info, page_no):
    """Parse a CCR anchor-standards page. Returns 10 (or 6) anchor records."""
    # Anchor pages are harder to segment automatically (2-column intro+standards flow)
    # Strategy: use extract_text and regex for standards "N. <text>"
    text = page.extract_text() or ""
    ccr_strand = info["ccr_strand"]
    # The anchor page lists 10 Reading/Writing (or 6 SL/L) standards with subgroup headings interleaved.
    # Subgroup headings for this strand:
    strand_subgroups_order = {
        "R":  [("Key Ideas and Details", [1,2,3]),
               ("Craft and Structure", [4,5,6]),
               ("Integration of Knowledge and Ideas", [7,8,9]),
               ("Range of Reading and Level of Text Complexity", [10])],
        "W":  [("Text Types and Purposes", [1,2,3]),
               ("Production and Distribution of Writing", [4,5,6]),
               ("Research to Build and Present Knowledge", [7,8,9]),
               ("Range of Writing", [10])],
        "SL": [("Comprehension and Collaboration", [1,2,3]),
               ("Presentation of Knowledge and Ideas", [4,5,6])],
        "L":  [("Conventions of Standard English", [1,2]),
               ("Knowledge of Language", [3]),
               ("Vocabulary Acquisition and Use", [4,5,6])],
    }[ccr_strand]

    # CCR anchor pages carry numbered standards in 1 OR 2 bullet columns,
    # with narrative sidebars filling the rest of the page. Extract each
    # bullet's text by finding words in the same column between the bullet
    # and the next bullet in that column. Sidebar narrative at the top of
    # column 2 is filtered out by starting each column's text extraction
    # at the Y of its first bullet.
    words = [w for w in page.extract_words(extra_attrs=["upright","size"])
             if w.get("upright", True)]
    ph = page.height
    body = [w for w in words if 60 < w["top"] < ph - 40 and w.get("size", 0) < 12]
    if not body:
        return []
    bullet_words = [w for w in body if BULLET_NUM_RE.match(w["text"])]
    if not bullet_words:
        return []
    # Cluster bullet x-positions into columns
    col_xs = cluster_xs([w["x0"] for w in bullet_words], tol=40)
    # For each column, find the bullets (with numbers) in that column
    col_bullets = defaultdict(list)  # col_i -> list of (y, number, x)
    for w in bullet_words:
        n = int(BULLET_NUM_RE.match(w["text"]).group(1))
        ci = min(range(len(col_xs)), key=lambda i: abs(w["x0"] - col_xs[i]))
        col_bullets[ci].append((w["top"], n, w["x0"]))
    # Estimate column width (left edge of next column minus small gap, or
    # a safe default for the rightmost column)
    def col_width(ci):
        if ci + 1 < len(col_xs):
            return col_xs[ci+1] - col_xs[ci] - 10
        return 380  # rightmost column extends toward page edge

    # For each column, for each bullet: capture the body text immediately
    # below, filtered to this column's x-range, up to the next bullet.
    per_number_text = {}
    for ci, xs in col_bullets.items():
        xs.sort()
        col_left = col_xs[ci] - 5
        col_right = col_left + col_width(ci)
        col_words = [w for w in body if col_left <= w["x0"] < col_right]
        for i, (y, n, x_bul) in enumerate(xs):
            y_end = xs[i+1][0] if i+1 < len(xs) else (ph - 40)
            text_words = [w for w in col_words
                          if y - Y_TOL <= w["top"] < y_end - Y_TOL
                          and not (w["top"] == y and w["x0"] == x_bul
                                   and w["text"] == f"{n}.")]
            text_words.sort(key=lambda w: (round(w["top"] / 2) * 2, w["x0"]))
            txt = " ".join(w["text"] for w in text_words)
            txt = re.sub(r'\s+', ' ', txt).strip()
            # Strip subgroup headers (they sit between standards, above a bullet)
            per_number_text[n] = txt
    # Build the all_text string so the downstream regex loop finds each
    # number and its text. Use a delimiter that won't appear in content.
    all_text = " ".join(f"{n}. {per_number_text[n]}"
                        for n in sorted(per_number_text))
    all_text = re.sub(r'\s+', ' ', all_text)
    # Find standards N. ... until next "N. " or subgroup header or sentinel
    # Build list of anticipated numbers
    expected_nums = [n for _, nums in strand_subgroups_order for n in nums]
    records = []
    # Regex to split: look for " <N>. " where N is 1-10
    # We'll greedily capture each standard's text by finding boundaries.
    # Split at headers we know to avoid embedding them.
    header_titles = [h for h, _ in strand_subgroups_order]
    # Build a regex that matches " N. " or any known header
    boundary_re = re.compile(
        r'(?<=\s)(?:' + '|'.join(re.escape(h) for h in header_titles) + r'|\d{1,2}\.\s)'
    )
    # Simpler approach: iterate through anticipated standard numbers and extract text between markers
    for n in expected_nums:
        # locate " n. " occurrence (with the dot+space) — but skip false matches from year refs
        pat = re.compile(r'(?<![0-9.])' + str(n) + r'\.\s')
        matches = list(pat.finditer(all_text))
        if not matches:
            continue
        # Take the first, or the one that's followed by a capital letter (start of standard text)
        chosen = None
        for m in matches:
            tail = all_text[m.end():m.end()+2]
            if tail and tail[0].isupper():
                chosen = m
                break
        if chosen is None:
            chosen = matches[0]
        start = chosen.end()
        # End at the next anticipated number or subgroup header
        end_candidates = []
        for m in re.finditer(r'(?<![0-9.])(\d{1,2})\.\s', all_text[start:]):
            try:
                if int(m.group(1)) != n:
                    end_candidates.append(start + m.start())
                    break
            except ValueError:
                pass
        for h in header_titles:
            idx = all_text.find(h, start)
            if idx > 0:
                end_candidates.append(idx)
        end = min(end_candidates) if end_candidates else len(all_text)
        text = all_text[start:end].strip()
        # Trim known footer / asterisk notes
        text = re.sub(r'\*Please see.*$', '', text).strip()
        text = re.sub(r'\*These broad.*$', '', text).strip()
        text = re.sub(r'Note on range.*$', '', text).strip()
        text = re.sub(r'College and Career Readiness.*$', '', text).strip()
        # Trim "Note on range and content" narrative that follows standard 10
        text = re.sub(r'\s+To build a foundation for college and career readiness.*$',
                      '', text).strip()
        # Trim a dangling asterisk footnote marker
        text = re.sub(r'\*\d*\s*$', '', text).strip()
        # Trim a dangling numeric footnote marker (no asterisk)
        text = re.sub(r'\s+\d{1,2}\s*$', '', text).strip()
        if not text or len(text) < 10:
            continue
        # Find subgroup for this number
        sub = None
        for h, nums in strand_subgroups_order:
            if n in nums:
                sub = h; break
        rec = {
            "code": f"CCRA.{ccr_strand}.{n}",
            "full_code": f"CCSS.ELA-LITERACY.CCRA.{ccr_strand}.{n}",
            "strand": f"CCRA.{ccr_strand}",
            "strand_name": f"CCR Anchor Standards for { 'Reading' if ccr_strand=='R' else ('Writing' if ccr_strand=='W' else ('Speaking and Listening' if ccr_strand=='SL' else 'Language')) }",
            "section": info["section"],
            "grade": None,
            "grade_band": None,
            "subgroup": sub,
            "number": n,
            "sub_letter": None,
            "parent_code": None,
            "anchor_code": None,
            "is_anchor": True,
            "ca_addition": False,
            "text": text,
            "source_page": page_no,
        }
        records.append(rec)
    return records


def main():
    all_records = []
    with pdfplumber.open(PDF_PATH) as pdf:
        for pnum in sorted(PAGE_MAP):
            if pnum > len(pdf.pages):
                continue
            ptype, info = PAGE_MAP[pnum]
            page = pdf.pages[pnum - 1]
            if ptype == "grade_table":
                recs = parse_grade_table_page(page, info, pnum)
            elif ptype == "anchor":
                recs = parse_anchor_page(page, info, pnum)
            else:
                recs = []
            all_records.extend(recs)
            print(f"p{pnum:3d} [{ptype}] -> {len(recs)} records", file=sys.stderr)

    seen = set()
    dedup = []
    for r in all_records:
        key = (r["code"], r["grade"], r["sub_letter"])
        if key in seen:
            continue
        seen.add(key)
        dedup.append(r)

    with open(OUT_DIR / "CA-ELA.json", "w") as f:
        json.dump(dedup, f, indent=2, ensure_ascii=False)

    meta = {
        "source_pdf": PDF_PATH.name,
        "source_label": "California Common Core State Standards: English Language Arts & Literacy (CDE, 2013 edition)",
        "generated_by": "tools/parse_ela.py",
        "strands": STRAND_NAMES,
        "subgroups": SUBGROUPS,
        "sections": sorted({r["section"] for r in dedup if r["section"]}),
    }
    with open(OUT_DIR / "CA-ELA.meta.json", "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"\nTotal records: {len(dedup)}", file=sys.stderr)
    from collections import Counter
    c_strand = Counter(r["strand"] for r in dedup)
    c_ca = sum(1 for r in dedup if r["ca_addition"])
    c_anc = sum(1 for r in dedup if r["is_anchor"])
    print(f"CA additions: {c_ca}", file=sys.stderr)
    print(f"Anchors: {c_anc}", file=sys.stderr)
    print(f"Per strand: {dict(c_strand)}", file=sys.stderr)


if __name__ == "__main__":
    main()

    seen = set()
    dedup = []
    for r in all_records:
        key = (r["code"], r["grade"], r["sub_letter"])
        if key in seen:
            continue
        seen.add(key)
        dedup.append(r)

    with open(OUT_DIR / "CA-ELA.json", "w") as f:
        json.dump(dedup, f, indent=2, ensure_ascii=False)

    meta = {
        "source_pdf": PDF_PATH.name,
        "source_label": "California Common Core State Standards: English Language Arts & Literacy (CDE, 2013 edition)",
        "generated_by": "tools/parse_ela.py",
        "strands": STRAND_NAMES,
        "subgroups": SUBGROUPS,
        "sections": sorted({r["section"] for r in dedup if r["section"]}),
    }
    with open(OUT_DIR / "CA-ELA.meta.json", "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"\nTotal records: {len(dedup)}", file=sys.stderr)
    from collections import Counter
    c_strand = Counter(r["strand"] for r in dedup)
    c_ca = sum(1 for r in dedup if r["ca_addition"])
    c_anc = sum(1 for r in dedup if r["is_anchor"])
    print(f"CA additions: {c_ca}", file=sys.stderr)
    print(f"Anchors: {c_anc}", file=sys.stderr)
    print(f"Per strand: {dict(c_strand)}", file=sys.stderr)


if __name__ == "__main__":
    main()
rand"] for r in dedup)
    c_ca = sum(1 for r in dedup if r["ca_addition"])
    c_anc = sum(1 for r in dedup if r["is_anchor"])
    print(f"CA additions: {c_ca}", file=sys.stderr)
    print(f"Anchors: {c_anc}", file=sys.stderr)
    print(f"Per strand: {dict(c_strand)}", file=sys.stderr)


if __name__ == "__main__":
    main()
 import Counter
    c_strand = Counter(r["strand"] for r in dedup)
    c_ca = sum(1 for r in dedup if r["ca_addition"])
    c_anc = sum(1 for r in dedup if r["is_anchor"])
    print(f"CA additions: {c_ca}", file=sys.stderr)
    print(f"Anchors: {c_anc}", file=sys.stderr)
    print(f"Per strand: {dict(c_strand)}", file=sys.stderr)


if __name__ == "__main__":
    main()
