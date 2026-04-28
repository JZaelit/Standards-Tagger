"""
Parse the California CCSS Mathematics PDF into leaf-level standard records.

Input:
  math-pdfs/MATH-CA-finalelaccssstandards.pdf
  (pre-extracted flat text at artifacts/math_extract/MATH-CA-finalelaccssstandards.txt
   via `pdftotext -layout`)

Output:
  categorized-standards/California/CA-MATH.json        — flat list of leaf records
  categorized-standards/California/CA-MATH.meta.json   — domain / category reference

Sections emitted:
  - "Mathematical Practices"     MP.1 .. MP.8 (+ MP.3.1 CA for higher math)
  - "K-8 Mathematics"            kindergarten through grade 8, by Domain/Cluster
  - "9-12 Mathematics"           from "Higher Mathematics Standards by Conceptual Category"
  - "Calculus (CA)"              California-only advanced content
  - "Adv. Probability & Statistics (CA)"  California-only advanced content

Pathway courses (Algebra I/II, Geometry, Mathematics I/II/III) are NOT emitted as
separate records — they are rearrangements of the same conceptual-category
standards and would duplicate.
"""
from __future__ import annotations
import json, re
from pathlib import Path

ROOT       = Path("/sessions/keen-lucid-heisenberg/mnt/Standards-Tagger")
TXT_PATH   = ROOT / "artifacts" / "math_extract" / "MATH-CA-finalelaccssstandards.txt"
OUT_DIR    = ROOT / "categorized-standards" / "California"
OUT_JSON   = OUT_DIR / "CA-MATH.json"
OUT_META   = OUT_DIR / "CA-MATH.meta.json"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------ #
# Reference metadata (canonical, stable — not extracted from text).
# ------------------------------------------------------------------ #

# K-8 domains, keyed by domain code. Includes which grades each domain appears in.
K8_DOMAINS = {
    "CC":  ("Counting and Cardinality",          ["K"]),
    "OA":  ("Operations and Algebraic Thinking", ["K","1","2","3","4","5"]),
    "NBT": ("Number and Operations in Base Ten", ["K","1","2","3","4","5"]),
    "NF":  ("Number and Operations—Fractions",   ["3","4","5"]),
    "MD":  ("Measurement and Data",              ["K","1","2","3","4","5"]),
    "G":   ("Geometry",                          ["K","1","2","3","4","5","6","7","8"]),
    "RP":  ("Ratios and Proportional Relationships", ["6","7"]),
    "NS":  ("The Number System",                 ["6","7","8"]),
    "EE":  ("Expressions and Equations",         ["6","7","8"]),
    "SP":  ("Statistics and Probability",        ["6","7","8"]),
    "F":   ("Functions",                         ["8"]),
}

# 9-12 conceptual categories and their domains.
HS_CATEGORIES = {
    "N": ("Number and Quantity", {
        "N-RN": "The Real Number System",
        "N-Q":  "Quantities",
        "N-CN": "The Complex Number System",
        "N-VM": "Vector and Matrix Quantities",
    }),
    "A": ("Algebra", {
        "A-SSE": "Seeing Structure in Expressions",
        "A-APR": "Arithmetic with Polynomials and Rational Expressions",
        "A-CED": "Creating Equations",
        "A-REI": "Reasoning with Equations and Inequalities",
    }),
    "F": ("Functions", {
        "F-IF": "Interpreting Functions",
        "F-BF": "Building Functions",
        "F-LE": "Linear, Quadratic, and Exponential Models",
        "F-TF": "Trigonometric Functions",
    }),
    "G": ("Geometry", {
        "G-CO":  "Congruence",
        "G-SRT": "Similarity, Right Triangles, and Trigonometry",
        "G-C":   "Circles",
        "G-GPE": "Expressing Geometric Properties with Equations",
        "G-GMD": "Geometric Measurement and Dimension",
        "G-MG":  "Modeling with Geometry",
    }),
    "S": ("Statistics and Probability", {
        "S-ID": "Interpreting Categorical and Quantitative Data",
        "S-IC": "Making Inferences and Justifying Conclusions",
        "S-CP": "Conditional Probability and the Rules of Probability",
        "S-MD": "Using Probability to Make Decisions",
    }),
}

