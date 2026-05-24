import React from 'react';
import StandardChip from './StandardChip.jsx';
import { colors } from '../theme.js';

const FALLBACK_BY_SUBJECT = {
  ela:     'No ELA standard applies.',
  math:    'No math standard applies.',
  history: 'No history standard applies.',
  science: 'No science standard applies.',
};

export default function ObjectiveRow({ objective, subject = 'ela' }) {
  const o = objective || {};
  const alignments = o.alignments || [];
  const fallback = FALLBACK_BY_SUBJECT[subject] || 'No standard applies.';

  return (
    <div style={{
      display: 'flex',
      gap: 18,
      paddingTop: 16,
      paddingBottom: 16,
      borderTop: `1px solid ${colors.border}`,
      flexWrap: 'wrap',
    }}>
      {/* Left: objective info */}
      <div style={{ flex: 1, minWidth: 220, maxWidth: 360 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>
          {o.title || ''}
        </div>
        {o.description && (
          <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5, marginBottom: 4 }}>
            {o.description}
          </div>
        )}
        {o.path && (
          <div style={{ fontSize: 11, color: colors.textLight, fontFamily: 'Menlo, monospace', marginTop: 4 }}>
            {o.path}
          </div>
        )}
        {o.note && (
          <div style={{ fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>
            Note: {o.note}
          </div>
        )}
      </div>

      {/* Right: aligned standards */}
      <div style={{ flex: 1.4, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alignments.length === 0 ? (
          <div style={{
            background: colors.background,
            border: `1px dashed ${colors.border}`,
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 13,
            color: colors.textSecondary,
            fontStyle: 'italic',
          }}>
            {o.note || fallback}
          </div>
        ) : (
          alignments.map((a, i) => (
            <StandardChip key={i} alignment={a} />
          ))
        )}
      </div>
    </div>
  );
}
