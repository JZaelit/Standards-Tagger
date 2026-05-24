import React, { useState } from 'react';
import { strandColor, confidenceColors } from '../lib/strandColor.js';
import { colors } from '../theme.js';

export default function StandardChip({ alignment }) {
  const [expanded, setExpanded] = useState(false);
  const a = alignment || {};
  const codeColor = strandColor(a.code, a.badge || a.strand);
  const conf = confidenceColors(a.confidence);

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        background: colors.white,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: 12,
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {/* Code badge */}
        <span style={{
          padding: '3px 8px',
          borderRadius: 4,
          background: '#eef1f6',
          color: codeColor,
          fontFamily: 'Menlo, monospace',
          fontWeight: 700,
          fontSize: 13,
        }}>
          {a.code}
        </span>

        {/* Confidence pill */}
        {a.confidence && (
          <span style={{
            padding: '2px 8px',
            borderRadius: 10,
            background: conf.bg,
            color: conf.fg,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}>
            {a.confidence}
          </span>
        )}

        {/* Strand badge */}
        {(a.badge || a.strand) && (
          <span style={{
            padding: '2px 8px',
            borderRadius: 10,
            background: codeColor,
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
          }}>
            {a.badge || a.strand}
          </span>
        )}

        {a.grade && (
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            Grade {a.grade}
          </span>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 10, color: colors.textLight }}>
          {expanded ? '▲ less' : '▼ more'}
        </span>
      </div>

      {/* Rationale */}
      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
          Why this maps
        </div>
        <div style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 1.5 }}>
          {a.rationale || '—'}
        </div>
      </div>

      {/* Standard text (expanded) */}
      {expanded && a.text && (
        <div style={{
          marginTop: 8,
          background: colors.background,
          borderLeft: `2px solid ${colors.border}`,
          padding: '8px 12px',
          borderRadius: 4,
          fontSize: 12,
          color: '#374151',
          lineHeight: 1.6,
        }}>
          {a.text}
        </div>
      )}
    </div>
  );
}
