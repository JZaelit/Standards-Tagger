// Which objectives count toward alignment coverage and reports.
// Mirrors tools/prompts/curate.md — student-facing academic tasks only.

const EDUCATOR_EVAL_TYPES = new Set(['ai', 'ai_assistant', 'teacher']);

const LOGISTICS_TEXT = /\b(naming convention|rename your file|file name|filename|section break|gradeflow can identify|upload to|google classroom|submit (by|before)|due date|create an account|platform setup|data test|double-?spaced|12-?point font|mla heading|the (ai|teacher) will (evaluate|assess|grade)|gemini will|grading criteria|rubric for grading|you will grade|facilitation guide)\b/i;

const ACADEMIC_TASK_TEXT = /\b(analyze|analysis|argue|argument|cite|evidence|thesis|write|essay|paragraph|solve|equation|graph|function|compare|contrast|summarize|interpret|research)\b/i;

const LOGISTICS_PREFIX = /^(insert|add|rename|title your|name your|upload|attach|create a section)/i;

export function evaluationTypeOf(objective) {
  return (objective?.evaluation_type || '').toString().toLowerCase();
}

export function isLikelyNonStudentObjective(objective) {
  const o = objective || {};
  const evalType = evaluationTypeOf(o);
  if (EDUCATOR_EVAL_TYPES.has(evalType)) return true;

  const audience = (o.audience || '').toString().toLowerCase();
  if (audience === 'educator' || audience === 'teacher') return true;

  const text = [
    o.title,
    o.label,
    o.description,
    o.objective_description,
  ].filter(Boolean).join(' ');

  if (evalType === 'platform' && LOGISTICS_TEXT.test(text)) return true;
  if (LOGISTICS_TEXT.test(text) && !ACADEMIC_TASK_TEXT.test(text)) return true;

  const trimmed = text.trim();
  if (LOGISTICS_PREFIX.test(trimmed) && !ACADEMIC_TASK_TEXT.test(text)) {
    return true;
  }

  return false;
}

/** Objectives that should appear in coverage denominators. */
export function countsTowardAlignmentCoverage(objective) {
  return !isLikelyNonStudentObjective(objective);
}

/** Alignment report: student objectives with at least one standard. */
export function shouldShowInAlignmentReport(objective) {
  if (!countsTowardAlignmentCoverage(objective)) return false;
  return (objective?.alignments || []).length > 0;
}
