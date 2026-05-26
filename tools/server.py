"""
Flask API wrapping the align + rerank + Gemini LLM curation pipeline.

POST /api/tag
  Body: {
    "name": str,
    "grade": str,
    "subject": str,          # "ela" | "math" | "history" | "science" | "auto"
    "description": str,      # plain text split into objectives by paragraph
    "sections": [...]        # optional - pre-structured sections (overrides description)
  }
  Returns: final.json-style {subject, inferred_grade_bands, standards_db,
                              objectives, n_total, n_aligned}

GET /api/health  -> {"ok": true}

Requires:
  GEMINI_API_KEY env var (or set it in a .env file at the project root)

Usage:
  python tools/server.py
"""
from __future__ import annotations
import json, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

# Load .env if present
_env_path = ROOT / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai as _genai

import align as _align
import rerank as _rerank

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"

if GEMINI_API_KEY:
    _gemini = _genai.Client(api_key=GEMINI_API_KEY)
else:
    _gemini = None
    print("WARNING: GEMINI_API_KEY not set — falling back to heuristic alignment", flush=True)

app = Flask(__name__)
CORS(app)


# ---------- Description → sections ----------

def description_to_sections(description: str) -> list[dict]:
    clean = re.sub(r"<[^>]+>", " ", description or "")
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n\n+|\n", clean) if p.strip()]
    if not paragraphs:
        paragraphs = [clean]
    objectives = [
        {"title": f"Objective {i + 1}", "description": p}
        for i, p in enumerate(paragraphs)
    ]
    return [{"title": "Assignment", "objectives": objectives}]


# ---------- Heuristic rerank (no LLM) ----------

def rerank_in_memory(shortlist: dict, top_n: int = 5) -> dict:
    subject = shortlist.get("subject", "ela")
    edu_context = " ".join(filter(None, [
        shortlist.get("edusperience_title"),
        shortlist.get("edusperience_description"),
    ]))

    if subject == "math":
        preferred = _rerank.infer_grade_bands_math(edu_context)
        rerank_fn = _rerank.rerank_math
    elif subject == "history":
        preferred = _rerank.infer_grade_bands_history(edu_context)
        rerank_fn = _rerank.rerank_history
    elif subject == "science":
        preferred = _rerank.infer_grade_bands_science(edu_context)
        rerank_fn = _rerank.rerank_science
    else:
        preferred = _rerank.infer_grade_bands_ela(edu_context)
        rerank_fn = _rerank.rerank_ela

    objectives = []
    for obj in shortlist["objectives"]:
        ctx_parts = [
            obj.get("section_title"),
            obj.get("objective_title"),
            obj.get("objective_description"),
        ]
        if subject in ("history", "science"):
            ctx_parts = [edu_context] + ctx_parts
        ctx = " ".join(filter(None, ctx_parts))
        reranked, _ = rerank_fn(obj["candidates"], preferred, ctx, top_n)
        auto = _rerank.auto_pick(
            reranked, ctx, subject,
            objective_title=obj.get("objective_title", ""),
        )
        objectives.append({
            "path": obj["path"],
            "section_title": obj.get("section_title", ""),
            "objective_title": obj.get("objective_title", ""),
            "objective_description": obj.get("objective_description", ""),
            "auto_pick": auto,
        })

    return {**shortlist, "inferred_grade_bands": preferred, "objectives": objectives}


def score_to_confidence(score: float) -> str:
    if score >= 0.40:
        return "high"
    if score >= 0.25:
        return "medium"
    return "low"


def heuristic_to_final(reranked: dict) -> dict:
    objectives = []
    for obj in reranked["objectives"]:
        auto = obj.get("auto_pick", {})
        picks = auto.get("picks", [])
        alignments = [
            {
                "code": p["code"],
                "confidence": score_to_confidence(p.get("final_score", 0)),
                "rationale": p.get("text", ""),
            }
            for p in picks
        ]
        entry = {
            "path": obj["path"],
            "title": obj.get("objective_title", ""),
            "description": obj.get("objective_description", ""),
            "alignments": alignments,
        }
        if not alignments and auto.get("reason"):
            entry["note"] = auto["reason"]
        objectives.append(entry)

    n_total = len(objectives)
    n_aligned = sum(1 for o in objectives if o["alignments"])

    return {
        "edusperience_title": reranked.get("edusperience_title"),
        "subject": reranked.get("subject"),
        "inferred_grade_bands": reranked.get("inferred_grade_bands", []),
        "standards_db": reranked.get("standards_db"),
        "alignment_method": "tfidf shortlist -> grade+keyword rerank",
        "objectives": objectives,
        "n_total": n_total,
        "n_aligned": n_aligned,
    }


# ---------- Gemini LLM curation ----------

_LLM_SYSTEM = """You are an expert California K-12 curriculum alignment specialist.
You will be given an assignment objective and a shortlist of candidate standards.
Pick the 1-3 best-matching standards (or none if nothing fits) and explain why.
Respond ONLY with valid JSON — no markdown fences, no extra text."""