# Mathematical Practices (text is stable across all CCSS-M jurisdictions).
MATH_PRACTICES = [
    ("MP.1", "Make sense of problems and persevere in solving them."),
    ("MP.2", "Reason abstractly and quantitatively."),
    ("MP.3", "Construct viable arguments and critique the reasoning of others."),
    ("MP.4", "Model with mathematics."),
    ("MP.5", "Use appropriate tools strategically."),
    ("MP.6", "Attend to precision."),
    ("MP.7", "Look for and make use of structure."),
    ("MP.8", "Look for and express regularity in repeated reasoning."),
]

# California-specific practice added to MP.3 for higher mathematics.
MP_3_1_CA = (
    "MP.3.1",
    "Students build proofs by induction and proofs by contradiction. "
    "(For higher mathematics only.)"
)

GRADE_BAND = {
    "K":"K-5", "1":"K-5", "2":"K-5", "3":"K-5", "4":"K-5", "5":"K-5",
    "6":"6-8", "7":"6-8", "8":"6-8",
    "9-12":"9-12",
}

# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #

def clean_text(s: str) -> str:
    # collapse whitespace, trim
    return re.sub(r"\s+", " ", s).strip()

def full_code(code: str, section: str) -> str:
    """Construct a fully-qualified identifier used for display only."""
    if section == "Mathematical Practices":
        return f"CCSS.MATH.PRACTICE.{code}"
    return f"CCSS.MATH.CONTENT.{code}"

def is_ca_addition(text: str) -> bool:
    # CA marker is a trailing " CA" or " CA." on the LAST line of the standard.
    return bool(re.search(r"\bCA\.?\s*$", text))

def strip_ca_marker(text: str) -> str:
    return re.sub(r"\s*CA\.?\s*$", "", text).strip()

def is_modeling(text: str) -> bool:
    # ★ marker or the word "★" (escaped as \u2605) indicates modeling standard.
    return "\u2605" in text or "★" in text

def is_plus(text: str) -> bool:
    # "(+)" at start indicates an advanced / STEM-track standard.
    return bool(re.match(r"^\s*\(\+\)\s+", text))

def strip_markers(text: str) -> str:
    text = re.sub(r"^\s*\(\+\)\s+", "", text)
    text = text.replace("\u2605", "").replace("★", "")
    return text.strip()

# ------------------------------------------------------------------ #
# Text loading & line filtering
# ------------------------------------------------------------------ #

def load_lines() -> list[str]:
    with open(TXT_PATH, encoding="utf-8") as f:
        return f.read().splitlines()

# Lines that are page headers, footers, or decorative should be filtered when
# walking sections. Patterns include "10 | K–8 Standards", grade headers at top
# of each page ("K Kindergarten", "Grade 3"), and a few decorative markers.
HEADER_FOOTER_PATTERNS = [
    re.compile(r"^\s*\d+\s*\|\s*"),                    # "10 | K-8 Standards"
    re.compile(r"^\s*K–?8 Standards\b"),               # "K-8 Standards | 11"
    re.compile(r"K–?8 Standards\s*\|\s*\d+\s*$"),      # "... K-8 Standards | 37"
    re.compile(r"Higher Mathematics (Standards|Courses)\s*\|?"),
    re.compile(r"\|\s*Higher Mathematics"),
    re.compile(r"^\s*(Kindergarten|Grade [0-9])\s+[K1-8]?\s*$"),
    # "Grade 5  ...  K-8 Standards | 37"
    re.compile(r"^\s*(Kindergarten|Grade\s+[0-9]).{5,}K–?8 Standards"),
    # "                ...  Grade 5             5"
    re.compile(r"\bGrade\s+[0-9]\s+[K0-9]\s*$"),
    # "  5 Grade 5"  — page top line
    re.compile(r"^\s+[K0-9]\s+(Kindergarten|Grade\s+[0-9])\s*$"),
    re.compile(r"^\s*Conceptual Category\s*$"),
    re.compile(r"^\s*$"),
]

def is_header_footer(line: str) -> bool:
    return any(p.search(line) for p in HEADER_FOOTER_PATTERNS)

# ------------------------------------------------------------------ #
# Parser: Mathematical Practices
# ------------------------------------------------------------------ #

