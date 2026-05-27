"""
Stage 3 of the alignment pipeline: LLM curation of reranked candidates.

Reads `artifacts/<stem>.alignment.json` produced by tools/rerank.py and, for
each objective, asks Claude to pick the 0-3 candidate standards that
genuinely apply. Output mirrors the existing hand-curated `*.final.json`
shape so you can diff against ground truth (see tools/eval_curate.py).

Usage:
  python3 tools/curate.py artifacts/budget.alignment.json
  python3 tools/curate.py --all
  python3 tools/curate.py --all --max-objectives 5    # smoke test, 5 objs total
  python3 tools/curate.py --all --dry-run             # estimate cost only

Requires:
  ANTHROPIC_API_KEY in env.
  pip install anthropic   (see tools/requirements.txt)

Cost: at default --top-n 5 candidates, roughly 1.5k input + 0.4k output tokens
per objective. The full six edusperiences (~140 objectives total) costs about
$0.60 on Claude Sonnet 4.5 at $3/M input + $15/M output. The dry-run flag
prints a per-file estimate before any API call.
"""
from __future__ import annotations
import argparse
import glob
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART_DIR = ROOT / "artifacts"
PROMPT_PATH = ROOT / "tools" / "prompts" / "curate.md"

DEFAULT_MODEL = "claude-sonnet-4-5"
DEFAULT_MAX_TOKENS = 1024
DEFAULT_TOP_N = 5  # how many reranked candidates to show the model

# Sonnet 4.5 list pricing (per million tokens). Used only for the dry-run
# estimate; not authoritative.
PRICE_PER_M_INPUT_USD = 3.0
PRICE_PER_M_OUTPUT_USD = 15.0
# Output tokens per objective is dominated by the structured tool-call JSON;
# 0.4k is a generous-but-realistic average across the six seeded edusperiences.
ESTIMATED_OUTPUT_TOKENS_PER_OBJ = 400

# Tool-use schema. Forces Claude into structured output instead of free text.
SUBMIT_TOOL = {
    "name": "submit_alignments",
    "description": (
        "Submit the curated standards alignments for this objective. "
        "Return picks=[] when no candidate genuinely applies."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "picks": {
                "type": "array",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string"},
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                        },
                        "rationale": {"type": "string"},
                    },
                    "required": ["code", "confidence", "rationale"],
                },
            },
            "note": {
                "type": "string",
                "description": (
                    "Optional. When picks is empty, a one-sentence reason "
                    "(e.g. 'reflective writing, no math standard applies'). "
                    "When picks is non-empty, an optional caveat."
                ),
            },
        },
        "required": ["picks"],
    },
}


# ---------- Prompt assembly ----------

def load_prompt_template() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def render_candidates(cands: list[dict]) -> str:
    """Render reranked candidates as a numbered list the model can quote.

    Keeps fields minimal and consistent across subjects (the model only
    needs code + grade + text + the soft signal that this was top-N).
    """
    lines = []
    for i, c in enumerate(cands, 1):
        code = c.get("code") or "?"
        grade = c.get("grade") or c.get("grade_band") or ""
        score = c.get("final_score")
        score_str = f"{score:.2f}" if isinstance(score, (int, float)) else "?"
        text = (c.get("text") or "").strip()
        head = f"{i}. {code}"
        if grade:
            head += f"  [grade {grade}]"
        head += f"  (score {score_str})"
        lines.append(head)
        if text:
            lines.append(f"   {text}")
    return "\n".join(lines) if lines else "(none)"


def render_prompt(template: str, alignment: dict, obj: dict, top_n: int) -> str:
    cands = (obj.get("reranked_candidates") or [])[:top_n]
    candidate_codes = {c.get("code") for c in cands if c.get("code")}
    rendered = (
        template
        .replace("{{edusperience_title}}", alignment.get("edusperience_title") or "")
        .replace("{{edusperience_description}}",
                 alignment.get("edusperience_description") or "")
        .replace("{{subject}}", alignment.get("subject") or "ela")
        .replace("{{inferred_grade_bands}}",
                 ", ".join(alignment.get("inferred_grade_bands") or []) or "(unknown)")
        .replace("{{section_title}}", obj.get("section_title") or "")
        .replace("{{objective_title}}", obj.get("objective_title") or "")
        .replace("{{objective_description}}", obj.get("objective_description") or "")
        .replace("{{candidates}}", render_candidates(cands))
    )
    return rendered, candidate_codes


# ---------- Anthropic call ----------

def _import_anthropic():
    try:
        from anthropic import Anthropic
    except ImportError as e:
        sys.stderr.write(
            "Missing dependency: anthropic. Install with:\n"
            "  pip install -r tools/requirements.txt\n"
        )
        raise SystemExit(2) from e
    return Anthropic


