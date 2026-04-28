# Step 2 — Alignment Pipeline Report

End-to-end hybrid alignment of edusperience objectives to California CCSS ELA
standards, with curated LLM-step picks for the three literature essays.

---

## 1. Pipeline Overview

```
  edusperiences/*.json
         │
         ▼
  ┌──────────────────────────┐      categorized-standards/California/CA-ELA.json
  │ 1. TF-IDF Shortlist       │◄─── (1,078 leaf standards
  │    tools/align.py          │       w/ strand, grade, text)
  │    → top-15 candidates     │
  └──────────────┬──────────────┘
                 ▼
   artifacts/<stem>.shortlist.json
                 │
                 ▼
  ┌──────────────────────────┐
  │ 2. Heuristic Rerank        │
  │    tools/rerank.py         │
  │    • grade-band inference  │
  │    • keyword → strand boost │
  │    → top-5 + auto-pick      │
  └──────────────┬──────────────┘
                 ▼
   artifacts/<stem>.alignment.json
                 │
                 ▼
  ┌──────────────────────────┐
  │ 3. LLM Curation (Claude)   │
  │    • reads shortlist+rerank │
  │    • picks 1–3 codes        │
  │    • writes rationale       │
  │    • flags logistical items │
  └──────────────┬──────────────┘
                 ▼
   artifacts/<stem>.final.json        ← reviewable deliverable
```

Stage 1 is deterministic lexical retrieval. Stage 2 applies grade-band and
strand-keyword nudges. Stage 3 is the authoring step where an LLM (this
session) reads both the candidate bundle and the objective in context, then
commits to 1–3 codes per objective with confidence and rationale. Objectives
that are purely logistical (file naming, MLA heading, inserting section
breaks) are explicitly flagged as "no ELA standard applies" rather than being
force-fit to a weak match.

---

## 2. Standards Database

`categorized-standards/California/CA-ELA.json` — **1,078 leaf records** parsed from the CA CCSS ELA PDF:

| Kind                       | Count |
|:---------------------------|------:|
| CCR Anchor Standards       |    32 |
| Numbered grade standards   |   568 |
| Sub-bullets (.a/.b/.c/...) |   478 |
| of which CA additions      |   106 |

Covers K–12 across strands: RL, RI, RF, W, SL, L (core) plus the 6–12 Literacy
strands RH, RST, WHST. Spot-checks in Step 1 validated CCRA.R.1–10, CCRA.W.10,
RL.K.10 sub-bullets, RF.K.2.f, W.3.1.a–d, etc. (no footer contamination, no
duplicate codes, CA additions correctly flagged).

---

## 3. Curated Alignments — Three Literature Essays

All codes below were validated to exist in `categorized-standards/California/CA-ELA.json`. Codes marked
`(high)`/`(med)`/`(low)` carry a confidence tag. Logistical objectives are
intentionally left unaligned.

### 3.1 Mockingbird Essay (`mockingbird_essay.final.json`)

Grade band inferred: **9–10 / 11–12** — high-school literary analysis essay.
Aligned 5 of 6 objectives. 11 unique codes assigned.

| Objective                       | Codes                                        |
|:--------------------------------|:---------------------------------------------|
| Naming Convention               | — (logistical)                               |
| Essay Length (500–1000 words)   | W.9-10.4 (high)                              |
| Essay Elements (hyperlinks/images) | W.9-10.6 (high), W.9-10.2.a (med)         |
| Essay Content (characters/scenes) | RL.9-10.3 (high), W.9-10.9.a (med)         |
| Subjective AI (depth, evidence, coherence) | W.9-10.1 (high), W.9-10.1.b (high), RL.9-10.1 (high) |
| Objective AI (spelling/grammar/format) | L.9-10.1 (high), L.9-10.2 (high), W.9-10.4 (med) |

### 3.2 Odyssey Mini Essay V2 (`odyssey_essay.final.json`)

Grade band inferred: **9–10 / 11–12**. Aligned 11 of 13 objectives. Emphasises
the full W.9-10.1 family (a → e) because this is a planned-then-drafted
argumentative mini-essay.

| Objective                            | Codes                                       |
|:-------------------------------------|:--------------------------------------------|
| GradeFlow Intro                      | — (platform onboarding)                     |
| MLA Heading                          | W.9-10.4 (low)                              |
| Essay Title                          | W.9-10.4 (med)                              |
| Prewriting — Introduction            | W.9-10.5 (high), W.9-10.1.a (high)          |
| Prewriting — Topic & Commentary      | W.9-10.5 (high), W.9-10.1.b (high)          |
| Prewriting — Commentary & Conclusion | W.9-10.5 (high), W.9-10.1.e (med)           |
| Insert Section Breaks                | — (platform formatting)                     |
| Introduction Paragraph               | W.9-10.1 (high), W.9-10.1.a (high)          |
| Body Paragraph                       | W.9-10.1.b (high), W.9-10.1.c (high), RL.9-10.1 (high) |
| Prewriting Connections (review)      | W.9-10.5 (high)                             |
| Intro Paragraph (Teacher Graded)     | W.9-10.1.a (high)                           |
| Body Paragraph (Teacher Graded)      | W.9-10.1.b (high), RL.9-10.3 (med)          |
| Quality and Format                   | W.9-10.1.d (high), L.9-10.3 (med), L.9-10.1 (med) |

