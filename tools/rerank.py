"""
Rerank TF-IDF shortlists with grade/keyword heuristics, then write an
alignment.json per edusperience. Subject-aware: handles ELA, Math,
History, and Science (NGSS) shortlists (detected via shortlist's
`subject` field, default "ela" for back-compat).

Pipeline:
  shortlist.json  (TF-IDF top-K, lexical)
    -> rerank with:
       * grade-band preference (inferred from edusperience title/description)
       * keyword -> strand/domain/topic-prefix boosts
    -> final alignment.json (top 1-3 picks per objective + rationale)
"""
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART_DIR = ROOT / "artifacts"

# ---------------- Grade inference (generic) ----------------
HS_RE = re.compile(r"\b(high school|grade 9|grade 10|grade 11|grade 12|"
                   r"9th|10th|11th|12th|9-10|11-12|"
                   r"odyssey|mockingbird|romeo|shakespeare|"
                   r"resume|career|college|"
                   r"calculus|trigonometry|polynomial|logarithm)\b", re.I)
MS_RE = re.compile(r"\b(middle school|grade 6|grade 7|grade 8|"
                   r"6th|7th|8th|6-8|"
                   r"linear equation|proportional relationship|"
                   r"scientific notation)\b", re.I)
ES_RE = re.compile(r"\b(elementary|kindergarten|grade [1-5]|[1-5]th grade|"
                   r"place value|skip count|number bonds)\b", re.I)

# History-specific era/topic signals
HIST_HS_RE = re.compile(r"\b(world\s*war|wwi|wwii|holocaust|"
                        r"cold\s*war|nuclear|civil\s*rights|"
                        r"industrial(ization)?\s*revolution|"
                        r"new\s*deal|great\s*depression|"
                        r"vietnam|korean\s*war|"
                        r"french\s*revolution|napoleon)\b", re.I)
HIST_G6_RE = re.compile(r"\b(ancient|prehistor|mesopotamia|sumeria|"
                        r"egypt(ian)?|hebrew|judaism|"
                        r"greek|greece|roman|rome|"
                        r"hammurabi|pharaoh|pyramid|nile|"
                        r"han\s*dynasty|qin|shang)\b", re.I)
HIST_G7_RE = re.compile(r"\b(medieval|middle\s*ages|renaissance|reformation|"
                        r"feudal|crusade|knight|"
                        r"byzantine|islamic|caliph|"
                        r"mongol|aztec|inca|maya(n)?|"
                        r"luther|protestant|enlightenment)\b", re.I)
HIST_G8_RE = re.compile(r"\b(american\s*revolution|founding\s*fathers|"
                        r"declaration\s*of\s*independence|"
                        r"constitution|federalist|"
                        r"jefferson|washington|hamilton|madison|"
                        r"civil\s*war|reconstruction|"
                        r"slavery|abolition|emancipation|"
                        r"westward\s*expansion|frontier|manifest\s*destiny)\b", re.I)
HIST_G12_RE = re.compile(r"\b(democracy|democratic|civic|civil\s*society|"
                         r"market\s*economy|supply\s*and\s*demand|"
                         r"fiscal\s*polic|monetary\s*polic|gdp|"
                         r"federal\s*reserve|inflation|unemployment|"
                         r"opportunity\s*cost|scarcity|"
                         r"separation\s*of\s*powers|bill\s*of\s*rights)\b", re.I)
HIST_G4_RE = re.compile(r"\b(california|gold\s*rush|missions?|"
                        r"\bcalifornia\s*history\b)\b", re.I)

# Science-specific topic signals -> NGSS bands
SCI_HS_RE = re.compile(r"\b(dna|rna|gene\s*expression|chromosome|"
                       r"meiosis|mitosis|cellular\s*respiration|"
                       r"newton|momentum|kinetic|atomic\s*structur|"
                       r"periodic\s*table|isotop|radioactiv|"
                       r"natural\s*selection|evolution|punnett|"
                       r"plate\s*tectonic|biogeochem|"
                       r"climate\s*change|big\s*bang)\b", re.I)