def build_practice_records() -> list[dict]:
    records = []
    for code, text in MATH_PRACTICES:
        n = int(code.split(".")[1])
        records.append({
            "code": code,
            "full_code": full_code(code, "Mathematical Practices"),
            "section": "Mathematical Practices",
            "grade": None,
            "grade_band": None,
            "category": None,
            "category_name": None,
            "domain": None,
            "domain_code": None,
            "domain_name": None,
            "cluster_letter": None,
            "cluster": None,
            "number": n,
            "sub_letter": None,
            "parent_code": None,
            "is_practice": True,
            "ca_addition": False,
            "plus_standard": False,
            "modeling": False,
            "text": text,
        })
    # CA-specific MP.3.1
    code, text = MP_3_1_CA
    records.append({
        "code": code,
        "full_code": full_code(code, "Mathematical Practices"),
        "section": "Mathematical Practices",
        "grade": "9-12",
        "grade_band": "9-12",
        "category": None,
        "category_name": None,
        "domain": None,
        "domain_code": None,
        "domain_name": None,
        "cluster_letter": None,
        "cluster": None,
        "number": 3,
        "sub_letter": "1",
        "parent_code": "MP.3",
        "is_practice": True,
        "ca_addition": True,
        "plus_standard": False,
        "modeling": False,
        "text": text,
    })
    return records

# ------------------------------------------------------------------ #
# Parser: K-8 and 9-12 content standards
# ------------------------------------------------------------------ #

# Regex to detect a standard-number line: leading integer followed by "." and a space.
# Accepts an optional (+) marker and optional sub-letter on following lines.
STANDARD_NUM_RE = re.compile(r"^\s*(\d+)\.\s+(.*?)\s*$")
# Sub-letter like "a. ..." or "b. ..." — allow leading whitespace.
SUB_LETTER_RE   = re.compile(r"^\s*([a-z])\.\s+(.*?)\s*$")
# CA-added standard with a decimal form like "7.1 Use estimation..." or "8.1 Derive..."
DECIMAL_STD_RE  = re.compile(r"^(\d{1,2})\.(\d{1,2})\s+([A-Z][^\n]*?)\s*$")

# K-8 domain header pattern: e.g., "Counting and Cardinality                K.CC"
# We detect it via the trailing domain code on the right.
K8_DOMAIN_RE = re.compile(r"^(.*?)\s{2,}([K1-8])\.(CC|OA|NBT|NF|MD|G|RP|NS|EE|SP|F)\s*$")
# 9-12 domain header pattern: trailing code like N-RN, A-SSE, F-IF, G-CO, S-ID.
HS_DOMAIN_RE = re.compile(r"^(.*?)\s{2,}([NAFGS])-(RN|Q|CN|VM|SSE|APR|CED|REI|IF|BF|LE|TF|CO|SRT|C|GPE|GMD|MG|ID|IC|CP|MD)\s*$")

# Grade markers (one per page — single-line with grade label only)
GRADE_MARKER_RE = re.compile(r"^\s+(K)\s+Kindergarten\s*$|^\s+Grade\s+([1-8])\s*$|^\s+([1-8])\s+Grade\s+[1-8]\s*$")

# Conceptual category markers (in the "Higher Mathematics ... by Conceptual Category" section)
HS_CATEGORY_RE = re.compile(
    r"^\s+(Number and Quantity|Algebra|Functions|Geometry|Statistics and Probability)\s+([NAFGS])\s*$"
)
# Also match the "big" standalone category heading
HS_CATEGORY_BIG_RE = re.compile(
    r"^\s*(Number and Quantity|Algebra|Functions|Modeling|Geometry|Statistics and Probability)\s*$"
)


def is_cluster_heading_start(line: str) -> bool:
    """A cluster-heading START is an unnumbered, left-aligned line beginning with
    a capital letter that isn't a numbered standard, sub-letter, domain header,
    or decoration. May or may not end with a period (multi-line headings end on
    a later line)."""
    t = line.strip()
    if not t:
        return False
    if STANDARD_NUM_RE.match(t) or SUB_LETTER_RE.match(t) or DECIMAL_STD_RE.match(t):
        return False
    if K8_DOMAIN_RE.match(line) or HS_DOMAIN_RE.match(line):
        return False
    if is_header_footer(line):
        return False
    # Cluster headings in this PDF are always at column 0 (left-aligned).
    # Indented lines (e.g. "Example: ...") are continuations, not cluster heads.
    leading = len(line) - len(line.lstrip(" "))
    if leading != 0:
        return False
    if not t[0].isalpha() or not t[0].isupper():
        return False
    if "|" in t or "..." in t:
        return False
    if len(t) > 250:
        return False
    # Reject lines that are obviously continuations / examples
    if t.startswith(("Example:", "Examples:", "For example", "e.g.", "i.e.")):
        return False
    return True


