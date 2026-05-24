import React from 'react';
import { colors } from '../theme.js';

const SUBJECTS = [
  { value: '',        label: 'Auto-detect' },
  { value: 'ela',     label: 'ELA (CA-ELA)' },
  { value: 'math',    label: 'Math (CA-MATH)' },
  { value: 'history', label: 'History (CA-HISTORY)' },
  { value: 'science', label: 'Science (CA-NGSS)' },
];

export default function SubjectPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {SUBJECTS.map((s) => {
        const selected = value === s.value;
        return (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: `1.5px solid ${selected ? colors.primary : colors.border}`,
              background: selected ? colors.primaryLight : colors.white,
              color: selected ? colors.primaryDark : colors.textPrimary,
              fontWeight: selected ? '700' : '500',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