SCI_MS_RE = re.compile(r"\b(photosynthesis|food\s*web|food\s*chain|"
                       r"chemical\s*reaction|conserv(ation)?\s*of\s*mass|"
                       r"thermal\s*energy|kinetic\s*theory|"
                       r"weather\s*pattern|water\s*cycle|"
                       r"ecosystem|biome|species|adaptation|"
                       r"earthquake|volcano|rock\s*cycle)\b", re.I)
SCI_ES_RE = re.compile(r"\b(push|pull|five\s*senses|seasons|"
                       r"plant.*animal|living\s*things|"
                       r"weather|sunlight|"
                       r"plant.*need|animal.*need)\b", re.I)


def infer_grade_bands_ela(text):
    t = text or ""
    if HS_RE.search(t): return ["9-10", "11-12"]
    if MS_RE.search(t): return ["6", "7", "8", "6-8"]
    if ES_RE.search(t): return ["K", "1", "2", "3", "4", "5"]
    return []


def infer_grade_bands_math(text):
    t = text or ""
    if HS_RE.search(t): return ["9-12"]
    if MS_RE.search(t): return ["6", "7", "8"]
    if ES_RE.search(t): return ["K", "1", "2", "3", "4", "5"]
    return []


def infer_grade_bands_history(text):
    t = text or ""
    out = []
    if HIST_HS_RE.search(t):  out.extend(["10", "11"])
    if HIST_G12_RE.search(t): out.extend(["12"])
    if HIST_G8_RE.search(t):  out.extend(["8"])
    if HIST_G7_RE.search(t):  out.extend(["7"])
    if HIST_G6_RE.search(t):  out.extend(["6"])
    if HIST_G4_RE.search(t):  out.extend(["4"])
    if HS_RE.search(t) and not out:
        out.extend(["10", "11", "12"])
    if MS_RE.search(t) and not out:
        out.extend(["6", "7", "8"])
    if ES_RE.search(t) and not out:
        out.extend(["K", "1", "2", "3", "4", "5"])
    seen = set()
    return [g for g in out if not (g in seen or seen.add(g))]


def infer_grade_bands_science(text):
    """Return preferred NGSS grade values: 'K','1',...,'5','MS','HS'."""
    t = text or ""
    out = []
    if SCI_HS_RE.search(t): out.append("HS")
    if SCI_MS_RE.search(t): out.append("MS")
    if SCI_ES_RE.search(t): out.extend(["K","1","2","3","4","5"])
    if HS_RE.search(t) and "HS" not in out: out.append("HS")
    if MS_RE.search(t) and "MS" not in out: out.append("MS")
    if ES_RE.search(t) and not any(g in out for g in ["K","1","2","3","4","5"]):
        out.extend(["K","1","2","3","4","5"])
    seen = set()
    return [g for g in out if not (g in seen or seen.add(g))]


# ---------------- ELA: keyword -> (strand, number) boosts ----------------
ELA_KEYWORD_BOOSTS = [
    (re.compile(r"\b(argument|argu(e|ing)|thesis|claim|opinion|persuas|"
                r"position|stance|debate)\b", re.I),
     [("W", 1), ("CCRA.W", 1)]),
    (re.compile(r"\b(inform|informative|explanatory|explain(ing)?|expository)\b", re.I),
     [("W", 2), ("CCRA.W", 2)]),
    (re.compile(r"\b(narrative|story|short story|anecdot)\b", re.I),
     [("W", 3), ("CCRA.W", 3)]),
    (re.compile(r"\b(outline|organiz(e|ing)|structure|plan(ning)?|"
                r"prewrit|graphic organizer)\b", re.I),
     [("W", 4), ("W", 5)]),
    (re.compile(r"\b(revis(e|ing|ion)|edit(ing)?|rewrit|peer review)\b", re.I),
     [("W", 5), ("CCRA.W", 5)]),
    (re.compile(r"\b(hyperlink|image|media|multimedia|digital|technology|"
                r"internet|publish(ing)?|online|document|MLA|format)\b", re.I),
     [("W", 6), ("CCRA.W", 6), ("SL", 5)]),
    (re.compile(r"\b(research|investigat|sources|gather(ing)?)\b", re.I),
     [("W", 7), ("W", 8)]),
    (re.compile(r"\b(text(ual)? evidence|cite|quotation|support(ing)? "
                r"evidence|evidence from the text)\b", re.I),
     [("RL", 1), ("RI", 1), ("CCRA.R", 1)]),
    (re.compile(r"\b(theme|central idea|main idea|overall message)\b", re.I),
     [("RL", 2), ("RI", 2), ("CCRA.R", 2)]),
    (re.compile(r"\b(character|protagonist|antagonist|setting|plot|scene)\b", re.I),
     [("RL", 3), ("CCRA.R", 3)]),
    (re.compile(r"\b(word choice|figurative|imagery|tone|mood|diction|"
                r"connotation|denotation|vocabular)\b", re.I),
     [("RL", 4), ("RI", 4), ("L", 4), ("L", 5), ("CCRA.R", 4)]),
    (re.compile(r"\b(grammar|syntax|punctuation|spelling|capitaliz|"
                r"conventions|subject.?verb)\b", re.I),
     [("L", 1), ("L", 2), ("CCRA.L", 1), ("CCRA.L", 2)]),
    (re.compile(r"\b(introduction|introductory|hook|thesis statement|conclu(sion|ding))\b", re.I),
     [("W", 1), ("W", 2)]),
    (re.compile(r"\b(discuss(ion)?|collaborat|peer|present(ing)?|speaking|oral)\b", re.I),
     [("SL", 1), ("SL", 4), ("CCRA.SL", 1)]),
]