# Trailing footnote marker like ".4" or ".32" (superscript footnote glyphs
# get extracted as inline digits attached after the terminating period).
_FOOTNOTE_TAIL_RE = re.compile(r"\.(\d{1,2})\s*$")


def _strip_footnote_tail(text: str) -> str:
    """Remove a trailing footnote-marker (e.g. ".4") attached to a heading
    that originally ended with a period in the source PDF."""
    m = _FOOTNOTE_TAIL_RE.search(text)
    if m:
        return text[: m.start()] + "."
    return text


def _heading_terminated(text: str) -> bool:
    """Heading is terminated when the (footnote-stripped) text ends with `.`"""
    return _strip_footnote_tail(text).rstrip().endswith(".")


def collect_cluster_heading(lines: list[str], start: int) -> tuple[str, int] | None:
    """Try to read a (possibly multi-line) cluster heading starting at `start`.

    Returns (heading_text, next_index) or None if the line at `start` doesn't
    start a cluster heading. A heading is at most 3 lines and ends on the line
    where the accumulated text ends with a period (a trailing footnote-marker
    digit, e.g. ".4", is tolerated and stripped from the returned heading).
    The continuation lines must be left-aligned (≤ 6 leading spaces) and not
    match other element patterns.
    """
    if start >= len(lines):
        return None
    if not is_cluster_heading_start(lines[start]):
        return None
    parts = [lines[start].strip()]
    j = start + 1
    if _heading_terminated(parts[0]):
        return (_strip_footnote_tail(parts[0]), j)
    # Look ahead up to 3 continuation lines
    for _ in range(3):
        if j >= len(lines):
            break
        nxt = lines[j]
        if not nxt.strip():
            j += 1
            continue
        # Continuation must NOT match any other element pattern.
        if (STANDARD_NUM_RE.match(nxt) or SUB_LETTER_RE.match(nxt)
            or DECIMAL_STD_RE.match(nxt) or K8_DOMAIN_RE.match(nxt)
            or HS_DOMAIN_RE.match(nxt) or is_header_footer(nxt)):
            break
        leading = len(nxt) - len(nxt.lstrip(" "))
        if leading > 6:
            break
        parts.append(nxt.strip())
        j += 1
        if _heading_terminated(parts[-1]):
            joined = " ".join(parts)
            return (_strip_footnote_tail(joined), j)
    # Didn't find a terminating period — not a cluster heading
    return None


