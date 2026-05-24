import React, { useState } from 'react';
import ObjectiveRow from '../components/ObjectiveRow.jsx';
import { colors } from '../theme.js';
import { CONFIDENCE_COLORS } from '../lib/strandColor.js';

function countByConfidence(result) {
  const counts = { high: 0, medium: 0, low: 0, none: 0 };
  const objectives = result?.objectives || [];
  for (const obj of objectives) {
    const alignments = obj.alignments || [];
    if (alignments.length === 0) { counts.none++; continue; }
    // Count by best (first) alignment's confidence
    const top = alignments[0].confidence || 'none';
    if (counts[top] !== undefined) counts[top]++;
    else counts.none++;
  }
  return counts;
}

function SubjectLabel({ subject }) {
  const MAP = { ela: 'CA-ELA', math: 'CA-MATH', history: 'CA-HISTORY', science: 'CA-NGSS' };
  return MAP[subject] || subject?.toUpperCase() || 'Auto-detected';
}

export default function ResultsScreen({ result, fileName, subject, elapsed, onReset }) {
  const [expandAll, setExpandAll] = useState(false);
  const objectives = result?.objectives || [];
  const totalStandards = objectives.reduce((n, o) => n + (o.alignments || []).length, 0);
  const conf = countByConfidence(result);
  const detectedSubject = result?.subject || subject || '';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        <button
          onClick={onReset}
          style={{
            padding: '7px 14px',
            border: `1.5px solid ${colors.border}`,
            borderRadius: 8,
            background: colors.white,
            color: colors.textSecondary,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ← New alignment
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
            {fileName || 'Alignment Report'}
          </h2>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
            <SubjectLabel subject={detectedSubject} /> · {objectives.length} objectives · {totalStandards} standards · {elapsed?.toFixed(1)}s
          </div>
        </div>
        <button
          onClick={() => window.print()}
          style={{
            padding: '7px 14px',
            border: `1.5px solid ${colors.border}`,
            borderRadius: 8,
            background: colors.white,
            color: colors.textSecondary,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          🖨 Print / PDF
        </button>
      </div>

      {/* Confidence summary cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { key: 'high',   label: 'High confidence' },
          { key: 'medium', label: 'Medium confidence' },
          { key: 'low',    label: 'Low confidence' },
          { key: 'none',   label: 'No match' },
        ].map(({ key, label }) => {
          const c = CONFIDENCE_COLORS[key] || { fg: colors.textSecondary, bg: colors.background };
          return (
            <div key={key} style={{
              flex: 1,
              minWidth: 110,
              background: c.bg,
              border: `1px solid ${c.bg === colors.background ? colors.border : c.bg}`,
              borderRadius: 8,
              padding: '12px 16px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: c.fg }}>{conf[key]}</div>
              <div style={{ fontSize: 11, color: c.fg, fontWeight: 600, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
            </div>
          );
        })}
      </div>

      {/* Section header */}
      {result?.section_title && (
        <div style={{
          background: colors.primaryLight,
          borderLeft: `3px solid ${colors.primary}`,
          borderRadius: 6,
          padding: '10px 16px',
          marginBottom: 20,
          fontSize: 14,
          fontWeight: 600,
          color: colors.primaryDark,
        }}>
          {result.section_title}
        </div>
      )}

      {/* Expand/collapse toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => setExpandAll((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: colors.primary,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {expandAll ? '▲ Collapse all' : '▼ Expand all'}
        </button>
      </div>

      {/* Objective rows */}
      <div>
        {objectives.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: colors.textSecondary, fontSize: 14 }}>
            No objectives found in this EdusPerience.
          </div>
        ) : (
          objectives.map((obj, i) => (
            <ObjectiveRow
              key={i}
              objective={obj}
              subject={detectedSubject}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${colors.border}`, fontSize: 11, color: colors.textLight, textAlign: 'center' }}>
        Generated by Standards Tagger · 3-stage pipeline (TF-IDF → heuristic rerank → Gemini curation)
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          button { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