# ---------------- Math: keyword -> domain_code boosts ----------------
MATH_KEYWORD_BOOSTS = [
    (re.compile(r"\b(ratio|proportion(al)?|percent(age)?|unit rate|per[- ]?capita)\b", re.I),
     ["6.RP", "7.RP"]),
    (re.compile(r"\b(budget|income|tax(es)?|expense|spending|sav(e|ing)|"
                r"interest rate|loan|mortgage|salary|wage|paycheck|"
                r"net pay|gross pay|investment|stock|dividend)\b", re.I),
     ["7.RP", "6.RP", "A-CED", "A-SSE", "F-LE"]),
    (re.compile(r"\b(add(ing|ition)?|subtract(ing|ion)?|multipl(y|ication)|"
                r"divid(e|ing|ision)|compute|calculat(e|ion))\b", re.I),
     ["3.OA", "4.OA", "5.OA", "3.NBT", "4.NBT", "5.NBT", "6.NS", "7.NS"]),
    (re.compile(r"\b(fraction|numerator|denominator|equivalent fraction|"
                r"common denominator|mixed number|improper fraction)\b", re.I),
     ["3.NF", "4.NF", "5.NF"]),
    (re.compile(r"\b(decimal|tenths|hundredths|thousandths|place value|round(ing)?)\b", re.I),
     ["4.NBT", "5.NBT", "5.NF"]),
    (re.compile(r"\b(expression|variable|coefficient|term|simplify|"
                r"distributive|like terms|substitute)\b", re.I),
     ["6.EE", "7.EE", "A-SSE", "A-APR"]),
    (re.compile(r"\b(equation|inequal|solv(e|ing)|linear equation|"
                r"system of equations|quadratic)\b", re.I),
     ["8.EE", "A-REI", "A-CED", "7.EE"]),
    (re.compile(r"\b(function|input|output|mapping|"
                r"linear function|exponential function|"
                r"slope|y-intercept|domain.{0,5}range|rate of change)\b", re.I),
     ["8.F", "F-IF", "F-BF", "F-LE"]),
    (re.compile(r"\b(shape|polygon|triangle|rectangle|square|circle|"
                r"angle|congruen|similar(ity)?|transformation|"
                r"rotat(e|ion)|translat(e|ion)|axis of symmetry|"
                r"area|perimeter|surface area|volume|"
                r"pythagorean|coordinate plane)\b", re.I),
     ["G-CO", "G-SRT", "G-GMD", "G-MG", "G-GPE", "7.G", "8.G", "6.G",
      "5.G", "4.G", "3.G", "2.G", "1.G", "K.G"]),
    (re.compile(r"\b(data|graph|chart|plot|histogram|scatter[- ]?plot|"
                r"bar graph|line graph|box plot|"
                r"mean|median|mode|range|standard deviation|"
                r"distribution|outlier|correlation|"
                r"survey|sample|population|inference)\b", re.I),
     ["S-ID", "S-IC", "6.SP", "7.SP", "8.SP", "3.MD"]),
    (re.compile(r"\b(probabilit(y|ies)|likelihood|chance|"
                r"random|simulation|outcome|event)\b", re.I),
     ["S-CP", "S-MD", "7.SP"]),
    (re.compile(r"\b(measure|measurement|length|width|height|weight|"
                r"capacity|liquid volume|customary|metric|"
                r"meter|liter|gram|inch|foot|pound|ounce)\b", re.I),
     ["K.MD", "1.MD", "2.MD", "3.MD", "4.MD", "5.MD"]),
    (re.compile(r"\b(count(ing)?|cardinal(ity)?|number names|one[- ]to[- ]one|skip count)\b", re.I),
     ["K.CC", "1.NBT", "2.NBT"]),
    (re.compile(r"\b(model|model(ing|ed)? with math|real[- ]?world|"
                r"problem solv(e|ing)|word problem)\b", re.I),
     ["MP", "A-CED", "F-LE"]),
    (re.compile(r"\b(reason(ing)?|argument|critique|justif(y|ication)|"
                r"prove|proof|contradict)\b", re.I),
     ["MP"]),
]