def walk_section(
    lines: list[str],
    start: int,
    end: int,
    *,
    section: str,
    domain_set: dict,        # map of expected domain-codes → (name, [grades])  (K-8) or full_name (HS)
    is_k8: bool,
) -> list[dict]:
    """Walk a slice of text lines and emit leaf-level standard records.

    Uses a simple state machine tracking the current grade/category/domain/cluster,
    accumulating multi-line standard text until a new element begins.
    """
    records: list[dict] = []

    grade = None            # K-8: "K".."8"; HS: "9-12"
    grade_band = None
    category = None
    category_name = None
    domain = None
    domain_code = None      # e.g., "3.OA" or "N-RN"
    domain_name = None
    cluster_letter_idx = 0  # auto-incremented per new cluster within a domain
    cluster = None

    # Current standard being assembled.
    cur_num = None
    cur_sub = None
    cur_text_parts: list[str] = []
    cur_decimal_suffix = None  # for CA decimal-style standards like "8.1"
    # Highest top-level standard number seen in the current cluster — used to
    # detect numbered footnotes (which restart at 1 below a long gap).
    max_num_in_cluster = 0
    blank_run = 0

    def flush_current():
        nonlocal cur_num, cur_sub, cur_text_parts, cur_decimal_suffix, cluster_letter_idx
        if cur_num is None:
            return
        text_joined = clean_text(" ".join(cur_text_parts))
        if not text_joined:
            cur_num = cur_sub = None
            cur_text_parts = []
            cur_decimal_suffix = None
            return

        # Inspect markers
        ca_flag = is_ca_addition(text_joined)
        modeling_flag = is_modeling(text_joined)
        plus_flag = is_plus(text_joined)

        # Clean up text
        text_clean = strip_markers(text_joined)
        if ca_flag:
            text_clean = strip_ca_marker(text_clean)
        text_clean = clean_text(text_clean)

        # Build code
        cluster_letter = chr(ord("A") + cluster_letter_idx) if cluster is not None else None

        if is_k8:
            if cur_decimal_suffix:
                code = f"{grade}.{domain}.{cur_num}.{cur_decimal_suffix}"
            else:
                if cluster_letter:
                    code = f"{grade}.{domain}.{cluster_letter}.{cur_num}"
                else:
                    code = f"{grade}.{domain}.{cur_num}"
            if cur_sub:
                code = f"{code}.{cur_sub}"
        else:
            # 9-12: domain_code already has form like "N-RN"
            if cur_decimal_suffix:
                code = f"{domain_code}.{cur_num}.{cur_decimal_suffix}"
            else:
                if cluster_letter:
                    code = f"{domain_code}.{cluster_letter}.{cur_num}"
                else:
                    code = f"{domain_code}.{cur_num}"
            if cur_sub:
                code = f"{code}.{cur_sub}"

        parent_code = None
        if cur_sub:
            # parent is same code without the .{sub_letter} suffix
            parent_code = code[:-(len(cur_sub) + 1)]

        records.append({
            "code": code,
            "full_code": full_code(code, section),
            "section": section,
            "grade": grade,
            "grade_band": grade_band,
            "category": category,
            "category_name": category_name,
            "domain": domain,
            "domain_code": domain_code,
            "domain_name": domain_name,
            "cluster_letter": cluster_letter,
            "cluster": cluster,
            "number": cur_num,
            "sub_letter": cur_sub,
            "parent_code": parent_code,
            "is_practice": False,
            "ca_addition": ca_flag,
            "plus_standard": plus_flag,
            "modeling": modeling_flag,
            "text": text_clean,
        })
        cur_num = cur_sub = None
        cur_text_parts = []
        cur_decimal_suffix = None

    i = start
    while i < end:
        line = lines[i]
        stripped = line.strip()

        # Track blank lines for footnote heuristics
        if not stripped:
            blank_run += 1
            i += 1
            continue

        # K-8: detect grade marker BEFORE header_footer skip (the "K Kindergarten"
        # / "Grade N" marker also matches some header_footer patterns, and the
        # grade marker is what establishes the current grade for emitted records).
        if is_k8:
            m = re.match(r"^\s+K\s+Kindergarten\s*$", line)
            if m:
                flush_current()
                grade = "K"
                grade_band = "K-5"
                domain = domain_code = domain_name = None
                cluster = None
                cluster_letter_idx = 0
                blank_run += 1
                i += 1
                continue
            m = re.match(r"^\s+Grade\s+([1-8])\s*$", line)
            if m:
                flush_current()
                grade = m.group(1)
                grade_band = GRADE_BAND[grade]
                domain = domain_code = domain_name = None
                cluster = None
                cluster_letter_idx = 0
                blank_run += 1
                i += 1
                continue
            # Per-page header like "1 Grade 1" — only set if grade not yet known
            m = re.match(r"^\s+([K1-8])\s+(Kindergarten|Grade [1-8])\s*$", line)
            if m and grade is None:
                g = m.group(1)
                grade = g
                grade_band = GRADE_BAND[g] if g != "K" else "K-5"
                blank_run += 1
                i += 1
                continue

        if is_header_footer(line):
            blank_run += 1  # treat headers/footers as blank for gap detection
            i += 1
            continue

        # HS-only: conceptual category markers. K-8 must NEVER fall through here
        # (a stray "Geometry" / "Algebra" line in a K-8 grade overview would
        # otherwise hijack `grade` to "9-12" and break the rest of the section).
        if not is_k8:
            m = HS_CATEGORY_RE.match(line)
            if m:
                flush_current()
                name, letter = m.group(1), m.group(2)
                category = letter
                category_name = name
                grade = "9-12"
                grade_band = "9-12"
                domain = domain_code = domain_name = None
                cluster = None
                cluster_letter_idx = 0
                i += 1
                continue
            m = HS_CATEGORY_BIG_RE.match(line)
            if m and category_name != m.group(1):
                name = m.group(1)
                for letter, (n, _doms) in HS_CATEGORIES.items():
                    if n == name:
                        flush_current()
                        category = letter
                        category_name = name
                        grade = "9-12"
                        grade_band = "9-12"
                        domain = domain_code = domain_name = None
                        cluster = None
                        cluster_letter_idx = 0
                        break
                i += 1
                continue

        # Domain header (K-8 or HS)
        if is_k8:
            m = K8_DOMAIN_RE.match(line)
            if m:
                flush_current()
                dom_grade, dom_code = m.group(2), m.group(3)
                # validate domain applies to this grade
                if dom_code in K8_DOMAINS and grade == dom_grade:
                    domain = dom_code
                    domain_code = f"{dom_grade}.{dom_code}"
                    domain_name = K8_DOMAINS[dom_code][0]
                    cluster = None
                    cluster_letter_idx = 0
                i += 1
                continue
        else:
            m = HS_DOMAIN_RE.match(line)
            if m:
                flush_current()
                cat_letter, dom_suffix = m.group(2), m.group(3)
                dom_code_full = f"{cat_letter}-{dom_suffix}"
                cat_block = HS_CATEGORIES.get(cat_letter)
                if cat_block and dom_code_full in cat_block[1]:
                    category = cat_letter
                    category_name = cat_block[0]
                    domain = dom_suffix
                    domain_code = dom_code_full
                    domain_name = cat_block[1][dom_code_full]
                    cluster = None
                    cluster_letter_idx = 0
                i += 1
                continue

        # Cluster heading detection (must come BEFORE continuation branch so that
        # left-aligned sentence-case lines reset the standard accumulator).
        # Supports multi-line headings via lookahead.
        ch = collect_cluster_heading(lines, i) if domain is not None else None
        if ch is not None:
            heading, j = ch
            flush_current()
            cluster = heading
            seen = []
            for r in records:
                if r.get("domain_code") == domain_code and r.get("cluster"):
                    if r["cluster"] not in seen:
                        seen.append(r["cluster"])
            cluster_letter_idx = len(seen)
            max_num_in_cluster = 0
            blank_run = 0
            i = j
            continue

        # Numbered standard (top-level)
        m = STANDARD_NUM_RE.match(line)
        if m and cluster is not None:
            num = int(m.group(1))
            # Footnote-block heuristic: numbered lines at column 0 are
            # sometimes footnotes (e.g. "5. Grade 3 expectations in this
            # domain are limited to..."), not standards. They are
            # distinguished from real standards by either:
            #   (a) the number regressing below the cluster's running max
            #       (e.g. cluster only has 1, 2 but a "1." appears again), or
            #   (b) the number coming after a long blank gap (≥3) AND a
            #       page-header line following soon (within ~12 non-blank
            #       lines) without an intervening cluster heading or domain
            #       header. This catches non-regressing footnotes like
            #       3.MD's 5/6/7 that follow standard 2.
            is_footnote = False
            regressed = num <= max_num_in_cluster
            if regressed or blank_run >= 3:
                # A regression with a clear gap (≥2 blanks) is already a
                # strong footnote signal — skip the look-ahead.
                if regressed and blank_run >= 2:
                    is_footnote = True
                else:
                    saw_header = False
                    saw_cluster = False
                    for k in range(1, 13):
                        if i + k >= end:
                            break
                        nxt = lines[i + k]
                        if not nxt.strip():
                            continue
                        if is_header_footer(nxt):
                            saw_header = True
                            break
                        # If we see a cluster heading start before a header,
                        # this is a real standard, not a footnote.
                        if is_cluster_heading_start(nxt):
                            saw_cluster = True
                            break
                        if K8_DOMAIN_RE.match(nxt) or HS_DOMAIN_RE.match(nxt):
                            saw_cluster = True
                            break
                    is_footnote = saw_header and not saw_cluster
            if is_footnote:
                # Enter footnote-skip mode: consume this and any subsequent
                # numbered/blank/continuation lines until a page header,
                # cluster heading, or domain header is reached.
                blank_run = 0
                j = i
                while j < end:
                    ln = lines[j]
                    if is_header_footer(ln):
                        j += 1
                        break
                    if K8_DOMAIN_RE.match(ln) or HS_DOMAIN_RE.match(ln):
                        break
                    if j != i and is_cluster_heading_start(ln):
                        break
                    j += 1
                i = j
                continue
            flush_current()
            cur_num = num
            cur_sub = None
            cur_decimal_suffix = None
            cur_text_parts = [m.group(2)]
            if num > max_num_in_cluster:
                max_num_in_cluster = num
            blank_run = 0
            i += 1
            continue

        # Decimal-suffix CA standard (e.g., "7.1 Use estimation ...")
        m = DECIMAL_STD_RE.match(line)
        if m and cluster is not None:
            flush_current()
            cur_num = int(m.group(1))
            cur_decimal_suffix = m.group(2)
            cur_sub = None
            cur_text_parts = [m.group(3)]
            blank_run = 0
            i += 1
            continue

        # Sub-letter bullet — emits previous (parent or sub) then starts a new sub
        m = SUB_LETTER_RE.match(line)
        if m and cur_num is not None:
            sub_text = m.group(2)
            saved_num = cur_num
            saved_decimal = cur_decimal_suffix
            flush_current()
            cur_num = saved_num
            cur_decimal_suffix = saved_decimal
            cur_sub = m.group(1)
            cur_text_parts = [sub_text]
            blank_run = 0
            i += 1
            continue

        # Continuation of current standard/sub — indented text line.
        if cur_num is not None and (line.startswith(" ") or line.startswith("\t")):
            cur_text_parts.append(stripped)
            blank_run = 0
            i += 1
            continue

        # Unrecognized line — skip (also flushes any accumulated standard if we
        # hit a left-aligned non-cluster line, treating it as a hard boundary).
        if cur_num is not None and stripped and not line.startswith(" "):
            flush_current()
        i += 1

    flush_current()
    return records


