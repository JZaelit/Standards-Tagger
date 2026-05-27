"""
sync_frontend_seed.py - Populate frontend/src/data/seed/ from artifacts and
edusperiences so the React Native app can bundle the curated alignment data
as a static placeholder dataset.

What it copies / produces:
  - frontend/src/data/seed/finals/<stem>.final.json
        verbatim copy of artifacts/<stem>.final.json
  - frontend/src/data/seed/sources/<stem>.json
        stripped subset of edusperiences/<stem>.json (title, description,
        sections[].{title, description, objectives[].{title, description,
        evaluation_type, points}}). IDs, timestamps, rubric internals,
        attachments, and template metadata are dropped.
  - frontend/src/data/seed/standards/CA-{ELA,MATH,HISTORY}.json
        verbatim copy of categorized-standards/California/CA-*.json
  - frontend/src/data/seed/manifest.json
        list of {stem, subject, source_file, standards_db} used by the
        frontend's seed/index.js to stitch records together.

Run it any time you re-curate an edusperience or update a standards DB:

    python3 tools/sync_frontend_seed.py
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
EDUSPERIENCES = ROOT / "edusperiences"
STANDARDS_DIR = ROOT / "categorized-standards" / "California"

SEED_ROOT = ROOT / "frontend" / "src" / "data" / "seed"
SEED_FINALS = SEED_ROOT / "finals"
SEED_SOURCES = SEED_ROOT / "sources"
SEED_STANDARDS = SEED_ROOT / "standards"

STANDARDS_DBS = ["CA-ELA.json", "CA-MATH.json", "CA-HISTORY.json"]


def strip_source(edu: dict) -> dict:
    """Return the minimal human-readable subset of an edusperience JSON."""
    out_sections = []
    for sec in edu.get("sections", []) or []:
        out_objs = []
        for obj in sec.get("objectives", []) or []:
            out_objs.append({
                "title": obj.get("title", "") or "",
                "description": obj.get("description", "") or "",
                "evaluation_type": obj.get("evaluation_type", "") or "",
                "points": obj.get("points"),
            })
        out_sections.append({
            "title": sec.get("title", "") or "",
            "description": sec.get("description", "") or "",
            "objectives": out_objs,
        })
    return {
        "title": edu.get("title", "") or "",
        "description": edu.get("description", "") or "",
        "sections": out_sections,
    }


def main() -> int:
    if not ARTIFACTS.exists():
        print(f"Missing {ARTIFACTS}")
        return 1
    SEED_FINALS.mkdir(parents=True, exist_ok=True)
    SEED_SOURCES.mkdir(parents=True, exist_ok=True)
    SEED_STANDARDS.mkdir(parents=True, exist_ok=True)

    finals = sorted(ARTIFACTS.glob("*.final.json"))
    if not finals:
        print(f"No *.final.json in {ARTIFACTS}")
        return 1

    manifest = []
    for fp in finals:
        stem = fp.stem.replace(".final", "")

        final_data = json.loads(fp.read_text(encoding="utf-8"))
        shutil.copyfile(fp, SEED_FINALS / fp.name)

        source_rel = final_data.get("source_file", "")
        source_path = ROOT / source_rel if source_rel else None
        wrote_source = False
        if source_path and source_path.exists():
            try:
                edu = json.loads(source_path.read_text(encoding="utf-8"))
                stripped = strip_source(edu)
                (SEED_SOURCES / f"{stem}.json").write_text(
                    json.dumps(stripped, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                wrote_source = True
            except (json.JSONDecodeError, OSError) as e:
                print(f"  warn: could not strip source for {stem}: {e}")

        manifest.append({
            "stem": stem,
            "subject": final_data.get("subject", "ela"),
            "source_file": source_rel,
            "has_source": wrote_source,
            "standards_db": final_data.get(
                "standards_db", "categorized-standards/California/CA-ELA.json"
            ),
            "edusperience_title": final_data.get("edusperience_title", stem),
            "inferred_grade_bands": final_data.get("inferred_grade_bands", []),
            "notes": final_data.get("notes", ""),
        })

    for db_name in STANDARDS_DBS:
        src = STANDARDS_DIR / db_name
        if not src.exists():
            print(f"  warn: missing standards DB {src}")
            continue
        shutil.copyfile(src, SEED_STANDARDS / db_name)

    (SEED_ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Wrote seed to {SEED_ROOT}")
    print(f"  finals:    {len(finals)}")
    print(f"  sources:   {sum(1 for m in manifest if m['has_source'])}")
    print(f"  standards: {sum(1 for d in STANDARDS_DBS if (SEED_STANDARDS / d).exists())}")
    print(f"  manifest:  {len(manifest)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
