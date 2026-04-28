"""
Parse the NGSS Combined Standards PDF into leaf-level Performance
Expectation records.

Input:
  raw-pdfs/NGSS Combined Standards.pdf   (DCI Arrangements, K-12)

Output:
  categorized-standards/California/CA-NGSS.json
  categorized-standards/California/CA-NGSS.meta.json

Notes:
  - California adopted NGSS verbatim in 2013, so CA-NGSS == NGSS at the
    K-12 leaf level. CA clarification statements (in the three
    SCIENCE*-CA PDFs for HS Earth/Life/Physical) can be merged in v2.
  - Each NGSS Performance Expectation is one record. SEPs / DCIs / CCCs
    are not emitted as separate leaves.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

ROOT      = Path("/sessions/keen-lucid-heisenberg/mnt/Standards-Tagger")
PDF_PATH  = ROOT / "raw-pdfs" / "NGSS Combined Standards.pdf"
OUT_DIR   = ROOT / "categorized-standards" / "California"
OUT_JSON  = OUT_DIR / "CA-NGSS.json"
OUT_META  = OUT_DIR / "CA-NGSS.meta.json"
DEBUG_TXT = ROOT / "artifacts" / "science_extract" / "ngss_full.txt"
OUT_DIR.mkdir(parents=True, exist_ok=True)


DOMAIN_NAMES = {
    "PS":  "Physical Sciences",
    "LS":  "Life Sciences",
    "ESS": "Earth and Space Sciences",
    "ETS": "Engineering, Technology, and Applications of Science",
}

# Canonical NGSS topic-name table (used as fallback when PDF extraction
# garbles the topic header line).
TOPIC_NAMES = {
    # K
    "K-PS2":  "Motion and Stability: Forces and Interactions",
    "K-PS3":  "Energy",
    "K-LS1":  "From Molecules to Organisms: Structures and Processes",
    "K-ESS2": "Earth's Systems",
    "K-ESS3": "Earth and Human Activity",
    # 1
    "1-PS4":  "Waves and their Applications in Technologies for Information Transfer",
    "1-LS1":  "From Molecules to Organisms: Structures and Processes",
    "1-LS3":  "Heredity: Inheritance and Variation of Traits",
    "1-ESS1": "Earth's Place in the Universe",
    # 2
    "2-PS1":  "Matter and Its Interactions",
    "2-LS2":  "Ecosystems: Interactions, Energy, and Dynamics",
    "2-LS4":  "Biological Evolution: Unity and Diversity",
    "2-ESS1": "Earth's Place in the Universe",
    "2-ESS2": "Earth's Systems",
    # 3
    "3-PS2":  "Motion and Stability: Forces and Interactions",
    "3-LS1":  "From Molecules to Organisms: Structures and Processes",
    "3-LS2":  "Ecosystems: Interactions, Energy, and Dynamics",
    "3-LS3":  "Heredity: Inheritance and Variation of Traits",
    "3-LS4":  "Biological Evolution: Unity and Diversity",
    "3-ESS2": "Earth's Systems",
    "3-ESS3": "Earth and Human Activity",
    # 4
    "4-PS3":  "Energy",
    "4-PS4":  "Waves and their Applications in Technologies for Information Transfer",
    "4-LS1":  "From Molecules to Organisms: Structures and Processes",
    "4-ESS1": "Earth's Place in the Universe",
    "4-ESS2": "Earth's Systems",
    "4-ESS3": "Earth and Human Activity",
    # 5
    "5-PS1":  "Matter and Its Interactions",
    "5-PS2":  "Motion and Stability: Forces and Interactions",
    "5-PS3":  "Energy",
    "5-LS1":  "From Molecules to Organisms: Structures and Processes",
    "5-LS2":  "Ecosystems: Interactions, Energy, and Dynamics",
    "5-ESS1": "Earth's Place in the Universe",
    "5-ESS2": "Earth's Systems",
    "5-ESS3": "Earth and Human Activity",
    # K-2 and 3-5 combined ETS
    "K-2-ETS1": "Engineering Design",
    "3-5-ETS1": "Engineering Design",
    # MS
    "MS-PS1":  "Matter and Its Interactions",
    "MS-PS2":  "Motion and Stability: Forces and Interactions",
    "MS-PS3":  "Energy",
    "MS-PS4":  "Waves and their Applications in Technologies for Information Transfer",
    "MS-LS1":  "From Molecules to Organisms: Structures and Processes",
    "MS-LS2":  "Ecosystems: Interactions, Energy, and Dynamics",
    "MS-LS3":  "Heredity: Inheritance and Variation of Traits",
    "MS-LS4":  "Biological Evolution: Unity and Diversity",
    "MS-ESS1": "Earth's Place in the Universe",
    "MS-ESS2": "Earth's Systems",
    "MS-ESS3": "Earth and Human Activity",
    "MS-ETS1": "Engineering Design",
    # HS
    "HS-PS1":  "Matter and Its Interactions",
    "HS-PS2":  "Motion and Stability: Forces and Interactions",
    "HS-PS3":  "Energy",
    "HS-PS4":  "Waves and their Applications in Technologies for Information Transfer",
    "HS-LS1":  "From Molecules to Organisms: Structures and Processes",
    "HS-LS2":  "Ecosystems: Interactions, Energy, and Dynamics",
    "HS-LS3":  "Heredity: Inheritance and Variation of Traits",
    "HS-LS4":  "Biological Evolution: Unity and Diversity",
    "HS-ESS1": "Earth's Place in the Universe",
    "HS-ESS2": "Earth's Systems",
    "HS-ESS3": "Earth and Human Activity",
    "HS-ETS1": "Engineering Design",
}


def grade_and_band(prefix):
    """Map a topic-prefix ('K', '1', ..., 'K-2', '3-5', 'MS', 'HS') to
    (grade, grade_band)."""
    if prefix in ("K-2", "3-5"):
        return prefix, "K-5"
    if prefix in ("MS", "HS"):
        return prefix, prefix
    if prefix in ("K", "1", "2", "3", "4", "5"):
        return prefix, "K-5"
    return prefix, prefix


# ------- Extract text from PDF -------

def extract_full_text(pdf_path):
    r = PdfReader(str(pdf_path))
    pages = []
    for i, p in enumerate(r.pages):
        pages.append(p.extract_text() or "")
    return "\n".join(pages), len(r.pages)


def normalize(text):
    """Collapse whitespace runs to a single space; the NGSS PDF has lots
    of internal multi-space and broken-line artifacts."""
    return re.sub(r"\s+", " ", text).strip()


# ------- Parse Performance Expectations -------

PE_CODE_RE = re.compile(
    r"((?:K-2|3-5|HS|MS|K|[1-5])-(?:PS|LS|ESS|ETS)\d+)-(\d+)\.\s+"
)
# End-of-PE-region markers we should stop at when capturing a PE statement.
# These phrases reliably appear AFTER all PEs in a topic block.
END_MARKERS = re.compile(
    r"The performance expectations above were developed"
    r"|Science and Engineering Practices"
    r"|Disciplinary Core Ideas"
    r"|Crosscutting Concepts"
    r"|Connections to other DCIs"
    r"|Articulation to DCIs"
    r"|Common Core State Standards Connections"
)


def parse_pes(text):
    """Walk the normalized text, emit (topic_code, pe_number, raw_pe_block)
    triples covering each PE's statement + bracketed annotations."""
    norm = normalize(text)
    matches = list(PE_CODE_RE.finditer(norm))
    out = []
    for i, m in enumerate(matches):
        topic = m.group(1)
        pe_n = int(m.group(2))
        # Body starts after the matched "<code>. "
        start = m.end()
        # Stop at the next PE start in the same region OR at an end marker
        next_start = matches[i + 1].start() if i + 1 < len(matches) else len(norm)
        end_m = END_MARKERS.search(norm, start, next_start)
        end = end_m.start() if end_m else next_start
        body = norm[start:end].strip()
        out.append((topic, pe_n, body))
    return out


