"""
Standards-Tagger FastAPI backend.

Exposes a single endpoint:
  POST /align  — accepts an EdusPerience JSON + subject, runs the full
                 alignment pipeline (TF-IDF shortlist → heuristic rerank →
                 Gemini curation), and returns the final alignment result.

Run with:
  uvicorn backend.main:app --reload --port 8000

Requires:
  pip install -r backend/requirements.txt
  GEMINI_API_KEY set in env or in local.secrets.json at repo root.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Path setup — make sure tools/ is importable regardless of cwd
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))

import align as align_mod
import rerank as rerank_mod

# ---------------------------------------------------------------------------
# Gemini helpers (inlined from run_alignment.py so we don't depend on CLI)
# ---------------------------------------------------------------------------
GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-2.5-flash")
GEMINI_INPUT_USD_PER_MTOK  = float(os.environ.get("GEMINI_INPUT_USD_PER_MTOK",  "0.35"))
GEMINI_OUTPUT_USD_PER_MTOK = float(os.environ.get("GEMINI_OUTPUT_USD_PER_MTOK", "1.05"))

SUBJECTS = ["ela", "math", "history", "science"]


def _load_gemini_key() -> None:
    if os.environ.get("GEMINI_API_KEY"):
        return
    p = ROOT / "local.secrets.json"
    if not p.is_file():
        return
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return
    key = (data.get("gemini_api_key") or data.get("GEMINI_API_KEY") or "").strip()
    if key:
        os.environ["GEMINI_API_KEY"] = key


def _get_gemini_model():
    _load_gemini_key()
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set.")
    try:
        import google.generativeai as genai
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="google-generativeai not installed. Run: pip install google-generativeai",
        )
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(GEMINI_MODEL_NAME)


def _extract_json(text: str) -> dict:
    txt = (text or "").strip()
    if txt.startswith("```"):
        txt = txt.split("\n", 1)[1] if "\n" in txt else txt
        if txt.endswith("```"):
            txt = txt.rsplit("```", 1)[0]
        txt = txt.strip()
        if txt.startswith("json"):
            txt = txt[4:].strip()
    return json.loads(txt)


def _gemini_json(model, prompt: str) -> dict:
    resp = model.generate_content(prompt)
    return _extract_json(resp.text)


def gemini_infer_grade_bands(model, subject: str, title: str, desc: str) -> list[str]:
    prompt = (
        "Infer likely grade bands for alignment.\n"
        "Return strict JSON: {\"grades\":[...]}.\n"
        "Allowed values by subject:\n"
        "- ela: K,1,2,3,4,5,6,7,8,6-8,9-10,11-12\n"
        "- math: K,1,2,3,4,5,6,7,8,9-12\n"
        "- history: 4,6,7,8,10,11,12\n"
        "- science: K,1,2,3,4,5,MS,HS\n\n"
        f"SUBJECT: {subject}\nTITLE: {title}\nDESCRIPTION: {desc}\n"
    )
    try:
        data = _gemini_json(model, prompt)
        return [str(g) for g in (data.get("grades") or [])]
    except Exception:
        return []


def curate_with_gemini(alignment_data: dict, model) -> dict:
    sg = (alignment_data.get("standards_db") or "").split("/")[-1].replace(".json", "")
    grades = gemini_infer_grade_bands(
        model,
        alignment_data.get("subject", "ela"),
        alignment_data.get("edusperience_title", ""),
        alignment_data.get("edusperience_description", ""),
    )
    alignment_data["inferred_grade_bands"] = grades

    out = {
        "edusperience_id":    alignment_data.get("edusperience_id"),
        "edusperience_title": alignment_data.get("edusperience_title"),
        "source_file":        alignment_data.get("source_file"),
        "subject":            alignment_data.get("subject"),
        "inferred_grade_bands": grades,
        "standards_db":       alignment_data.get("standards_db"),
        "standards_group":    sg,
        "alignment_method":   "hybrid: tfidf shortlist → grade+keyword rerank → Gemini curation",
        "objectives":         [],
    }

    CURATE_PROMPT = (
        "You align lesson objectives to academic standards. "
        "Pick 0-3 standards that BEST align with this objective from the candidate list.\n\n"
        "SUBJECT: {subject}\n"
        "PREFERRED GRADES: {grades}\n"
        "EDUSPERIENCE TITLE: {edu_title}\n\n"
        "OBJECTIVE TITLE: {title}\n"
        "OBJECTIVE DESCRIPTION: {desc}\n\n"
        "PREFERRED CODES FROM RERANK: {seed}\n\n"
        "CANDIDATES (top 5 from retrieval):\n{cands}\n\n"
        'Return strict JSON: {{"picks":[{{"code":"...","confidence":"high|medium|low",'
        '"rationale":"1-2 sentences"}}],"note":"optional"}}.\n'
        "If the objective is logistical (file naming, watch a video, insert a section break) "
        "or purely metacognitive, return picks=[] with a note. "
        "Otherwise pick 1-3 standards. Be conservative — one excellent match beats three weak ones."
    )

    for obj in alignment_data.get("objectives", []):
        title = obj.get("objective_title", "") or ""
        desc  = obj.get("objective_description", "") or ""
        path  = obj.get("path", "")
        cands = obj.get("reranked_candidates", []) or []
        if not cands:
            out["objectives"].append({
                "path": path, "title": title, "description": desc,
                "alignments": [], "note": "No candidates returned.",
            })
            continue

        cand_lines = "\n".join(
            f"  {i+1}. {c['code']}: {(c.get('text') or '')[:200]}"
            for i, c in enumerate(cands[:5])
        )
        seed = ", ".join(
            p.get("code", "") for p in (obj.get("auto_pick", {}).get("picks") or [])
        ) or "(none)"

        prompt = CURATE_PROMPT.format(
            subject=alignment_data.get("subject", ""),
            grades=", ".join(grades) or "(unknown)",
            edu_title=alignment_data.get("edusperience_title", ""),
            title=title,
            desc=desc,
            seed=seed,
            cands=cand_lines,
        )

        picks, note = [], ""
        try:
            data  = _gemini_json(model, prompt)
            picks = data.get("picks") or []
            note  = data.get("note") or ""
        except Exception as e:
            note = f"Gemini curation failed: {e}"

        valid_codes = {c["code"] for c in cands if c.get("code")}
        alignments = [
            {
                "code":           p["code"],
                "confidence":     p.get("confidence", "medium"),
                "rationale":      p.get("rationale", ""),
                "standards_group": sg,
            }
            for p in picks
            if p.get("code") in valid_codes
        ]
        record = {"path": path, "title": title, "description": desc, "alignments": alignments}
        if not alignments:
            record["note"] = note or "No standard applies."
        out["objectives"].append(record)

    return out


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="Standards-Tagger API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


class AlignRequest(BaseModel):
    edusperience: dict
    subject: Optional[str] = None   # "ela" | "math" | "history" | "science" | None = auto


class AlignResponse(BaseModel):
    result: dict
    elapsed_seconds: float


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/align", response_model=AlignResponse)
def align_endpoint(req: AlignRequest):
    t0 = time.time()
    edu   = req.edusperience
    edu_title = align_mod.clean_text(edu.get("title", ""))
    edu_desc  = align_mod.clean_text(edu.get("description", ""))

    # Subject resolution
    if req.subject and req.subject in SUBJECTS:
        subject = req.subject
    else:
        detected = align_mod.detect_subjects(f"{edu_title}. {edu_desc}")
        subject  = detected[0] if detected else "ela"

    # Stage 1 — TF-IDF shortlist
    try:
        shortlist = align_mod.run_subject(
            edu, edu_title, edu_desc,
            source_file="<upload>",
            subject=subject,
            top_k=15,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Shortlist failed: {e}")

    # Stage 2 — heuristic rerank (in-memory via temp files)
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as tf:
            json.dump(shortlist, tf)
            tmp_in = Path(tf.name)
        tmp_out = tmp_in.with_suffix(".out.json")
        rerank_mod.process(tmp_in, tmp_out, top_n=5)
        alignment_data = json.loads(tmp_out.read_text(encoding="utf-8"))
        tmp_in.unlink(missing_ok=True)
        tmp_out.unlink(missing_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rerank failed: {e}")

    # Stage 3 — Gemini curation
    try:
        model  = _get_gemini_model()
        result = curate_with_gemini(alignment_data, model)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini curation failed: {e}")

    return AlignResponse(result=result, elapsed_seconds=round(time.time() - t0, 2))
