"""
End-to-end alignment for a single edusperience.

Runs subject auto-detection -> TF-IDF shortlist -> heuristic rerank ->
curation (heuristic auto-pick by default; optional Gemini via --curate gemini)
-> per-edusperience PDF -> dashboard regeneration.

Usage:
    python3 tools/run_alignment.py edusperiences/civil_war.json
    python3 tools/run_alignment.py edusperiences/foo.json --subject science
    python3 tools/run_alignment.py edusperiences/foo.json --demo
    python3 tools/run_alignment.py edusperiences/foo.json --no-pdf --no-dashboard

    # With Gemini curation: set GEMINI_API_KEY, or put gemini_api_key in gitignored
    # local.secrets.json at repo root.
    GEMINI_API_KEY=... python3 tools/run_alignment.py edusperiences/foo.json --curate gemini
"""
from __future__ import annotations
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
ART_DIR = ROOT / "artifacts"
ART_DIR.mkdir(exist_ok=True)

GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-flash-latest")

# Pricing defaults are intentionally configurable because Gemini pricing can change.
# Units are USD per 1M tokens.
GEMINI_INPUT_USD_PER_MTOK = float(os.environ.get("GEMINI_INPUT_USD_PER_MTOK", "0.35"))
GEMINI_OUTPUT_USD_PER_MTOK = float(os.environ.get("GEMINI_OUTPUT_USD_PER_MTOK", "1.05"))


