"""
Align edusperience objectives to California standards (ELA, Math, History, or Science/NGSS).

Pipeline (hybrid):
  1. Lexical shortlist via TF-IDF cosine similarity (fast, deterministic)
  2. LLM reranker (separate pass)

Usage:
  python3 tools/align.py shortlist edusperiences/mockingbird_essay.json
  python3 tools/align.py shortlist --subject science edusperiences/foo.json
  python3 tools/align.py shortlist --subject history edusperiences/WWII_data.json
  python3 tools/align.py shortlist --subject all edusperiences/foo.json
  python3 tools/align.py shortlist --all
"""
from __future__ import annotations
import argparse, json, os, re, sys, glob, html
from pathlib import Path
from typing import Iterable

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "artifacts"
OUT_DIR.mkdir(exist_ok=True)

TOP_K = 15

# ---------- Subject configuration ----------
SUBJECTS = {
    "ela": {
        "standards_path": ROOT / "categorized-standards" / "California" / "CA-ELA.json",
        "index_fields": ["strand_name", "subgroup", "text"],
        "candidate_fields": [
            "code", "strand", "grade", "grade_band",
            "subgroup", "is_anchor", "text",
        ],
        "label": "ela",
    },
    "math": {
        "standards_path": ROOT / "categorized-standards" / "California" / "CA-MATH.json",
        "index_fields": ["category_name", "domain_name", "cluster", "text"],
        "candidate_fields": [
            "code", "section", "grade", "grade_band",
            "category", "category_name",
            "domain", "domain_code", "domain_name",
            "cluster_letter", "cluster",
            "is_practice", "ca_addition", "plus_standard", "modeling",
            "text",
        ],
        "label": "math",
    },
    "history": {
        "standards_path": ROOT / "categorized-standards" / "California" / "CA-HISTORY.json",
        "index_fields": ["course_title", "skill_category", "text"],
        "candidate_fields": [
            "code", "section", "grade", "grade_band",
            "course_title",
            "skill_category", "skill_category_code",
            "is_skill", "parent_code", "number", "sub_number",
            "text",
        ],
        "label": "history",
    },
    "science": {
        "standards_path": ROOT / "categorized-standards" / "California" / "CA-NGSS.json",
        # topic_name + statement + clarification carries the most signal.
        # The "text" field is statement + clarification already concatenated.
        "index_fields": ["topic_name", "domain_name", "text", "assessment_boundary"],
        "candidate_fields": [
            "code", "topic", "topic_name", "topic_number",
            "domain", "domain_name",
            "grade", "grade_band",
            "pe_number", "engineering", "modeling", "ca_addition",
            "statement", "clarification", "assessment_boundary", "text",
        ],
        "label": "science",
    },
}