CLAR_RE = re.compile(
    r"\[\s*Clarification\s+Statement\s*:\s*(.+?)\]",
    re.S,
)
AB_RE = re.compile(
    r"\[\s*Assessment\s+Boundary\s*:\s*(.+?)\]",
    re.S,
)


def split_pe_body(body):
    """Return (statement, clarification, assessment_boundary, engineering_flag).
    Statement is the head before any [Clarification...] / [Assessment...]
    bracketed annotation. The engineering flag is set when the statement
    ends in '*' (NGSS convention for engineering-integrated PEs)."""
    clar = ""
    ab = ""

    m_clar = CLAR_RE.search(body)
    if m_clar:
        clar = m_clar.group(1).strip()

    m_ab = AB_RE.search(body)
    if m_ab:
        ab = m_ab.group(1).strip()

    # Strip both bracketed annotations from the body to isolate the statement.
    statement = CLAR_RE.sub("", body)
    statement = AB_RE.sub("", statement)
    statement = re.sub(r"\s+", " ", statement).strip()

    # Engineering flag: trailing '*' on the cleaned statement
    engineering = False
    if statement.endswith("*"):
        engineering = True
        statement = statement.rstrip("* ").strip()

    return statement, clar, ab, engineering


# ------- Build records -------

def build_records(pe_triples):
    records = []
    for topic, pe_n, body in pe_triples:
        prefix = topic.split("-")[0] if topic.startswith(("K-2", "3-5")) else topic.split("-")[0]
        # K-2 / 3-5 split: rejoin the prefix correctly
        if topic.startswith("K-2-"):
            prefix = "K-2"
        elif topic.startswith("3-5-"):
            prefix = "3-5"
        else:
            prefix = topic.split("-", 1)[0]

        grade, band = grade_and_band(prefix)
        domain = topic.split("-")[-1][:-1] if topic[-1].isdigit() else topic.split("-")[-1]
        # topic looks like "K-PS2" or "MS-ETS1" or "K-2-ETS1"
        # the trailing token after the last "-" is "<DOMAIN><n>"
        last_token = topic.rsplit("-", 1)[-1]  # e.g. "PS2", "ETS1"
        m_dom = re.match(r"([A-Z]+)(\d+)", last_token)
        domain = m_dom.group(1) if m_dom else ""
        topic_num = int(m_dom.group(2)) if m_dom else 0

        statement, clar, ab, engineering = split_pe_body(body)
        # Compose retrieval text
        retrieval = " ".join(filter(None, [statement, clar])).strip()

        code = f"{topic}-{pe_n}"
        records.append({
            "code": code,
            "topic": topic,
            "topic_name": TOPIC_NAMES.get(topic, ""),
            "topic_number": topic_num,
            "domain": domain,
            "domain_name": DOMAIN_NAMES.get(domain, ""),
            "grade": grade,
            "grade_band": band,
            "pe_number": pe_n,
            "statement": statement,
            "clarification": clar,
            "assessment_boundary": ab,
            "engineering": engineering,
            "modeling": False,           # NGSS DCI arrangement has no modeling stars
            "ca_addition": False,        # CA clarifications can be merged in v2
            "text": retrieval,
        })
    # Order: by grade band order, then topic, then pe_number
    GRADE_ORDER = {"K": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
                   "K-2": 0.5, "3-5": 4.5, "MS": 6, "HS": 7}
    records.sort(key=lambda r: (GRADE_ORDER.get(r["grade"], 99),
                                r["topic"], r["pe_number"]))
    return records


