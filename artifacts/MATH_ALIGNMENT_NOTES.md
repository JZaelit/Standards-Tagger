# Math Alignment — Pipeline Notes

End-to-end math alignment is wired up and validated against `budget.json`
and `WWII_data.json`.

## Pipeline

```
edusperiences/<name>.json
  └─ tools/align.py shortlist          (TF-IDF top-K against CA-MATH.json)
       └─ artifacts/<name>.shortlist.json
            └─ tools/rerank.py         (grade band + math domain keyword boosts)
                 └─ artifacts/<name>.alignment.json
```

`align.py` auto-detects ELA vs Math via title/description keywords, or you
can force with `--subject ela|math|both|auto` (default `auto`).

`rerank.py` reads the `subject` field on the shortlist and routes to
`rerank_ela()` or `rerank_math()`.

## Spot-check results

### budget.json (27 objectives, HS finance / Algebra II level)

Reasonable auto-picks:
- Tax/Income/Net Pay → A-SSE.B.3.c (algebraic expressions)
- Sum Function → F-IF.A.1 (function notation)
- Pie Chart → S-ID.A.4 (data display)
- Budget Realism → F-LE.B.5 (interpret parameters)
- Reusing/Modify Formulas → F-BF.A.2 (build sequences)
- Notes → MP.4 (Model with mathematics)

Correctly suppressed (logistical / metacognitive):
- Watch Me, Personal Information → no standard (logistical)
- Spreadsheet/AI/50-30-20 Reflection → no standard (metacognitive)

### WWII_data.json (13 objectives, HS data analysis)

Reasonable:
- XLOOKUP, Absolute References → F-IF.A.1 (function notation)
- Casualty Rate → F-IF.A.1 / 8.F.A.1 / F-IF.B.6
- Fill Operation → F-IF.B.6 (rate of change)

Correctly suppressed:
- Data Test → no standard (logistical)
- Data/Spreadsheet/AI Reflection → no standard (metacognitive)

Weak (TF-IDF retrieval gap):
- Total Military Personnel/Deaths → 3.OA.A.1 (multiplication) — should hit
  S-ID for HS data analysis, but TF-IDF doesn't see the connection
- Pie Chart / Column Chart → 3.MD.C.7.d (rectilinear area) — TF-IDF
  attached to "area" in the standard text instead of "chart"
- AI & Critical Thinking → 1.NBT.C.6 (low-confidence noise)

## Known limitations

1. **Lexical retrieval (TF-IDF) is brittle for data-analysis topics.**
   Spreadsheet activities like "Pie Chart" or "Column Chart" don't lexically
   overlap with S-ID standard text. A sentence-transformer embedding pass
   would help here. For now, the human/LLM reranker should override.

2. **Grade-band penalty is soft (-0.05).** Lower-grade content matches can
   still surface (e.g., 7.RP percent problems for an HS budget course).
   Keyword boosts (+0.20) can push lower-grade standards back into the top-5
   when they're the conceptually best match.

3. **HARD_SKIP titles never tag a standard.** Titles matching
   `^... (reflection|metacognit|takeaways|what did you learn|ai prompt) ...$`
   are routed to "no standard applies". This avoids false positives where
   "Reflection" overlaps with G-CO.A.5 geometric reflections.

4. **Missing math sections.** The parser does not emit Calculus (CA) or
   Advanced Probability and Statistics (CA) — these California-only courses
   were beyond the v1 scope. Standard CCSS-M (Mathematical Practices, K-8,
   9-12 by Conceptual Category) is fully covered (519 records).

## Done in v1.1

- `make_pdf.py` is now subject-aware. It loads the standards DB declared
  in the `.final.json` (`standards_db` field), routes chip metadata to
  ELA (strand/subgroup) or math (category/cluster) display fields, and
  renders the subject-appropriate subtitle.
- `budget.final.json` and `WWII_data.final.json` have been re-curated
  against the math alignment. Both now produce math alignment PDFs:
  `artifacts/budget.alignment.pdf` and `artifacts/WWII_data.alignment.pdf`.

## Next moves

- Sentence-transformer embeddings (e.g., `all-MiniLM-L6-v2`) to replace or
  supplement TF-IDF retrieval. Would help "Pie Chart" → S-ID and similar
  semantic gaps.
- Add CA-only Calculus and Adv. Probability and Statistics sections to the
  math parser if those edusperiences come up.