ELA_KEYWORDS = re.compile(
    r"\b(essay|argument|thesis|claim|narrativ|story|stories|novel|"
    r"poem|poetry|drama|play|literature|literary|read(ing)?|"
    r"writ(e|ing)|grammar|vocabulary|punctuation|paragraph|"
    r"theme|character|plot|setting|figurative|"
    r"shakespeare|odyssey|mockingbird|romeo|juliet|"
    r"speech|present(ation|ing)|discuss(ion)?)\b",
    re.I,
)
MATH_KEYWORDS = re.compile(
    r"\b(math(ematic)?|budget|spreadsheet|formula|equation|"
    r"graph(ing)?|chart|data|statistic|probability|"
    r"percentage|percent|fraction|decimal|ratio|proportion|"
    r"algebra|geometry|calculus|trigonometry|"
    r"calculate|compute|sum|average|median|mean|"
    r"income|expense|cost|money|dollar|"
    r"function|variable|coefficient|polynomial)\b",
    re.I,
)
HISTORY_KEYWORDS = re.compile(
    r"\b(history|histor(ical|ic)|civic|government|democracy|"
    r"constitution|amendment|congress|senate|presiden(t|cy)|"
    r"world\s*war|wwii|wwi|"
    r"colonial|revolution(ary)?|civil\s*war|reconstruction|"
    r"slavery|abolition|emancipation|"
    r"ancient|medieval|renaissance|enlightenment|industrial(ization)?|"
    r"empire|civilization|dynasty|"
    r"capitalism|socialism|communism|fascism|"
    r"geography|geographic|continent|hemisphere|"
    r"culture|cultural|religion|religious|"
    r"primary\s*source|secondary\s*source|"
    r"timeline|chronolog(y|ical)|"
    r"election|vote|voting|"
    r"holocaust|"
    r"egypt(ian)?|rome|roman|greek|greece|"
    r"casualt(y|ies)|military|war(s|fare)?)\b",
    re.I,
)
SCIENCE_KEYWORDS = re.compile(
    r"\b(science|scientific|hypothesis|experiment|laborator(y|ies)|"
    r"physics|chemistry|biology|biolog(ical|ist)|chemical|"
    r"atom|molecule|element|compound|periodic|isotop|electron|proton|neutron|"
    r"force|motion|gravity|gravitation|friction|momentum|accelerat|velocit|"
    r"energy|kinetic|potential|thermal|electromagnetic|nuclear|"
    r"wave(length|s)?|frequency|amplitude|"
    r"cell|cellular|organism|dna|gene|chromosome|heredit|trait|"
    r"evolution|natural\s*selection|adapt(ation)?|species|biodivers|"
    r"ecosystem|biome|food\s*chain|food\s*web|photosynthesis|respirat|"
    r"weather|climate|atmosphere|hydrosphere|cryosphere|biosphere|"
    r"plate\s*tectonic|earthquake|volcano|erosion|weathering|"
    r"solar\s*system|planet|star|galaxy|universe|astronom|"
    r"engineer(ing)?|design\s*solution|prototype|iterat|"
    r"renewable|fossil\s*fuel|carbon\s*cycle|water\s*cycle|"
    r"organ(ism|s)?|tissue|protein|enzyme|"
    r"newton|einstein|darwin|"
    r"NGSS|disciplinary\s*core)\b",
    re.I,
)


def detect_subjects(edu_text: str) -> list[str]:
    text = edu_text or ""
    out = []
    if ELA_KEYWORDS.search(text):     out.append("ela")
    if MATH_KEYWORDS.search(text):    out.append("math")
    if HISTORY_KEYWORDS.search(text): out.append("history")
    if SCIENCE_KEYWORDS.search(text): out.append("science")
    return out or ["ela"]


# ---------- Text cleaning ----------
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

def clean_text(s):
    if not s:
        return ""
    s = _TAG_RE.sub(" ", s)
    s = html.unescape(s)
    s = _WS_RE.sub(" ", s).strip()
    return s


# ---------- Standards index ----------
def build_index(standards, index_fields):
    docs = [" ".join(str(r.get(f) or "") for f in index_fields) for r in standards]
    vec = TfidfVectorizer(ngram_range=(1, 2), stop_words="english",
                          min_df=1, sublinear_tf=True)
    X = vec.fit_transform(docs)
    return vec, X


def shortlist_standards(query, vec, X, standards, candidate_fields, top_k=TOP_K):
    qv = vec.transform([query])
    sims = cosine_similarity(qv, X)[0]
    order = np.argsort(-sims)[:top_k]
    out = []
    for i in order:
        cand = {"score": float(sims[i])}
        for f in candidate_fields:
            cand[f] = standards[i].get(f)
        out.append(cand)
    return out