# ------------------------------------------------------------------ #
# Main
# ------------------------------------------------------------------ #

def find_line(lines: list[str], pattern: str, start: int = 0) -> int | None:
    rx = re.compile(pattern)
    for i in range(start, len(lines)):
        if rx.search(lines[i]):
            return i
    return None


def _counts_by(records, key):
    out = {}
    for r in records:
        val = r.get(key)
        out[val] = out.get(val, 0) + 1
    # JSON keys must be strings
    return {("null" if k is None else str(k)): v for k, v in out.items()}


# Canonical CCSS-M modeling standards (★ in the published standards).
# The PDF's star glyph is dropped during pdftotext extraction, so we
# re-apply modeling flags by code matching. Codes use the form
# DOMAIN.CLUSTER.NUMBER (e.g., "N-Q.A.1").
MODELING_CODES = {
    # Number and Quantity
    "N-Q.A.1", "N-Q.A.2", "N-Q.A.3",
    # Algebra
    "A-SSE.A.1", "A-SSE.B.3", "A-SSE.B.4",
    "A-CED.A.1", "A-CED.A.2", "A-CED.A.3", "A-CED.A.4",
    "A-REI.D.11",
    # Functions
    "F-IF.B.4", "F-IF.B.5", "F-IF.B.6",
    "F-BF.A.1",
    "F-LE.A.1", "F-LE.A.2", "F-LE.B.5",
    "F-TF.B.5", "F-TF.B.7",
    # Geometry
    "G-SRT.C.8",
    "G-C.B.5",
    "G-GPE.B.7",
    "G-GMD.A.3",
    "G-MG.A.1", "G-MG.A.2", "G-MG.A.3",
    # Statistics and Probability
    "S-ID.A.1", "S-ID.A.2", "S-ID.A.3", "S-ID.A.4",
    "S-ID.B.5", "S-ID.B.6",
    "S-ID.C.7", "S-ID.C.8", "S-ID.C.9",
    "S-IC.A.1", "S-IC.A.2",
    "S-IC.B.3", "S-IC.B.4", "S-IC.B.5", "S-IC.B.6",
    "S-CP.A.1", "S-CP.A.2", "S-CP.A.3", "S-CP.A.4", "S-CP.A.5",
    "S-CP.B.6", "S-CP.B.7",
    "S-MD.A.1", "S-MD.A.2", "S-MD.A.3", "S-MD.A.4",
    "S-MD.B.5", "S-MD.B.6", "S-MD.B.7",
}