# ------- Driver -------

def main():
    DEBUG_TXT.parent.mkdir(parents=True, exist_ok=True)
    full, n_pages = extract_full_text(PDF_PATH)
    DEBUG_TXT.write_text(full, encoding="utf-8")
    print(f"PDF pages: {n_pages}")

    triples = parse_pes(full)
    print(f"PE codes parsed: {len(triples)}")

    records = build_records(triples)
    print(f"Records emitted: {len(records)}")

    OUT_JSON.write_text(json.dumps(records, indent=2, ensure_ascii=False),
                        encoding="utf-8")

    by_band = {}
    by_domain = {}
    for r in records:
        by_band[r["grade_band"]] = by_band.get(r["grade_band"], 0) + 1
        by_domain[r["domain"]] = by_domain.get(r["domain"], 0) + 1
    print("By band:", by_band)
    print("By domain:", by_domain)

    meta = {
        "source_pdf": PDF_PATH.name,
        "source_label": "Next Generation Science Standards (DCI Arrangements, "
                        "Achieve Inc., 2013) — California adopted verbatim",
        "generated_by": "tools/parse_science.py",
        "domain_names": DOMAIN_NAMES,
        "topic_names": TOPIC_NAMES,
        "grade_bands": ["K-5", "MS", "HS"],
        "grades": ["K", "1", "2", "3", "4", "5", "K-2", "3-5", "MS", "HS"],
        "code_scheme": {
            "performance_expectation": "<grade>-<DOMAIN><n>-<m>   e.g. K-PS2-1, MS-LS1-3, HS-ESS2-7",
            "topic":                   "<grade>-<DOMAIN><n>       e.g. K-PS2, HS-ESS2",
            "engineering_marker":      "PE has '*' suffix on statement (engineering integration)",
        },
        "notes": [
            "K-2 and 3-5 ETS1 (Engineering Design) topics are emitted with "
            "grade='K-2' / '3-5' and grade_band='K-5'.",
            "SEPs / DCIs / CCCs are NOT emitted as separate records; only "
            "Performance Expectations are.",
            "California clarification statements (HS only) live in the three "
            "SCIENCE*-CA PDFs and can be merged into ca_addition fields in v2.",
        ],
        "record_count": len(records),
    }
    OUT_META.write_text(json.dumps(meta, indent=2, ensure_ascii=False),
                        encoding="utf-8")

    print(f"Wrote {OUT_JSON.relative_to(ROOT)}")
    print(f"Wrote {OUT_META.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
