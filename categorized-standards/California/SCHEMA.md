# Standards Database Schema

## Location
- `categorized-standards/California/CA-ELA.json` — flat array of every leaf-level ELA standard record (including anchor standards and CA-specific additions)
- `categorized-standards/California/CA-ELA.meta.json` — strand / grade-band / subgroup reference data (so records can stay compact)
- `categorized-standards/California/CA-MATH.json` — flat array of every leaf-level Mathematics standard record (including Mathematical Practices, K-8 content, 9-12 content by Conceptual Category, and CA-specific additions)
- `categorized-standards/California/CA-MATH.meta.json` — domain / category reference data and aggregate record counts

## Naming convention
Categorized standards JSON files go in `categorized-standards/<Jurisdiction>/` and follow `CA-[subject].json` — e.g. `categorized-standards/California/CA-ELA.json`, `CA-MATH.json`, `CA-HISTORY.json`, `CA-SCIENCEearth.json`. Other jurisdictions (e.g. `NGSS`, `TX`) would live in sibling folders under `categorized-standards/`.

## Record shape (CA-ELA.json)

```json
{
  "code": "RL.2.1",
  "full_code": "CCSS.ELA-LITERACY.RL.2.1",
  "strand": "RL",
  "strand_name": "Reading Standards for Literature",
  "section": "K-5 ELA",
  "grade": "2",
  "grade_band": "K-5",
  "subgroup": "Key Ideas and Details",
  "number": 1,
  "sub_letter": null,
  "parent_code": null,
  "anchor_code": "CCRA.R.1",
  "is_anchor": false,
  "ca_addition": false,
  "text": "Ask and answer such questions as who, what, where, when, why, and how to demonstrate understanding of key details in a text.",
  "source_page": 17
}
```

Field notes:
- `grade` is a string (handles K, 1-8, and the bands 9-10 / 11-12)
- `sub_letter` is populated for sub-bullets (e.g. `RL.K.10.a`)
- `parent_code` links a sub-bullet back to its numbered standard
- `anchor_code` links a grade-specific standard back to its CCR anchor (same-numbered)
- `ca_addition: true` means this was added by California on top of the CCSS original
- `is_anchor: true` means this is a CCR anchor standard (code like `CCRA.R.1`); in that case `grade` is `null`

## Strand codes covered

| Code   | Name                                                | Grades  | Section                        |
|--------|-----------------------------------------------------|---------|--------------------------------|
| RL     | Reading Standards for Literature                    | K-12    | K-5 ELA / 6-12 ELA             |
| RI     | Reading Standards for Informational Text            | K-12    | K-5 ELA / 6-12 ELA             |
| RF     | Reading Standards for Foundational Skills           | K-5     | K-5 ELA                        |
| W      | Writing Standards                                   | K-12    | K-5 ELA / 6-12 ELA             |
| SL     | Speaking and Listening Standards                    | K-12    | K-5 ELA / 6-12 ELA             |
| L      | Language Standards                                  | K-12    | K-5 ELA / 6-12 ELA             |
| RH     | Reading Standards for Literacy in History/SS        | 6-12    | 6-12 Literacy in H/SS          |
| RST    | Reading Standards for Literacy in Science/Tech      | 6-12    | 6-12 Literacy in Science/Tech  |
| WHST   | Writing Standards for Literacy in H/SS/Sci/Tech     | 6-12    | 6-12 Literacy in H/SS/Sci/Tech |
| CCRA.R | CCR Anchor Standards for Reading                    | —       | Anchor                         |
| CCRA.W | CCR Anchor Standards for Writing                    | —       | Anchor                         |
| CCRA.SL| CCR Anchor Standards for Speaking and Listening     | —       | Anchor                         |
| CCRA.L | CCR Anchor Standards for Language                   | —       | Anchor                         |

## Record shape (CA-MATH.json)

```json
{
  "code": "3.NF.A.2.a",
  "full_code": "CCSS.MATH.CONTENT.3.NF.A.2.a",
  "section": "K-8 Mathematics",
  "grade": "3",
  "grade_band": "K-5",
  "category": null,
  "category_name": null,
  "domain": "NF",
  "domain_code": "3.NF",
  "domain_name": "Number and Operations—Fractions",
  "cluster_letter": "A",
  "cluster": "Develop understanding of fractions as numbers.",
  "number": 2,
  "sub_letter": "a",
  "parent_code": "3.NF.A.2",
  "is_practice": false,
  "ca_addition": false,
  "plus_standard": false,
  "modeling": false,
  "text": "Represent a fraction 1/b on a number line diagram by defining the interval from 0 to 1 as the whole and partitioning it into b equal parts. Recognize that each part has size 1/b and that the endpoint of the part based at 0 locates the number 1/b on the number line."
}
```