# ---------- Edusperience traversal ----------
def iter_objectives(edu):
    for si, sec in enumerate(edu.get("sections", []) or []):
        sec_title = clean_text(sec.get("title"))
        sec_desc = clean_text(sec.get("description"))
        for oi, obj in enumerate(sec.get("objectives", []) or []):
            obj_title = clean_text(obj.get("title"))
            obj_desc = clean_text(obj.get("description"))
            query = " ".join(filter(None, [sec_title, obj_title, obj_desc]))
            yield {
                "path": f"sections[{si}].objectives[{oi}]",
                "section_title": sec_title,
                "section_description": sec_desc,
                "objective_title": obj_title,
                "objective_description": obj_desc,
                "query": query,
            }


# ---------- Per-subject shortlist run ----------
def run_subject(edu, edu_title, edu_desc, source_file, subject, top_k):
    cfg = SUBJECTS[subject]
    standards = json.load(open(cfg["standards_path"]))
    vec, X = build_index(standards, cfg["index_fields"])
    print(f"  [{subject}] indexed {len(standards)} standards "
          f"(tfidf matrix {X.shape})", file=sys.stderr)

    out_objs = []
    for obj in iter_objectives(edu):
        q = obj["query"]
        if len(q) < 40 and edu_title:
            q = f"{edu_title}. {q}"
        cands = shortlist_standards(q, vec, X, standards,
                                    cfg["candidate_fields"], top_k=top_k)
        out_objs.append({**obj, "candidates": cands})

    return {
        "edusperience_id": edu.get("id"),
        "edusperience_title": edu_title,
        "edusperience_description": edu_desc,
        "source_file": source_file,
        "subject": subject,
        "standards_db": str(cfg["standards_path"].relative_to(ROOT)),
        "retrieval_method": "tfidf_1-2grams_sublinear",
        "top_k": top_k,
        "objectives": out_objs,
    }


# ---------- Commands ----------
def cmd_shortlist(args):
    if args.all:
        inputs = sorted(glob.glob(str(ROOT / "edusperiences" / "*.json")))
    else:
        inputs = list(args.files)
    if not inputs:
        print("No input files", file=sys.stderr)
        return 1

    for inp in inputs:
        with open(inp) as f:
            edu = json.load(f)

        edu_title = clean_text(edu.get("title"))
        edu_desc = clean_text(edu.get("description"))
        source_file = os.path.relpath(inp, ROOT)

        if args.subject == "auto":
            subjects = detect_subjects(f"{edu_title}. {edu_desc}")
        elif args.subject == "both":
            subjects = ["ela", "math"]
        elif args.subject == "all":
            subjects = ["ela", "math", "history", "science"]
        else:
            subjects = [args.subject]

        stem = Path(inp).stem
        print(f"{stem}: subjects={subjects}", file=sys.stderr)

        single = len(subjects) == 1
        for subj in subjects:
            res = run_subject(edu, edu_title, edu_desc, source_file,
                              subj, args.top_k)
            if single:
                out_path = OUT_DIR / f"{stem}.shortlist.json"
            else:
                out_path = OUT_DIR / f"{stem}.{SUBJECTS[subj]['label']}.shortlist.json"
            with open(out_path, "w") as f:
                json.dump(res, f, indent=2, ensure_ascii=False)
            print(f"  -> {out_path}  ({len(res['objectives'])} objectives)",
                  file=sys.stderr)
    return 0


def build_parser():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    p_sl = sub.add_parser("shortlist", help="Compute TF-IDF top-K standards per objective")
    p_sl.add_argument("files", nargs="*", help="edusperience JSON files")
    p_sl.add_argument("--all", action="store_true",
                      help="Run on every edusperiences/*.json")
    p_sl.add_argument("--subject",
                      choices=["auto", "ela", "math", "history", "science", "both", "all"],
                      default="auto",
                      help="Which standards DB to align against (default: auto). "
                           "'both' = ela+math; 'all' = ela+math+history+science.")
    p_sl.add_argument("--top-k", type=int, default=TOP_K)
    p_sl.set_defaults(func=cmd_shortlist)
    return p


def main():
    args = build_parser().parse_args()
    sys.exit(args.func(args) or 0)


if __name__ == "__main__":
    main()
