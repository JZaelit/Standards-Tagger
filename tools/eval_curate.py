"""
Regression eval: how well does tools/curate.py match the hand-curated
*.final.json ground truth?

For each pair (artifacts/<stem>.curated.json, artifacts/<stem>.final.json)
we treat the curated picks as a multilabel classification problem on
standards codes:
  TP = code appears on both sides for the same objective
  FP = code only on the AI side (over-pick)
  FN = code only on the human side (miss)

Reports per-stem and overall precision / recall / F1, plus a per-objective
diff so prompt regressions are visible at a glance.

Usage:
  python3 tools/eval_curate.py
  python3 tools/eval_curate.py --stems budget romeo_essay
  python3 tools/eval_curate.py --verbose      # print every objective
  python3 tools/eval_curate.py --confidence high   # only count picks >= high

Exit code: 0 always (this is a report, not a pass/fail gate). Wire to a
threshold later if you want a CI gate.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART_DIR = ROOT / "artifacts"

CONFIDENCE_RANK = {"low": 1, "medium": 2, "high": 3}


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def codes_for_objective(obj, min_conf_rank: int) -> set[str]:
    """Set of codes from one objective entry, filtered by confidence floor."""
    out = set()
    for a in obj.get("alignments") or []:
        code = a.get("code")
        if not code:
            continue
        rank = CONFIDENCE_RANK.get(a.get("confidence") or "high", 3)
        if rank >= min_conf_rank:
            out.add(code)
    return out


def index_by_path(data) -> dict[str, dict]:
    return {o.get("path"): o for o in (data.get("objectives") or [])
            if o.get("path")}


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f


def eval_pair(curated_path: Path, final_path: Path,
              min_conf_rank: int, verbose: bool) -> dict:
    curated = load_json(curated_path)
    final = load_json(final_path)
    cur_by_path = index_by_path(curated)
    fin_by_path = index_by_path(final)
    all_paths = sorted(set(cur_by_path) | set(fin_by_path))

    tp = fp = fn = 0
    obj_diffs = []
    n_total = len(all_paths)
    n_exact = 0
    for path in all_paths:
        cur_codes = codes_for_objective(cur_by_path.get(path) or {}, min_conf_rank)
        fin_codes = codes_for_objective(fin_by_path.get(path) or {}, min_conf_rank)
        common = cur_codes & fin_codes
        only_ai = cur_codes - fin_codes
        only_h = fin_codes - cur_codes
        tp += len(common)
        fp += len(only_ai)
        fn += len(only_h)
        if not only_ai and not only_h:
            n_exact += 1
        if verbose or only_ai or only_h:
            title = (cur_by_path.get(path) or fin_by_path.get(path) or {}) \
                .get("title") or ""
            obj_diffs.append({
                "path": path,
                "title": title,
                "common": sorted(common),
                "only_ai": sorted(only_ai),
                "only_h": sorted(only_h),
            })

    p, r, f1 = prf(tp, fp, fn)
    return {
        "stem": curated_path.name.replace(".curated.json", ""),
        "n_objectives": n_total,
        "n_exact": n_exact,
        "tp": tp, "fp": fp, "fn": fn,
        "precision": p, "recall": r, "f1": f1,
        "diffs": obj_diffs,
    }


def print_report(rep: dict, verbose: bool):
    print(f"\n=== {rep['stem']} ===")
    print(f"  objectives: {rep['n_objectives']}  exact-match: {rep['n_exact']}")
    print(f"  TP={rep['tp']}  FP={rep['fp']}  FN={rep['fn']}")
    print(f"  P={rep['precision']:.3f}  R={rep['recall']:.3f}  F1={rep['f1']:.3f}")
    if not rep["diffs"]:
        return
    print("  diffs:")
    for d in rep["diffs"]:
        flag = "OK" if not d["only_ai"] and not d["only_h"] else "DIFF"
        title = d["title"][:50]
        print(f"    [{flag}] {d['path']}  {title}")
        if d["common"]:
            print(f"           common:  {', '.join(d['common'])}")
        if d["only_ai"]:
            print(f"           only AI: {', '.join(d['only_ai'])}")
        if d["only_h"]:
            print(f"           only H:  {', '.join(d['only_h'])}")


def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--stems", nargs="*",
                   help="Limit to these edusperience stems (e.g. budget romeo_essay). "
                        "Default: every stem with both .curated.json and .final.json.")
    p.add_argument("--confidence", choices=["low", "medium", "high"], default="low",
                   help="Confidence floor: only picks at this level or above are "
                        "counted. Default 'low' (count every pick).")
    p.add_argument("--verbose", action="store_true",
                   help="Print every objective, not just disagreements.")
    args = p.parse_args()

    min_rank = CONFIDENCE_RANK[args.confidence]

    # Discover pairs.
    if args.stems:
        stems = args.stems
    else:
        stems = sorted({p_.name.replace(".curated.json", "")
                        for p_ in ART_DIR.glob("*.curated.json")})

    pairs = []
    missing = []
    for stem in stems:
        c = ART_DIR / f"{stem}.curated.json"
        f = ART_DIR / f"{stem}.final.json"
        if c.exists() and f.exists():
            pairs.append((c, f))
        else:
            missing.append(stem)

    if missing:
        sys.stderr.write(
            f"Skipping (need both .curated.json and .final.json): "
            f"{', '.join(missing)}\n"
        )
    if not pairs:
        sys.stderr.write(
            "No (curated, final) pairs found. Run tools/curate.py first.\n"
        )
        return 1

    reports = [eval_pair(c, f, min_rank, args.verbose) for c, f in pairs]
    for rep in reports:
        print_report(rep, args.verbose)

    # Overall (micro-averaged across all objectives).
    tp = sum(r["tp"] for r in reports)
    fp = sum(r["fp"] for r in reports)
    fn = sum(r["fn"] for r in reports)
    n_obj = sum(r["n_objectives"] for r in reports)
    n_exact = sum(r["n_exact"] for r in reports)
    p_, r_, f_ = prf(tp, fp, fn)
    print("\n=== OVERALL ===")
    print(f"  stems: {len(reports)}  objectives: {n_obj}  "
          f"exact-match: {n_exact} ({100*n_exact/n_obj:.1f}%)")
    print(f"  TP={tp}  FP={fp}  FN={fn}")
    print(f"  precision={p_:.3f}  recall={r_:.3f}  F1={f_:.3f}")
    print(f"  confidence floor: {args.confidence}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