class GeminiUsageTracker:
    def __init__(self):
        self.estimated_input_tokens = 0
        self.estimated_output_tokens = 0
        self.actual_input_tokens = 0
        self.actual_output_tokens = 0
        self.calls = 0

    def _estimate_tokens(self, text):
        # Fast approximation: ~4 chars/token.
        if not text:
            return 0
        return max(1, len(text) // 4)

    def note_estimate(self, prompt, expected_output_tokens):
        self.estimated_input_tokens += self._estimate_tokens(prompt)
        self.estimated_output_tokens += max(0, int(expected_output_tokens or 0))
        self.calls += 1

    def note_actual(self, resp):
        md = getattr(resp, "usage_metadata", None)
        if not md:
            return
        in_tok = (
            getattr(md, "prompt_token_count", None)
            or getattr(md, "input_token_count", None)
            or 0
        )
        out_tok = (
            getattr(md, "candidates_token_count", None)
            or getattr(md, "output_token_count", None)
            or 0
        )
        self.actual_input_tokens += int(in_tok)
        self.actual_output_tokens += int(out_tok)

    @staticmethod
    def _usd(input_tokens, output_tokens):
        return (
            (input_tokens / 1_000_000.0) * GEMINI_INPUT_USD_PER_MTOK
            + (output_tokens / 1_000_000.0) * GEMINI_OUTPUT_USD_PER_MTOK
        )

    def estimated_usd(self):
        return self._usd(self.estimated_input_tokens, self.estimated_output_tokens)

    def actual_usd(self):
        if self.actual_input_tokens == 0 and self.actual_output_tokens == 0:
            return None
        return self._usd(self.actual_input_tokens, self.actual_output_tokens)


def _load_gemini_key_from_local_secrets():
    if os.environ.get("GEMINI_API_KEY"):
        return
    p = ROOT / "local.secrets.json"
    if not p.is_file():
        return
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    key = (data.get("gemini_api_key") or data.get("GEMINI_API_KEY") or "").strip()
    if key:
        os.environ["GEMINI_API_KEY"] = key


sys.path.insert(0, str(TOOLS))
import align
import rerank


# ---------- Pretty output ----------

def banner(text):
    print(f"\n{'=' * 64}")
    print(f"  {text}")
    print('=' * 64)


def step(label, value=""):
    pad = " " * max(2, 30 - len(label))
    print(f"  {label}{pad}{value}")


def t():
    return time.time()


# ---------- Gemini helpers ----------

def _require_gemini_model():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY env var not set.")
    try:
        import google.generativeai as genai
    except ImportError:
        raise RuntimeError(
            "google-generativeai not installed. Run: pip install google-generativeai"
        )
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(GEMINI_MODEL_NAME)


def _extract_json_from_response_text(text):
    txt = (text or "").strip()
    if txt.startswith("```"):
        txt = txt.split("\n", 1)[1] if "\n" in txt else txt
        if txt.endswith("```"):
            txt = txt.rsplit("```", 1)[0]
        txt = txt.strip()
        if txt.startswith("json"):
            txt = txt[4:].strip()
    return json.loads(txt)


def _gemini_json_call(model, tracker, prompt, expected_output_tokens=250):
    tracker.note_estimate(prompt, expected_output_tokens)
    resp = model.generate_content(prompt)
    tracker.note_actual(resp)
    return _extract_json_from_response_text(resp.text)


def gemini_detect_subjects(model, tracker, edu_title, edu_desc):
    prompt = (
        "Classify the academic subject for this edusperience. "
        "Return strict JSON: {\"subjects\":[\"ela|math|history|science\"],\"primary\":\"ela|math|history|science\"}.\n"
        "Choose 1-2 subjects max, with primary first.\n\n"
        f"TITLE: {edu_title}\n"
        f"DESCRIPTION: {edu_desc}\n"
    )
    data = _gemini_json_call(model, tracker, prompt, expected_output_tokens=80)
    subjects = [s for s in (data.get("subjects") or []) if s in {"ela", "math", "history", "science"}]
    primary = data.get("primary")
    if primary in {"ela", "math", "history", "science"}:
        if primary in subjects:
            subjects.remove(primary)
        subjects = [primary] + subjects
    return subjects or [align.detect_subjects(f"{edu_title}. {edu_desc}")[0]]


def gemini_infer_grade_bands(model, tracker, subject, edu_title, edu_desc):
    prompt = (
        "Infer likely grade bands for alignment.\n"
        "Return strict JSON: {\"grades\":[...]}.\n"
        "Allowed values by subject:\n"
        "- ela: K,1,2,3,4,5,6,7,8,6-8,9-10,11-12\n"
        "- math: K,1,2,3,4,5,6,7,8,9-12\n"
        "- history: 4,6,7,8,10,11,12\n"
        "- science: K,1,2,3,4,5,MS,HS\n\n"
        f"SUBJECT: {subject}\n"
        f"TITLE: {edu_title}\n"
        f"DESCRIPTION: {edu_desc}\n"
    )
    data = _gemini_json_call(model, tracker, prompt, expected_output_tokens=70)
    grades = data.get("grades") or []
    return [str(g) for g in grades]


def gemini_rerank_alignment(alignment_data, model, tracker, top_n=5):
    grades = gemini_infer_grade_bands(
        model,
        tracker,
        alignment_data.get("subject", "ela"),
        alignment_data.get("edusperience_title", ""),
        alignment_data.get("edusperience_description", ""),
    )
    alignment_data["inferred_grade_bands"] = grades
    alignment_data.setdefault("retrieval", {})
    alignment_data["retrieval"]["reranker"] = "Gemini rerank over top candidates"

    for obj in alignment_data.get("objectives", []):
        cands = (obj.get("reranked_candidates") or [])[:top_n]
        if not cands:
            obj["matched_keyword_rules"] = ["gemini:no_candidates"]
            obj["auto_pick"] = {"picks": [], "reason": "No candidates returned."}
            continue
        cand_lines = "\n".join(
            f"{i+1}. code={c.get('code')} grade={c.get('grade')} score={round(float(c.get('score', 0.0)), 4)} text={(c.get('text') or '')[:220]}"
            for i, c in enumerate(cands)
        )
        prompt = (
            "You are reranking candidate academic standards for one objective.\n"
            "Return strict JSON with this shape:\n"
            "{\"reranked_codes\":[\"...\"],\"auto_pick_codes\":[\"...\"],\"reason\":\"...\"}\n"
            "- reranked_codes must include only provided candidate codes, best to worst.\n"
            "- auto_pick_codes must be 0-3 codes from reranked_codes.\n"
            "- Be conservative; for logistical/reflection objectives prefer auto_pick_codes=[].\n\n"
            f"SUBJECT: {alignment_data.get('subject')}\n"
            f"PREFERRED GRADES: {', '.join(grades) or '(none)'}\n"
            f"SECTION: {obj.get('section_title') or ''}\n"
            f"OBJECTIVE TITLE: {obj.get('objective_title') or ''}\n"
            f"OBJECTIVE DESCRIPTION: {obj.get('objective_description') or ''}\n\n"
            f"CANDIDATES:\n{cand_lines}\n"
        )
        try:
            data = _gemini_json_call(model, tracker, prompt, expected_output_tokens=180)
            codes = [c.get("code") for c in cands if c.get("code")]
            code_set = set(codes)
            reranked_codes = [c for c in (data.get("reranked_codes") or []) if c in code_set]
            for c in codes:
                if c not in reranked_codes:
                    reranked_codes.append(c)
            auto_codes = [c for c in (data.get("auto_pick_codes") or []) if c in code_set][:3]
            reason = (data.get("reason") or "gemini rerank").strip()
            by_code = {c.get("code"): c for c in cands if c.get("code")}
            ranked = [by_code[c] for c in reranked_codes if c in by_code]
            for idx, c in enumerate(ranked):
                c["final_score"] = round(float(c.get("score", 0.0)) + max(0.0, (len(ranked) - idx) * 0.01), 4)
                c["grade_bonus"] = 0.0
                c["keyword_bonus"] = 0.0
            obj["reranked_candidates"] = ranked
            obj["matched_keyword_rules"] = ["gemini:semantic_rerank"]
            obj["auto_pick"] = {
                "picks": [
                    {
                        "code": code,
                        "grade": by_code.get(code, {}).get("grade"),
                        "final_score": by_code.get(code, {}).get("final_score", 0.0),
                        "text": by_code.get(code, {}).get("text", ""),
                    }
                    for code in auto_codes
                    if code in by_code
                ],
                "reason": reason,
            }
        except Exception as e:
            obj["matched_keyword_rules"] = [f"gemini:rerank_error:{e}"]

    return alignment_data


def gemini_qa_review(final_data, model, tracker):
    items = []
    for obj in final_data.get("objectives", []):
        picks = ", ".join(a.get("code", "") for a in obj.get("alignments", [])) or "(none)"
        items.append(
            f"- {obj.get('path','')}: {obj.get('title','')[:80]} -> {picks}"
        )
    prompt = (
        "Review alignment quality quickly and flag potential misses.\n"
        "Return strict JSON: {\"summary\":\"...\",\"flags\":[{\"path\":\"...\",\"issue\":\"...\"}]}.\n"
        "Only flag clear weak or inconsistent alignments.\n\n"
        f"SUBJECT: {final_data.get('subject')}\n"
        f"OBJECTIVES:\n" + "\n".join(items[:200])
    )
    try:
        data = _gemini_json_call(model, tracker, prompt, expected_output_tokens=220)
        final_data["qa_review"] = {
            "summary": data.get("summary", ""),
            "flags": data.get("flags", []),
        }
    except Exception as e:
        final_data["qa_review"] = {
            "summary": f"Gemini QA review failed: {e}",
            "flags": [],
        }
    return final_data


# ---------- Heuristic curation (no LLM) ----------

def heuristic_confidence(final_score):
    if final_score >= 0.40:
        return "high"
    if final_score >= 0.25:
        return "medium"
    return "low"


def auto_pick_to_final(alignment_data):
    """Promote each objective's auto_pick output into a final.json schema."""
    sg = (alignment_data.get("standards_db") or "").split("/")[-1].replace(".json", "")
    out = {
        "edusperience_id": alignment_data.get("edusperience_id"),
        "edusperience_title": alignment_data.get("edusperience_title"),
        "source_file": alignment_data.get("source_file"),
        "subject": alignment_data.get("subject"),
        "inferred_grade_bands": alignment_data.get("inferred_grade_bands", []),
        "standards_db": alignment_data.get("standards_db"),
        "standards_group": sg,
        "alignment_method": "hybrid: tfidf shortlist -> grade+keyword rerank -> heuristic auto-pick",
        "notes": "Auto-curated via run_alignment.py (heuristic mode, no LLM in the loop).",
        "objectives": [],
    }
    for obj in alignment_data.get("objectives", []):
        title = obj.get("objective_title", "") or ""
        desc = obj.get("objective_description", "") or ""
        path = obj.get("path", "")
        auto = obj.get("auto_pick", {}) or {}
        picks = auto.get("picks", []) or []
        reason = auto.get("reason", "")
        matched = obj.get("matched_keyword_rules", []) or []
        reranked = obj.get("reranked_candidates", []) or []
        rerank_by_code = {r["code"]: r for r in reranked}

        alignments = []
        for p in picks:
            code = p["code"]
            score = p.get("final_score", 0.0)
            r = rerank_by_code.get(code, {})
            parts = []
            if r.get("grade_bonus", 0) > 0:
                parts.append(f"grade-band match (grade {r.get('grade')})")
            if r.get("keyword_bonus", 0) > 0:
                parts.append("keyword boost applied")
            if matched:
                parts.append(f"matched rule: {matched[0][:50]}")
            if not parts:
                parts.append("TF-IDF top match")
            alignments.append({
                "code": code,
                "confidence": heuristic_confidence(score),
                "rationale": "; ".join(parts),
                "standards_group": sg,
            })

        record = {"path": path, "title": title, "description": desc,
                  "alignments": alignments}
        if not alignments:
            record["note"] = reason or "No standard applies."
        out["objectives"].append(record)
    return out


# ---------- Optional Gemini curation ----------

def curate_with_gemini(alignment_data, model, tracker, use_gemini_autopicks=False):

    sg = (alignment_data.get("standards_db") or "").split("/")[-1].replace(".json", "")
    out = {
        "edusperience_id": alignment_data.get("edusperience_id"),
        "edusperience_title": alignment_data.get("edusperience_title"),
        "source_file": alignment_data.get("source_file"),
        "subject": alignment_data.get("subject"),
        "inferred_grade_bands": alignment_data.get("inferred_grade_bands", []),
        "standards_db": alignment_data.get("standards_db"),
        "standards_group": sg,
        "alignment_method": "hybrid: tfidf shortlist -> grade+keyword rerank -> Gemini curation",
        "notes": "Curated by gemini-1.5-flash via run_alignment.py.",
        "objectives": [],
    }

    for obj in alignment_data.get("objectives", []):
        title = obj.get("objective_title", "") or ""
        desc = obj.get("objective_description", "") or ""
        path = obj.get("path", "")
        cands = obj.get("reranked_candidates", []) or []
        if not cands:
            out["objectives"].append({
                "path": path, "title": title, "description": desc,
                "alignments": [], "note": "No candidates returned."
            })
            continue
        cand_lines = "\n".join(
            f"  {i+1}. {c['code']}: {(c.get('text') or '')[:200]}"
            for i, c in enumerate(cands[:5])
        )
        if use_gemini_autopicks and (obj.get("auto_pick", {}).get("picks") or []):
            seed = ", ".join(p.get("code", "") for p in obj["auto_pick"]["picks"])
        else:
            seed = "(none)"
        prompt = (
            "You align lesson objectives to academic standards. Pick 0-3 standards "
            "that BEST align with this objective from the candidate list.\n\n"
            f"OBJECTIVE TITLE: {title}\n"
            f"OBJECTIVE DESCRIPTION: {desc}\n\n"
            f"PREFERRED CODES FROM RERANK: {seed}\n\n"
            f"CANDIDATES (top 5 from retrieval):\n{cand_lines}\n\n"
            'Return strict JSON: {"picks":[{"code":"...","confidence":"high|medium|low",'
            '"rationale":"1-2 sentences"}],"note":"optional reason for picking 0"}.\n'
            "If the objective is logistical (e.g. \"watch this video\") or metacognitive "
            "(e.g. \"reflect on what you learned\"), return picks=[] with a note. "
            "Otherwise pick 1-3 standards. Be conservative."
        )
        picks, note = [], ""
        try:
            data = _gemini_json_call(model, tracker, prompt, expected_output_tokens=220)
            picks = data.get("picks") or []
            note = data.get("note") or ""
        except Exception as e:
            note = f"Gemini curation failed: {e}"

        alignments = [{
            "code": p["code"],
            "confidence": p.get("confidence", "medium"),
            "rationale": p.get("rationale", ""),
            "standards_group": sg,
        } for p in picks]
        record = {"path": path, "title": title, "description": desc,
                  "alignments": alignments}
        if not alignments:
            record["note"] = note or "No standard applies."
        out["objectives"].append(record)
    return out


# ---------- Pipeline orchestration ----------

def run(edu_path, subject_override, curate_method, do_pdf, do_dashboard, demo_mode, overwrite, offload_all):
    _load_gemini_key_from_local_secrets()
    model = None
    gemini_tracker = GeminiUsageTracker()
    if offload_all or curate_method == "gemini":
        model = _require_gemini_model()
    edu_path = Path(edu_path).resolve()
    if not edu_path.exists():
        print(f"ERROR: {edu_path} does not exist.", file=sys.stderr)
        return 1

    edu = json.loads(edu_path.read_text(encoding="utf-8"))
    edu_title = align.clean_text(edu.get("title"))
    edu_desc = align.clean_text(edu.get("description"))
    source_file = str(edu_path.relative_to(ROOT))
    stem = edu_path.stem
    t0 = t()

    if demo_mode:
        banner(f"ALIGNMENT PIPELINE - {edu_title or stem}")
    else:
        banner("Pipeline")
    step("Edusperience:", source_file)
    step("Title:", edu_title or "(none)")

    # Subject detection
    if subject_override:
        subjects = [subject_override]
        step("Subject (forced):", subjects[0])
    else:
        if offload_all:
            subjects = gemini_detect_subjects(model, gemini_tracker, edu_title, edu_desc)
            step("Subject (Gemini):", " + ".join(subjects))
        else:
            subjects = align.detect_subjects(f"{edu_title}. {edu_desc}")
            step("Subject (auto):", " + ".join(subjects))
    subject = subjects[0]
    if len(subjects) > 1:
        step("Note:",
             f"multiple subjects detected; using '{subject}' for this run "
             f"(re-run with --subject for the others).")

    # 1. Shortlist
    if demo_mode: banner("Stage 1: TF-IDF Shortlist")
    else: print("\n[1/4] Shortlist...")
    t1 = t()
    shortlist = align.run_subject(edu, edu_title, edu_desc, source_file,
                                  subject, top_k=15)
    shortlist_path = ART_DIR / f"{stem}.shortlist.json"
    shortlist_path.write_text(
        json.dumps(shortlist, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    step("Subject DB:",
         f"{shortlist['standards_group']} ({Path(shortlist['standards_db']).stem})")
    step("Objectives indexed:", str(len(shortlist["objectives"])))
    step("Shortlist time:", f"{t() - t1:.2f}s")

    # 2. Rerank
    if demo_mode: banner("Stage 2: Heuristic Rerank")
    else: print("\n[2/4] Rerank...")
    t2 = t()
    alignment_path = ART_DIR / f"{stem}.alignment.json"
    rerank.process(shortlist_path, alignment_path, top_n=5)
    alignment_data = json.loads(alignment_path.read_text(encoding="utf-8"))
    if offload_all:
        alignment_data = gemini_rerank_alignment(alignment_data, model, gemini_tracker, top_n=5)
        alignment_path.write_text(json.dumps(alignment_data, indent=2, ensure_ascii=False), encoding="utf-8")
    n_with_picks = sum(
        1 for o in alignment_data["objectives"] if o.get("auto_pick", {}).get("picks")
    )
    step("Inferred grade bands:",
         " + ".join(alignment_data.get("inferred_grade_bands", [])) or "(none)")
    step("Auto-picked:",
         f"{n_with_picks}/{len(alignment_data['objectives'])} objectives")
    step("Rerank time:", f"{t() - t2:.2f}s")

    # 3. Curation
    if demo_mode: banner("Stage 3: Curation -> final.json")
    else: print("\n[3/4] Curation...")
    t3 = t()
    if curate_method == "gemini":
        try:
            if model is None:
                model = _require_gemini_model()
            final_data = curate_with_gemini(
                alignment_data,
                model,
                gemini_tracker,
                use_gemini_autopicks=offload_all,
            )
            if offload_all:
                final_data = gemini_qa_review(final_data, model, gemini_tracker)
            method_label = f"Gemini API ({GEMINI_MODEL_NAME})"
        except Exception as e:
            print(f"  Gemini curation failed ({e}); falling back to heuristic.")
            final_data = auto_pick_to_final(alignment_data)
            method_label = "heuristic auto-pick (Gemini fallback)"
    else:
        final_data = auto_pick_to_final(alignment_data)
        method_label = "heuristic auto-pick"
    # Default: write to <stem>.demo.final.json so we never clobber an existing
    # hand-curated <stem>.final.json. Use --overwrite to replace the canonical one.
    canonical = ART_DIR / f"{stem}.final.json"
    demo_final = ART_DIR / f"{stem}.demo.final.json"
    if overwrite:
        final_path = canonical
    elif canonical.exists():
        final_path = demo_final
        print(f"  (canonical {canonical.name} exists; writing to {demo_final.name} "
              f"to preserve it. Use --overwrite to replace.)")
    else:
        final_path = canonical
    final_path.write_text(
        json.dumps(final_data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    n_aligned = sum(1 for o in final_data["objectives"] if o.get("alignments"))
    n_total_picks = sum(len(o.get("alignments", [])) for o in final_data["objectives"])
    n_high = sum(1 for o in final_data["objectives"] for a in o.get("alignments", [])
                 if a.get("confidence") == "high")
    step("Method:", method_label)
    step("Aligned objectives:",
         f"{n_aligned}/{len(final_data['objectives'])}")
    step("Total alignments:", str(n_total_picks))
    step("High-confidence:", str(n_high))
    step("Curation time:", f"{t() - t3:.2f}s")
    if curate_method == "gemini" or offload_all:
        step("Gemini calls:", str(gemini_tracker.calls))
        step("Est. Gemini cost:", f"${gemini_tracker.estimated_usd():.4f}")
        actual = gemini_tracker.actual_usd()
        if actual is not None:
            step("Actual Gemini cost:", f"${actual:.4f}")

    # 4. PDF
    if do_pdf:
        if demo_mode: banner("Stage 4: PDF Render")
        else: print("\n[4/4] PDF render...")
        t4 = t()
        try:
            import make_pdf
            pdf_path = ART_DIR / f"{stem}.alignment.pdf"
            make_pdf.build_pdf(final_path, pdf_path)
            step("PDF written:", str(pdf_path.relative_to(ROOT)))
            step("PDF time:", f"{t() - t4:.2f}s")
        except Exception as e:
            print(f"  PDF generation failed: {e}")

    # 5. Dashboard regen (subprocess to avoid argparse collisions)
    if do_dashboard:
        if demo_mode: banner("Stage 5: Dashboard Regenerate")
        else: print("\n[Dashboard...]")
        t5 = t()
        try:
            r = subprocess.run(
                [sys.executable, str(TOOLS / "make_dashboard.py")],
                capture_output=True, text=True, cwd=str(ROOT),
            )
            if r.returncode == 0:
                step("Dashboard:", str((ART_DIR / "alignment_dashboard.html").relative_to(ROOT)))
                # Echo the dashboard's own summary line
                for line in r.stdout.splitlines():
                    if "edusperiences:" in line or "total objectives:" in line:
                        step("  " + line.strip().split(":", 1)[0] + ":",
                             line.split(":", 1)[1].strip())
            else:
                print(f"  Dashboard regen exit={r.returncode}")
                if r.stderr:
                    print(f"  stderr: {r.stderr.strip()[:200]}")
            step("Dashboard time:", f"{t() - t5:.2f}s")
        except Exception as e:
            print(f"  Dashboard regen failed: {e}")

    # Summary
    if demo_mode: banner("RESULT")
    else: print("\nResult:")
    step("Total time:", f"{t() - t0:.2f}s")
    step("Subject:", f"{subject} ({final_data.get('standards_group','')})")
    step("Objectives:", str(len(final_data["objectives"])))
    step("Aligned:", str(n_aligned))
    step("Total alignments:", str(n_total_picks))
    step("final.json:", str(final_path.relative_to(ROOT)))
    if curate_method == "gemini" or offload_all:
        step("Est. API cost:", f"${gemini_tracker.estimated_usd():.4f}")
    if do_pdf:
        step("PDF:", f"artifacts/{stem}.alignment.pdf")
    if do_dashboard:
        step("Dashboard:", "artifacts/alignment_dashboard.html")

    if demo_mode and final_data["objectives"]:
        print()
        print("  Top picks (first aligned objectives):")
        shown = 0
        for o in final_data["objectives"]:
            if not o.get("alignments"):
                continue
            picks = ", ".join(
                f"{a['code']}({a.get('confidence','?')[:1].upper()})"
                for a in o["alignments"]
            )
            title_short = (o["title"] or "")[:48]
            print(f"    - {title_short:<50} -> {picks}")
            shown += 1
            if shown >= 6:
                break

    return 0


def build_parser():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("edusperience", help="Path to an edusperience JSON file")
    p.add_argument("--subject",
                   choices=["auto", "ela", "math", "history", "science"],
                   default="auto",
                   help="Force a specific subject (default: auto-detect)")
    p.add_argument("--curate",
                   choices=["heuristic", "gemini"],
                   default="gemini",
                   help="Curation method (default: gemini; "
                        "gemini requires GEMINI_API_KEY)")
    p.add_argument("--no-pdf", action="store_true", help="Skip PDF rendering")
    p.add_argument("--no-dashboard", action="store_true",
                   help="Skip dashboard regeneration")
    p.add_argument("--demo", action="store_true",
                   help="Extra-pretty output for live demos")
    p.add_argument("--overwrite", action="store_true",
                   help="Overwrite an existing <stem>.final.json. By default a "
                        "canonical final is preserved and output is written to "
                        "<stem>.demo.final.json.")
    p.add_argument(
        "--offload-all",
        action="store_true",
        help="Use Gemini for subject detect + grade inference + rerank tie-break + QA review "
             "(requires GEMINI_API_KEY and --curate gemini for end-to-end LLM curation).",
    )
    return p


def main():
    args = build_parser().parse_args()
    return run(
        edu_path=args.edusperience,
        subject_override=None if args.subject == "auto" else args.subject,
        curate_method=args.curate,
        do_pdf=not args.no_pdf,
        do_dashboard=not args.no_dashboard,
        demo_mode=args.demo,
        overwrite=args.overwrite,
        offload_all=args.offload_all,
    )


if __name__ == "__main__":
    sys.exit(main() or 0)