Field notes:
- `section` is one of `"Mathematical Practices"`, `"K-8 Mathematics"`, `"9-12 Mathematics"`
- `grade` is `"K"` through `"8"` for K-8 records, `"9-12"` for high-school records, and `null` for grade-agnostic Mathematical Practices (except `MP.3.1` which is California-only and tagged `"9-12"`)
- `category` / `category_name` are populated only for `9-12 Mathematics` records (the Conceptual Categories: `N` Number and Quantity, `A` Algebra, `F` Functions, `G` Geometry, `S` Statistics and Probability)
- `domain` is the short domain code (e.g. `OA`, `NF`, `RP`, `IF`, `SRT`); `domain_code` is the fully-qualified form used in CCSS-M codes (e.g. `3.OA`, `N-RN`, `S-ID`)
- `cluster_letter` is auto-assigned `A`, `B`, `C`, … in source order within a domain
- `cluster` is the cluster heading text (e.g. `"Develop understanding of fractions as numbers."`)
- `sub_letter` is populated for sub-bullets (e.g. `3.NF.A.2.a`); `parent_code` then points to the numbered parent
- `is_practice: true` for the Mathematical Practices section (codes like `MP.4`, `MP.3.1`)
- `ca_addition: true` means this is a California-added standard (the published PDF marks them with a trailing "CA")
- `plus_standard: true` for advanced / STEM-track standards (the `(+)` marker in CCSS-M)
- `modeling: true` for high-school modeling standards (the ★ marker in CCSS-M, re-applied via canonical code list because `pdftotext` drops the glyph)

## Sections covered (CA-MATH.json)

| Section                  | Records | Notes                                                              |
|--------------------------|---------|--------------------------------------------------------------------|
| Mathematical Practices   | 9       | MP.1–MP.8 plus the CA-only MP.3.1 (higher mathematics)             |
| K-8 Mathematics          | ~320    | Kindergarten through Grade 8, by Domain → Cluster → numbered standard |
| 9-12 Mathematics         | ~190    | Higher Mathematics by Conceptual Category (N, A, F, G, S)          |

Pathway courses (Algebra I/II, Geometry, Mathematics I/II/III) are *not* emitted as separate records — they are rearrangements of the same Conceptual-Category standards and would duplicate.

## Math domain codes covered

K-8 domains:

| Code  | Name                                          | Grades         |
|-------|-----------------------------------------------|----------------|
| CC    | Counting and Cardinality                      | K              |
| OA    | Operations and Algebraic Thinking             | K, 1-5         |
| NBT   | Number and Operations in Base Ten             | K, 1-5         |
| NF    | Number and Operations—Fractions               | 3-5            |
| MD    | Measurement and Data                          | K, 1-5         |
| G     | Geometry                                      | K-8            |
| RP    | Ratios and Proportional Relationships         | 6, 7           |
| NS    | The Number System                             | 6-8            |
| EE    | Expressions and Equations                     | 6-8            |
| SP    | Statistics and Probability                    | 6-8            |
| F     | Functions                                     | 8              |

9-12 domains (by Conceptual Category):

| Category | Code   | Name                                                           |
|----------|--------|----------------------------------------------------------------|
| N        | N-RN   | The Real Number System                                         |
| N        | N-Q    | Quantities                                                     |
| N        | N-CN   | The Complex Number System                                      |
| N        | N-VM   | Vector and Matrix Quantities                                   |
| A        | A-SSE  | Seeing Structure in Expressions                                |
| A        | A-APR  | Arithmetic with Polynomials and Rational Expressions           |
| A        | A-CED  | Creating Equations                                             |
| A        | A-REI  | Reasoning with Equations and Inequalities                      |
| F        | F-IF   | Interpreting Functions                                         |
| F        | F-BF   | Building Functions                                             |
| F        | F-LE   | Linear, Quadratic, and Exponential Models                      |
| F        | F-TF   | Trigonometric Functions                                        |
| G        | G-CO   | Congruence                                                     |
| G        | G-SRT  | Similarity, Right Triangles, and Trigonometry                  |
| G        | G-C    | Circles                                                        |
| G        | G-GPE  | Expressing Geometric Properties with Equations                 |
| G        | G-GMD  | Geometric Measurement and Dimension                            |
| G        | G-MG   | Modeling with Geometry                                         |
| S        | S-ID   | Interpreting Categorical and Quantitative Data                 |
| S        | S-IC   | Making Inferences and Justifying Conclusions                   |
| S        | S-CP   | Conditional Probability and the Rules of Probability           |
| S        | S-MD   | Using Probability to Make Decisions                            |