_LLM_PROMPT = """Assignment: {assignment_name}
Subject: {subject}
Grade: {grade}

Objective title: {obj_title}
Objective description: {obj_desc}

Candidate standards (TF-IDF shortlist):
{candidates}

Return JSON in exactly this shape:
{{
  "alignments": [
    {{"code": "X-XX.X.X", "confidence": "high|medium|low", "rationale": "one sentence"}},
    ...
  ],
  "note": "optional note if nothing applies or context is needed"
}}

Rules:
- Include 0-3 alignments only. If the objective is logistical (e.g. naming a file, submitting work) return an empty alignments array.
- confidence: "high" = directly assessed by this standard, "medium" = partially addressed, "low" = tangential.
- rationale: one concise sentence explaining the match.
- Only use codes from the candidate list provided.
"""


def llm_curate_objective(
    assignment_name: str,
    subject: str,
    grade: str,
    obj_title: str,
    obj_desc: str,
    candidates: list[dict],
) -> dict:
    """Call Gemini to pick and justify the best standard alignments."""
    candidate_lines = "\n".join(
        f"  {c['code']}: {c['text'][:120]}" for c in candidates[:10]
    )
    prompt = _LLM_PROMPT.format(
        assignment_name=assignment_name,
        subject=subject.upper(),
        grade=grade or "unspecified",
        obj_title=obj_title,
        obj_desc=obj_desc,
        candidates=candidate_lines,
    )
    try:
        resp = _gemini.models.generate_content(
            model=GEMINI_MODEL,
            contents=_LLM_SYSTEM + "\n\n" + prompt,
            config={"temperature": 0.1, "max_output_tokens": 512},
        )
        raw = resp.text.strip()
        # Strip markdown fences if the model wraps anyway
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.S).strip()
        return json.loads(raw)
    except Exception as e:
        print(f"  Gemini error on '{obj_title}': {e}", flush=True)
        return {"alignments": [], "note": "LLM curation failed — no alignment assigned"}


def gemini_to_final(
    shortlist: dict,
    reranked: dict,
    assignment_name: str,
    grade: str,
) -> dict:
    """Run Gemini curation on each objective and produce the final.json shape."""
    subject = shortlist.get("subject", "ela")
    objectives_out = []

    # Build a quick lookup: path -> shortlist candidates
    candidates_by_path = {o["path"]: o["candidates"] for o in shortlist["objectives"]}

    for obj in reranked["objectives"]:
        candidates = candidates_by_path.get(obj["path"], [])
        obj_title = obj.get("objective_title", "")
        obj_desc = obj.get("objective_description", "")

        print(f"  [gemini] curating: {obj_title or obj_desc[:40]}", flush=True)
        result = llm_curate_objective(
            assignment_name=assignment_name,
            subject=subject,
            grade=grade,
            obj_title=obj_title,
            obj_desc=obj_desc,
            candidates=candidates,
        )

        entry = {
            "path": obj["path"],
            "title": obj_title,
            "description": obj_desc,
            "alignments": result.get("alignments", []),
        }
        if result.get("note"):
            entry["note"] = result["note"]
        objectives_out.append(entry)

    n_total = len(objectives_out)
    n_aligned = sum(1 for o in objectives_out if o["alignments"])

    return {
        "edusperience_title": reranked.get("edusperience_title"),
        "subject": subject,
        "inferred_grade_bands": reranked.get("inferred_grade_bands", []),
        "standards_db": reranked.get("standards_db"),
        "alignment_method": "tfidf shortlist -> grade+keyword rerank -> LLM curation (Gemini)",
        "objectives": objectives_out,
        "n_total": n_total,
        "n_aligned": n_aligned,
    }


# ---------- Routes ----------

@app.get("/api/health")
def health():
    return jsonify({"ok": True, "llm": _gemini is not None})


@app.post("/api/tag")
def tag():
    body = request.get_json(force=True, silent=True) or {}
    name = (body.get("name") or "").strip()
    grade = (body.get("grade") or "").strip()
    subject = (body.get("subject") or "auto").strip().lower()
    description = (body.get("description") or "").strip()
    sections = body.get("sections")

    if not description and not sections:
        return jsonify({"error": "description or sections required"}), 400

    if subject not in _align.SUBJECTS and subject != "auto":
        subject = "auto"

    edu = {
        "id": None,
        "title": name,
        "description": description,
        "sections": sections if sections is not None else description_to_sections(description),
    }

    edu_title = _align.clean_text(name)
    edu_desc = _align.clean_text(description)

    if subject == "auto":
        subjects = _align.detect_subjects(f"{edu_title}. {edu_desc}")
    else:
        subjects = [subject]

    subj = subjects[0] if subjects else "ela"
    print(f"[tag] name={name!r} subject={subj} grade={grade!r}", flush=True)

    shortlist = _align.run_subject(edu, edu_title, edu_desc, "user-upload", subj, top_k=15)
    reranked = rerank_in_memory(shortlist, top_n=5)

    if _gemini:
        final = gemini_to_final(shortlist, reranked, name, grade)
    else:
        final = heuristic_to_final(reranked)

    return jsonify(final)


if __name__ == "__main__":
    print("Starting Standards Tagger API on http://localhost:5000")
    app.run(port=5000, debug=True)