def call_curate(client, model, prompt: str, candidate_codes: set[str],
                max_tokens: int = DEFAULT_MAX_TOKENS) -> tuple[dict, dict]:
    """Single curate call. Returns (parsed_input, usage_dict).

    `parsed_input` matches the tool's input_schema:
      {"picks": [{"code","confidence","rationale"}, ...], "note": "..."}

    Raises ValueError if the model never produced a usable tool_use block,
    or if any returned code is not in candidate_codes (we never accept
    hallucinated codes).
    """
    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        tools=[SUBMIT_TOOL],
        tool_choice={"type": "tool", "name": "submit_alignments"},
        messages=[{"role": "user", "content": prompt}],
    )
    usage = {
        "input_tokens": getattr(resp.usage, "input_tokens", 0),
        "output_tokens": getattr(resp.usage, "output_tokens", 0),
    }
    tool_input = None
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "submit_alignments":
            tool_input = block.input
            break
    if tool_input is None:
        raise ValueError("model returned no tool_use block")

    picks = tool_input.get("picks") or []
    cleaned_picks = []
    for p in picks:
        code = p.get("code")
        conf = p.get("confidence")
        rationale = p.get("rationale") or ""
        if code not in candidate_codes:
            raise ValueError(f"hallucinated code not in candidate list: {code!r}")
        if conf not in ("high", "medium", "low"):
            raise ValueError(f"invalid confidence: {conf!r}")
        cleaned_picks.append({
            "code": code,
            "confidence": conf,
            "rationale": rationale.strip(),
        })

    out = {"picks": cleaned_picks}
    note = (tool_input.get("note") or "").strip()
    if note:
        out["note"] = note
    return out, usage


def call_curate_with_retry(client, model, prompt, candidate_codes, max_tokens):
    try:
        return call_curate(client, model, prompt, candidate_codes, max_tokens)
    except ValueError as e:
        sys.stderr.write(f"      retry after validation error: {e}\n")
        time.sleep(0.5)
        return call_curate(client, model, prompt, candidate_codes, max_tokens)


# ---------- Cost estimate ----------