# ---------------- History: keyword -> code-prefix boosts ----------------
HISTORY_KEYWORD_BOOSTS = [
    (re.compile(r"\b(world\s*war|wwi|wwii|world\s*war\s*ii|"
                r"holocaust|nazi|hitler|stalin|"
                r"pearl\s*harbor|d[- ]?day|hiroshima|nagasaki|"
                r"fascis|nationalis)\b", re.I),
     ["10.7", "10.8", "11.7"]),
    (re.compile(r"\b(cold\s*war|nuclear|atomic|"
                r"soviet|ussr|berlin\s*wall|iron\s*curtain|"
                r"vietnam|korean\s*war|cuban\s*missile|"
                r"decoloniz|third\s*world)\b", re.I),
     ["10.9", "11.9"]),
    (re.compile(r"\b(civil\s*rights|martin\s*luther\s*king|brown\s*v\.\s*board|"
                r"segregation|desegregat|integrat(e|ion)|"
                r"jim\s*crow|voting\s*rights|"
                r"freedom\s*riders|montgomery\s*bus)\b", re.I),
     ["11.10"]),
    (re.compile(r"\b(great\s*depression|new\s*deal|dust\s*bowl|"
                r"\broosevelt\b|hoover|fdr)\b", re.I),
     ["11.6"]),
    (re.compile(r"\b(roaring\s*twenties|1920s|prohibition|jazz\s*age|"
                r"flapper|harlem\s*renaissance|mass\s*production)\b", re.I),
     ["11.5"]),
    (re.compile(r"\b(industrial\s*revolution|industrializ|"
                r"factory\s*system|steam\s*engine|assembly\s*line)\b", re.I),
     ["10.3", "8.12"]),
    (re.compile(r"\b(american\s*revolution|declaration\s*of\s*independence|"
                r"founding\s*fathers|federalist\s*paper|"
                r"constitutional\s*convention|articles\s*of\s*confederation|"
                r"\bbill\s*of\s*rights\b)\b", re.I),
     ["8.1", "8.2", "8.3", "12.1", "12.4"]),
    (re.compile(r"\b(civil\s*war|reconstruction|"
                r"slavery|slave\s*trade|abolition|emancipation|"
                r"underground\s*railroad|secession|confederat)\b", re.I),
     ["8.9", "8.10", "8.11"]),
    (re.compile(r"\b(westward\s*expansion|manifest\s*destiny|"
                r"frontier|gold\s*rush|oregon\s*trail|"
                r"louisiana\s*purchase|lewis\s*and\s*clark)\b", re.I),
     ["8.8", "4.3", "4.4"]),
    (re.compile(r"\b(mesopotamia|sumerian|hammurabi|"
                r"egypt(ian)?|pharaoh|pyramid|nile|"
                r"hebrew|judaism|"
                r"ancient\s*greek|ancient\s*greece|"
                r"ancient\s*rome|roman\s*empire|"
                r"han\s*dynasty|qin|shang|prehistor)\b", re.I),
     ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7"]),
    (re.compile(r"\b(medieval|middle\s*ages|feudal|knight|crusade|"
                r"renaissance|reformation|protestant|martin\s*luther|"
                r"byzantine|islamic\s*civilization|caliph|"
                r"mongol|aztec|inca|maya(n)?|"
                r"enlightenment\s*thinkers?)\b", re.I),
     ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.10", "7.11"]),
    (re.compile(r"\b(california\s*history|california\s*indians|"
                r"\bcalifornia\s*missions?\b|california\s*statehood|"
                r"junipero\s*serra|spanish\s*missions)\b", re.I),
     ["4.1", "4.2", "4.3", "4.4", "4.5"]),
    (re.compile(r"\b(government|democracy|democratic|"
                r"separation\s*of\s*powers|checks\s*and\s*balances|"
                r"federalism|judicial\s*review|judiciary|"
                r"supreme\s*court|legislative|executive|congress|senate|"
                r"\bvote\b|voting|election|campaign|"
                r"political\s*party|civic|citizenship)\b", re.I),
     ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8"]),
    (re.compile(r"\b(market\s*economy|supply\s*and\s*demand|"
                r"opportunity\s*cost|scarcity|incentive|"
                r"\bgdp\b|inflation|unemployment|"
                r"fiscal\s*polic|monetary\s*polic|federal\s*reserve|"
                r"international\s*trade|exchange\s*rate|tariff|"
                r"\bcompetition\b|profit|labor\s*market)\b", re.I),
     ["12E.1", "12E.2", "12E.3", "12E.4", "12E.5", "12E.6"]),
    (re.compile(r"\b(geography|geographic|"
                r"map(s|ping)?|continent|hemisphere|"
                r"latitude|longitude|"
                r"trade\s*route|migration|settlement\s*patterns?)\b", re.I),
     ["SKILL:CST"]),
    (re.compile(r"\b(primary\s*source|secondary\s*source|"
                r"document(ary)?|eyewitness|oral\s*histor|"
                r"artifact|photograph|letter\s*from|diary|"
                r"point\s*of\s*view|bias|fact\s*from\s*opinion|"
                r"credibility|verifiable)\b", re.I),
     ["SKILL:REP"]),
    (re.compile(r"\b(cause\s*(and|&)\s*effect|cause[- ]effect|"
                r"causation|causal|consequence|"
                r"interpretation|historical\s*context|"
                r"point\s*of\s*view|long[- ]term|short[- ]term)\b", re.I),
     ["SKILL:HI"]),
    (re.compile(r"\b(timeline|time\s*line|chronology|chronological|"
                r"sequence\s*of\s*events|era|period\s*of\s*history|"
                r"\bbce?\b|\bce\b|\bb\.c\.|\ba\.d\.)\b", re.I),
     ["SKILL:CST"]),
]


# ---------------- Science (NGSS): keyword -> topic-prefix boosts ----------------
SCIENCE_KEYWORD_BOOSTS = [
    (re.compile(r"\b(matter|atom(ic|s)?|molecule|element|compound|"
                r"periodic\s*table|isotop|mass|density|"
                r"chemical\s*reaction|reactant|product|"
                r"acid|base|ph|solution|solvent|solute)\b", re.I),
     ["PS1"]),
    (re.compile(r"\b(force|push|pull|motion|gravity|gravitation|"
                r"friction|momentum|acceleration|velocit|newton|"
                r"balance|equilibrium|inertia)\b", re.I),
     ["PS2"]),
    (re.compile(r"\b(energy|kinetic|potential|thermal|heat|"
                r"electric(al|ity)|magnet(ic|ism)?|"
                r"electromagnetic|nuclear|conservation\s*of\s*energy|"
                r"power|joule|watt)\b", re.I),
     ["PS3"]),
    (re.compile(r"\b(wave(length|s)?|sound|light|"
                r"frequency|amplitude|reflection|refraction|"
                r"electromagnetic\s*spectrum|radio|infrared|ultraviolet|"
                r"information\s*transfer|signal|digital)\b", re.I),
     ["PS4"]),
    (re.compile(r"\b(cell|cellular|organelle|nucleus|membrane|"
                r"mitochondri|chloroplast|tissue|organ|organ\s*system|"
                r"protein|enzyme|metabolism|"
                r"photosynthesis|cellular\s*respiration|"
                r"homeostasis|immune)\b", re.I),
     ["LS1"]),
    (re.compile(r"\b(ecosystem|biome|food\s*chain|food\s*web|"
                r"producer|consumer|decomposer|herbivore|carnivore|"
                r"predator|prey|competition|symbios|"
                r"population|community|niche|"
                r"carrying\s*capacity|biomass)\b", re.I),
     ["LS2"]),
    (re.compile(r"\b(heredity|inherit(ance)?|trait|"
                r"dna|rna|gene|chromosome|genom|"
                r"meiosis|mitosis|punnett|allele|genotyp|phenotyp|"
                r"mutation|sexual\s*reproduction|asexual)\b", re.I),
     ["LS3"]),
    (re.compile(r"\b(evolution|natural\s*selection|adaptation|"
                r"common\s*ancestor|biodivers|extinct|"
                r"darwin|species|speciation|fossil\s*record)\b", re.I),
     ["LS4"]),
    (re.compile(r"\b(solar\s*system|planet|moon|star(s)?|galaxy|"
                r"universe|big\s*bang|cosmolog|"
                r"astronom|telescope|orbit|eclipse|"
                r"sun|earth|seasons)\b", re.I),
     ["ESS1"]),
    (re.compile(r"\b(plate\s*tectonic|earthquake|volcano|mountain|"
                r"weather|climate|atmosphere|hydrosphere|"
                r"erosion|weathering|sediment|rock\s*cycle|"
                r"water\s*cycle|ocean|continent|geosphere)\b", re.I),
     ["ESS2"]),
    (re.compile(r"\b(natural\s*resource|natural\s*hazard|"
                r"climate\s*change|global\s*warm|"
                r"renewable|nonrenewable|fossil\s*fuel|"
                r"pollution|sustainab|conservation|"
                r"human\s*impact|biodivers)\b", re.I),
     ["ESS3"]),
    (re.compile(r"\b(engineer(ing)?|design\s*solution|design\s*problem|"
                r"prototype|iterat|criteria|constraint|"
                r"design\s*process|test.*design|trade[- ]?off)\b", re.I),
     ["ETS1"]),
]


# ---------------- Scoring ----------------
_ELA_CODE_NUM_RE = re.compile(r"(?:[A-Z.]+)\.(?:[^.]+)\.(\d+)")


def rerank_ela(candidates, preferred_grades, context_text, top_n=5):
    boost_codes = set()
    matched = []
    for pat, codes in ELA_KEYWORD_BOOSTS:
        if pat.search(context_text):
            matched.append(pat.pattern[:60])
            boost_codes.update(codes)
    rescored = []
    for c in candidates:
        base = c["score"]
        grade_bonus = 0.0
        kw_bonus = 0.0
        if preferred_grades:
            g = c.get("grade")
            if g in preferred_grades: grade_bonus = 0.25
            elif c.get("is_anchor"):  grade_bonus = 0.10
            else:                     grade_bonus = -0.15
        strand = c.get("strand")
        m = _ELA_CODE_NUM_RE.match(c["code"])
        num = int(m.group(1)) if m else None
        if num is not None and (strand, num) in boost_codes:
            kw_bonus = 0.20
        final = base + grade_bonus + kw_bonus
        rescored.append({**c, "base_score": base,
                         "grade_bonus": grade_bonus,
                         "keyword_bonus": kw_bonus,
                         "final_score": final})
    rescored.sort(key=lambda c: -c["final_score"])
    return rescored[:top_n], matched


def rerank_math(candidates, preferred_grades, context_text, top_n=5):
    boost_doms = set()
    matched = []
    for pat, dom_codes in MATH_KEYWORD_BOOSTS:
        if pat.search(context_text):
            matched.append(pat.pattern[:60])
            boost_doms.update(dom_codes)
    rescored = []
    for c in candidates:
        base = c["score"]
        grade_bonus = 0.0
        kw_bonus = 0.0
        if preferred_grades:
            g = c.get("grade")
            if g in preferred_grades:    grade_bonus = 0.20
            elif c.get("is_practice"):   grade_bonus = 0.10
            else:                        grade_bonus = -0.05
        dom_code = c.get("domain_code")
        if c.get("is_practice"):
            if "MP" in boost_doms: kw_bonus = 0.15
        elif dom_code and dom_code in boost_doms:
            kw_bonus = 0.20
        final = base + grade_bonus + kw_bonus
        rescored.append({**c, "base_score": base,
                         "grade_bonus": grade_bonus,
                         "keyword_bonus": kw_bonus,
                         "final_score": final})
    rescored.sort(key=lambda c: -c["final_score"])
    return rescored[:top_n], matched


def rerank_history(candidates, preferred_grades, context_text, top_n=5):
    boost_prefixes = set()
    boost_skills = set()
    matched = []
    for pat, items in HISTORY_KEYWORD_BOOSTS:
        if pat.search(context_text):
            matched.append(pat.pattern[:60])
            for it in items:
                if it.startswith("SKILL:"):
                    boost_skills.add(it.split(":", 1)[1])
                else:
                    boost_prefixes.add(it)
    rescored = []
    for c in candidates:
        base = c["score"]
        grade_bonus = 0.0
        kw_bonus = 0.0
        is_skill = bool(c.get("is_skill"))
        code = c.get("code") or ""
        if preferred_grades and not is_skill:
            g = c.get("grade")
            if g in preferred_grades: grade_bonus = 0.25
            else:                     grade_bonus = -0.10
        elif is_skill:
            grade_bonus = 0.05
        if is_skill:
            cat = c.get("skill_category_code")
            if cat and cat in boost_skills:
                kw_bonus = 0.20
        else:
            for prefix in boost_prefixes:
                if code == prefix or code.startswith(prefix + ".") or code.startswith(prefix + " "):
                    kw_bonus = 0.20
                    break
        final = base + grade_bonus + kw_bonus
        rescored.append({**c, "base_score": base,
                         "grade_bonus": grade_bonus,
                         "keyword_bonus": kw_bonus,
                         "final_score": final})
    rescored.sort(key=lambda c: -c["final_score"])
    return rescored[:top_n], matched


def rerank_science(candidates, preferred_grades, context_text, top_n=5):
    """Boost candidates whose topic matches a keyword-triggered prefix.
    A prefix like 'PS3' is matched against the trailing token of the
    candidate's `topic` (e.g., 'HS-PS3' has trailing 'PS3')."""
    boost_prefixes = set()
    matched = []
    for pat, prefixes in SCIENCE_KEYWORD_BOOSTS:
        if pat.search(context_text):
            matched.append(pat.pattern[:60])
            boost_prefixes.update(prefixes)
    rescored = []
    for c in candidates:
        base = c["score"]
        grade_bonus = 0.0
        kw_bonus = 0.0
        if preferred_grades:
            g = c.get("grade")
            if g in preferred_grades:
                grade_bonus = 0.20
            elif g in ("K-2", "3-5") and any(p in preferred_grades for p in ["K","1","2","3","4","5"]):
                grade_bonus = 0.10
            else:
                grade_bonus = -0.05
        topic = c.get("topic") or ""
        trailing = topic.rsplit("-", 1)[-1] if topic else ""
        if trailing and trailing in boost_prefixes:
            kw_bonus = 0.20
        if c.get("engineering") and "ETS1" in boost_prefixes:
            kw_bonus = max(kw_bonus, 0.10)
        final = base + grade_bonus + kw_bonus
        rescored.append({**c, "base_score": base,
                         "grade_bonus": grade_bonus,
                         "keyword_bonus": kw_bonus,
                         "final_score": final})
    rescored.sort(key=lambda c: -c["final_score"])
    return rescored[:top_n], matched


# ---------------- Auto-pick ----------------
SKIP_TITLE_RE = re.compile(
    r"\b(file.?name|naming|watch me|gradeflow intro|do not continue|"
    r"project setup|mla heading|heading|insert section|"
    r"submit|turn[- ]?in|upload|name your file)\b", re.I)
HARD_SKIP_TITLE_RE = re.compile(
    r"^\s*(?:[A-Za-z0-9 /&-]*\b)?"
    r"(reflection|reflect on|metacognit|takeaways?|"
    r"what did you learn|ai (?:prompt|reflection|critical thinking))"
    r"\s*\d*\s*$",
    re.I,
)


def auto_pick(top_candidates, context_text, subject, objective_title=""):
    if objective_title and HARD_SKIP_TITLE_RE.match(objective_title.strip()):
        return {"picks": [],
                "reason": f"reflective/metacognitive objective, no {subject.upper()} standard applies"}
    if SKIP_TITLE_RE.search(context_text) and top_candidates and \
       top_candidates[0]["final_score"] < 0.35:
        return {"picks": [],
                "reason": f"logistical/operational objective, no {subject.upper()} standard applies"}
    if not top_candidates:
        return {"picks": [], "reason": "no candidates"}
    top = top_candidates[0]["final_score"]
    picks = [c for c in top_candidates if c["final_score"] >= top * 0.85][:3]
    return {
        "picks": [{"code": c["code"], "grade": c.get("grade"),
                   "final_score": round(c["final_score"], 3),
                   "text": c["text"]} for c in picks],
        "reason": "top-1 plus any candidate within 85% of top score"
    }


# ---------------- Driver ----------------
def process(shortlist_path, out_path, top_n):
    d = json.load(open(shortlist_path))
    subject = d.get("subject", "ela")
    edu_context = " ".join(filter(None, [
        d.get("edusperience_title"),
        d.get("edusperience_description"),
    ]))
    if subject == "math":
        preferred = infer_grade_bands_math(edu_context)
        rerank_fn = rerank_math
        reranker_label = "grade_band + math_domain_keyword heuristics"
    elif subject == "history":
        preferred = infer_grade_bands_history(edu_context)
        rerank_fn = rerank_history
        reranker_label = "grade_band + history_era_keyword heuristics"
    elif subject == "science":
        preferred = infer_grade_bands_science(edu_context)
        rerank_fn = rerank_science
        reranker_label = "grade_band + ngss_topic_keyword heuristics"
    else:
        preferred = infer_grade_bands_ela(edu_context)
        rerank_fn = rerank_ela
        reranker_label = "grade_band + keyword_strand heuristics"

    out = {
        "edusperience_id": d.get("edusperience_id"),
        "edusperience_title": d.get("edusperience_title"),
        "source_file": d.get("source_file"),
        "subject": subject,
        "inferred_grade_bands": preferred,
        "standards_db": d.get("standards_db"),
        "retrieval": {
            "method": d.get("retrieval_method"),
            "reranker": reranker_label,
        },
        "objectives": [],
    }
    for obj in d["objectives"]:
        # For history and science, prepend edu title/description so
        # unit-level signals (era, topic) reach per-objective rerank.
        ctx_parts = [
            obj.get("section_title"),
            obj.get("objective_title"),
            obj.get("objective_description"),
        ]
        if subject in ("history", "science"):
            ctx_parts = [edu_context] + ctx_parts
        ctx = " ".join(filter(None, ctx_parts))
        reranked, matched = rerank_fn(obj["candidates"], preferred, ctx, top_n)
        auto = auto_pick(reranked, ctx, subject,
                         objective_title=obj.get("objective_title", ""))
        out["objectives"].append({
            "path": obj["path"],
            "section_title": obj["section_title"],
            "objective_title": obj["objective_title"],
            "objective_description": obj["objective_description"],
            "matched_keyword_rules": matched,
            "reranked_candidates": reranked,
            "auto_pick": auto,
        })
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"  -> {out_path}  ({len(out['objectives'])} objectives, subject={subject})",
          file=sys.stderr)


def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("shortlists", nargs="*", help="Paths to shortlist.json files")
    p.add_argument("--all", action="store_true",
                   help="Process every artifacts/*.shortlist.json")
    p.add_argument("--top-n", type=int, default=5)
    args = p.parse_args()
    if args.all:
        paths = sorted(ART_DIR.glob("*.shortlist.json"))
    else:
        paths = [Path(s) for s in args.shortlists]
    if not paths:
        print("No shortlists to process", file=sys.stderr)
        return 1
    for p_ in paths:
        stem = p_.name.replace(".shortlist.json", "")
        out = ART_DIR / f"{stem}.alignment.json"
        process(p_, out, args.top_n)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