def main():
    lines = load_lines()

    # Locate section boundaries.
    # K-8 section starts at Kindergarten page (~line 556 "K Kindergarten")
    k8_start = find_line(lines, r"^\s+K\s+Kindergarten\s*$")
    # K-8 section ends where the Higher Mathematics Standards section starts
    hs_overview_start = find_line(lines, r"^\s*Higher Mathematics Standards\s*$")
    hs_cc_start = find_line(lines, r"^Higher Mathematics\s*$", start=k8_start or 0)
    # We want the "by Conceptual Category" section specifically — it starts with
    # "Higher Mathematics" then "Standards" then "by Conceptual Category".
    hs_by_cc_start = None
    for i in range(len(lines) - 2):
        if (lines[i].strip() == "Higher Mathematics"
            and lines[i+1].strip() == "Standards"
            and lines[i+2].strip() == "by Conceptual Category"):
            hs_by_cc_start = i
            break

    # Glossary (end of content)
    glossary_start = find_line(lines, r"^\s*Glossary\s*$", start=(hs_by_cc_start or 0) + 100)

    # K-8 ends at the start of the Higher Mathematics section.
    # That section header is split across two lines: "Higher Mathematics" then "Standards".
    k8_end = None
    for i in range((k8_start or 0) + 100, len(lines) - 1):
        if (lines[i].strip() == "Higher Mathematics"
            and lines[i+1].strip() == "Standards"):
            k8_end = i
            break
    if k8_end is None:
        k8_end = hs_by_cc_start or len(lines)

    records: list[dict] = []

    # 1. Mathematical Practices (hard-coded text)
    records.extend(build_practice_records())

    # 2. K-8 content
    if k8_start is not None:
        k8_records = walk_section(
            lines, k8_start, k8_end,
            section="K-8 Mathematics",

            domain_set={k: v[0] for k, v in K8_DOMAINS.items()},
            is_k8=True,
        )
        records.extend(k8_records)

    # 3. 9-12 content (conceptual-category section)
    if hs_by_cc_start is not None:
        hs_end = glossary_start if glossary_start is not None else len(lines)
        hs_domain_set = {dom: name for _c, (_n, doms) in HS_CATEGORIES.items() for dom, name in doms.items()}
        hs_records = walk_section(
            lines, hs_by_cc_start, hs_end,
            section="9-12 Mathematics",
            domain_set=hs_domain_set,
            is_k8=False,
        )
        records.extend(hs_records)

    # Post-processing: mark canonical CCSS-M modeling standards (the PDF's
    # star glyph is dropped during text extraction).
    for r in records:
        dom = r.get("domain_code")
        cl  = r.get("cluster_letter")
        num = r.get("number")
        if dom and cl and num is not None:
            key = f"{dom}.{cl}.{num}"
            if key in MODELING_CODES:
                r["modeling"] = True

    # Write output
    OUT_JSON.write_text(json.dumps(records, indent=2, ensure_ascii=False))

    meta = {
        "source_pdf": "math-pdfs/MATH-CA-finalelaccssstandards.pdf",
        "source_label": "California Common Core State Standards: Mathematics (CDE, 2013 edition, electronic 2014)",
        "generated_by": "tools/parse_math.py",
        "sections": sorted({r["section"] for r in records}),
        "k8_domains": {k: v[0] for k, v in K8_DOMAINS.items()},
        "hs_categories": {
            cat: {"name": name, "domains": doms}
            for cat, (name, doms) in HS_CATEGORIES.items()
        },
        "record_counts": {
            "total": len(records),
            "by_section":  _counts_by(records, "section"),
            "by_grade":    _counts_by(records, "grade"),
            "ca_additions":      sum(1 for r in records if r.get("ca_addition")),
            "plus_standards":    sum(1 for r in records if r.get("plus_standard")),
            "modeling_standards": sum(1 for r in records if r.get("modeling")),
            "sub_bullets":       sum(1 for r in records if r.get("sub_letter")),
        },
    }
    OUT_META.write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    print(f"wrote {len(records)} records -> {OUT_JSON}")
    print(f"wrote meta -> {OUT_META}")
    print()
    print("record counts:")
    for k, v in meta["record_counts"].items():
        if isinstance(v, dict):
            for kk, vv in sorted(v.items(), key=lambda x: (str(x[0]) if x[0] is not None else "")):
                print(f"  {k}.{kk}: {vv}")
        else:
            print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