def estimate_input_tokens(prompt: str) -> int:
    # Anthropic's tokenizer is similar in scale to ~3.6 chars/token for
    # English. Use 4 for a safe, slightly-pessimistic estimate.
    return max(1, len(prompt) // 4)


def estimate_cost(prompt_lengths_chars: list[int]) -> dict:
    in_tokens = sum(max(1, n // 4) for n in prompt_lengths_chars)
    out_tokens = ESTIMATED_OUTPUT_TOKENS_PER_OBJ * len(prompt_lengths_chars)
    cost = (in_tokens * PRICE_PER_M_INPUT_USD
            + out_tokens * PRICE_PER_M_OUTPUT_USD) / 1_000_000
    return {
        "n_objectives": len(prompt_lengths_chars),
        "input_tokens_est": in_tokens,
        "output_tokens_est": out_tokens,
        "cost_usd_est": round(cost, 4),
    }


# ---------- Driver ----------

def process_file(client, model, alignment_path: Path, top_n: int,
                 max_objectives: int | None, dry_run: bool) -> dict:
    """Curate one alignment.json. Returns a usage summary dict."""
    align = json.loads(alignment_path.read_text(encoding="utf-8"))
    template = load_prompt_template()

    objs = align.get("objectives") or []
    if max_objectives is not None:
        objs = objs[:max_objectives]

    # Pre-render every prompt so the dry-run cost estimate is accurate.
    rendered = []
    for o in objs:
        prompt, codes = render_prompt(template, align, o, top_n)
        rendered.append((o, prompt, codes))

    est = estimate_cost([len(p) for _, p, _ in rendered])
    stem = alignment_path.name.replace(".alignment.json", "")
    sys.stderr.write(
        f"{stem}: {est['n_objectives']} objectives, "
        f"~{est['input_tokens_est']:,} in + {est['output_tokens_est']:,} out tokens, "
        f"~${est['cost_usd_est']:.4f}\n"
    )
    if dry_run:
        return {"stem": stem, **est, "called": False}

    out_objs = []
    total_in = 0
    total_out = 0
    for i, (o, prompt, codes) in enumerate(rendered, 1):
        sys.stderr.write(f"  [{i}/{len(rendered)}] {o.get('objective_title','')[:60]}\n")
        try:
            result, usage = call_curate_with_retry(
                client, model, prompt, codes, DEFAULT_MAX_TOKENS,
            )
        except Exception as e:
            sys.stderr.write(f"      FAILED after retry: {e}; skipping\n")
            result = {"picks": [], "note": f"curate failed: {e}"}
            usage = {"input_tokens": 0, "output_tokens": 0}
        total_in += usage["input_tokens"]
        total_out += usage["output_tokens"]
        out_objs.append({
            "path": o.get("path"),
            "title": o.get("objective_title") or "",
            "description": o.get("objective_description") or "",
            "alignments": result.get("picks", []),
            **({"note": result["note"]} if result.get("note") else {}),
        })

    out = {
        "edusperience_id": align.get("edusperience_id"),
        "edusperience_title": align.get("edusperience_title"),
        "source_file": align.get("source_file"),
        "subject": align.get("subject"),
        "inferred_grade_bands": align.get("inferred_grade_bands"),
        "standards_db": align.get("standards_db"),
        "alignment_method": (
            "hybrid: tfidf shortlist -> grade+keyword rerank -> "
            f"LLM curation ({model})"
        ),
        "objectives": out_objs,
    }
    out_path = ART_DIR / f"{stem}.curated.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False),
                        encoding="utf-8")
    sys.stderr.write(
        f"  -> {out_path.relative_to(ROOT)}  "
        f"(in {total_in:,} + out {total_out:,} tokens)\n"
    )
    return {
        "stem": stem,
        "n_objectives": len(out_objs),
        "input_tokens_actual": total_in,
        "output_tokens_actual": total_out,
        "called": True,
    }


def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("alignments", nargs="*",
                   help="Paths to artifacts/*.alignment.json files")
    p.add_argument("--all", action="store_true",
                   help="Process every artifacts/*.alignment.json (skips per-subject "
                        "splits like *.history.alignment.json)")
    p.add_argument("--top-n", type=int, default=DEFAULT_TOP_N,
                   help=f"How many reranked candidates to show the model "
                        f"(default {DEFAULT_TOP_N})")
    p.add_argument("--max-objectives", type=int, default=None,
                   help="Cap objectives per file. Useful for smoke tests.")
    p.add_argument("--model", default=DEFAULT_MODEL,
                   help=f"Anthropic model id (default {DEFAULT_MODEL})")
    p.add_argument("--dry-run", action="store_true",
                   help="Print token + cost estimate, no API calls")
    args = p.parse_args()

    if args.all:
        # Only top-level *.alignment.json (skip *.history.alignment.json etc.;
        # those are subject-split intermediates).
        all_paths = sorted(ART_DIR.glob("*.alignment.json"))
        paths = [p_ for p_ in all_paths
                 if not re.search(r"\.(ela|math|history|science)\.alignment\.json$",
                                  p_.name)]
    else:
        paths = [Path(s) for s in args.alignments]

    if not paths:
        sys.stderr.write("No alignment.json files to process. "
                         "Pass paths or use --all.\n")
        return 1

    client = None
    if not args.dry_run:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            sys.stderr.write("ANTHROPIC_API_KEY is not set in env. "
                             "Use --dry-run to estimate cost without calling.\n")
            return 2
        Anthropic = _import_anthropic()
        client = Anthropic()

    summaries = []
    for path in paths:
        if not path.exists():
            sys.stderr.write(f"Missing: {path}\n")
            continue
        summaries.append(process_file(
            client, args.model, path, args.top_n,
            args.max_objectives, args.dry_run,
        ))

    if args.dry_run:
        total = {
            "n_objectives": sum(s["n_objectives"] for s in summaries),
            "input_tokens_est": sum(s["input_tokens_est"] for s in summaries),
            "output_tokens_est": sum(s["output_tokens_est"] for s in summaries),
            "cost_usd_est": round(sum(s["cost_usd_est"] for s in summaries), 4),
        }
        sys.stderr.write(
            f"\nDRY RUN TOTAL: {total['n_objectives']} objectives, "
            f"~{total['input_tokens_est']:,} in + {total['output_tokens_est']:,} out, "
            f"~${total['cost_usd_est']:.4f}\n"
        )
    else:
        actual_in = sum(s.get("input_tokens_actual", 0) for s in summaries)
        actual_out = sum(s.get("output_tokens_actual", 0) for s in summaries)
        actual_cost = (actual_in * PRICE_PER_M_INPUT_USD
                       + actual_out * PRICE_PER_M_OUTPUT_USD) / 1_000_000
        sys.stderr.write(
            f"\nDONE: {sum(s['n_objectives'] for s in summaries)} objectives, "
            f"{actual_in:,} in + {actual_out:,} out tokens, "
            f"${actual_cost:.4f} at list price.\n"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