### 3.3 Romeo and Juliet Consequences Essay (`romeo_essay.final.json`)

Grade band inferred: **9–10 / 11–12**. Aligned 14 of 17 objectives. Four-
paragraph argumentative essay with a separate teacher-review section.

| Objective                            | Codes                                        |
|:-------------------------------------|:---------------------------------------------|
| Essay Header (MLA)                   | — (logistical)                               |
| Essay Title                          | W.9-10.4 (low)                               |
| Essay Sections (section breaks)      | — (platform)                                 |
| Introduction Paragraph               | W.9-10.1.a (high), W.9-10.1 (high)           |
| Hook and Thesis Statement            | W.9-10.1.a (high)                            |
| First Body Paragraph                 | W.9-10.1.b (high), RL.9-10.1 (high)          |
| Second Body Paragraph                | W.9-10.1.b (high), RL.9-10.1 (high)          |
| Body Paragraph Evidence (verify)     | W.9-10.1.b (high), W.9-10.1.c (med)          |
| Conclusion Paragraph                 | W.9-10.1.e (high)                            |
| File Name                            | — (logistical)                               |
| Intro Paragraph (Teacher Review)     | W.9-10.1.a (high)                            |
| Body #1 (Teacher Review — evidence)  | W.9-10.1.b (high), RL.9-10.1 (high)          |
| Body #1 Commentary                   | W.9-10.1.b (high), RL.9-10.2 (med)           |
| Body #2 (Teacher Review — evidence)  | W.9-10.1.b (high), RL.9-10.1 (high)          |
| Body #2 Commentary                   | W.9-10.1.b (high), RL.9-10.2 (med)           |
| V4 Conclusion Paragraph              | W.9-10.1.e (high)                            |
| Overall Structure / Format           | L.9-10.1 (high), L.9-10.2 (high), L.9-10.3 (high), W.9-10.4 (med) |

### 3.4 Code-usage roll-up across the three essays

`W.9-10.1.b` dominates (evidence/development in every body paragraph).
`W.9-10.1.a` and `W.9-10.1.e` anchor intros and conclusions. `RL.9-10.1`
covers textual evidence. `L.9-10.1/.2/.3` picks up conventions/style.
`W.9-10.5` appears only for the Odyssey prewriting step — which is the
only essay that explicitly scaffolds planning.

---

## 4. Non-Literature Edusperiences — Current Status

The three non-literature edusperiences were run through Stages 1 and 2 but
**not** yet hand-curated in Stage 3. Their auto-picks are published to
`artifacts/<stem>.alignment.json`.

| Edusperience   | Auto-pick quality             | Notes                                                                 |
|:---------------|:------------------------------|:----------------------------------------------------------------------|
| `resume`       | mixed                         | W.*.1.e (conclusion-like prose) lands fine; "File Name"/"Table"/headers are noisy |
| `budget`       | poor                          | Math/spreadsheet work — "Sum Function" → W.3.1.c is nonsense; ELA isn't the right framework here |
| `WWII_data`    | poor                          | Same shape as budget; "Pie Chart" → RST.9-10.7 is incidentally close but most picks drift |

These are the expected failure modes of ELA-only tagging: spreadsheet and
data-analysis objectives need a math/CTE/NGSS standards DB, not ELA. The
**reflection-style** sub-objectives (e.g. "Spreadsheet Reflection", "AI
Reflection", "50/30/20 Reflection") are genuinely ELA-shaped and could be
curated in a second pass if desired.

---

## 5. Suggested Next Steps

1. **Human review of the three `.final.json` files.** Confirm the picks and
   rationale read correctly. Anything flagged should be edited in place —
   the JSON is the source of truth.
2. **Decide scope for non-literature edusperiences.** Either (a) curate only
   the reflection-style objectives inside resume/budget/WWII_data, or (b)
   defer until a math/CTE standards DB is available.
3. **Formalise Stage 3.** The current curation is hand-authored in-session;
   it could be wrapped as `tools/curate.py` that pipes each
   `<stem>.alignment.json` plus the original objective text into a single
   LLM call and writes the `<stem>.final.json` directly.
4. **Retrieval upgrade (optional).** TF-IDF is serviceable on long, well-
   worded objectives; it weakens on short ones. A small sentence-transformer
   embedding (once network/model access is available) would meaningfully
   raise Stage 1 recall.

---

*Files:
`artifacts/mockingbird_essay.final.json`,
`artifacts/odyssey_essay.final.json`,
`artifacts/romeo_essay.final.json`,
`artifacts/*.alignment.json` (all 6),
`artifacts/*.shortlist.json` (all 6).*
