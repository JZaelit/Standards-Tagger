import React, { useState } from 'react';
import UploadScreen from './screens/UploadScreen.jsx';
import ResultsScreen from './screens/ResultsScreen.jsx';
import { runAlignment } from './lib/api.js';
import { colors } from './theme.js';

// Pipeline steps shown during loading
const PIPELINE_STEPS = [
  { id: 'upload',   label: 'Parsing EdusPerience…' },
  { id: 'tfidf',    label: 'Stage 1 — TF-IDF shortlist' },
  { id: 'rerank',   label: 'Stage 2 — Heuristic rerank' },
  { id: 'gemini',   label: 'Stage 3 — Gemini curation' },
  { id: 'done',     label: 'Finalizing report…' },
];

function LoadingScreen({ stepIndex }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.background,
    }}>
      <div style={{ width: 360, padding: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.textPrimary, marginBottom: 6 }}>
          Running alignment pipeline
        </h2>
        <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 28 }}>
          This usually takes 20–60 seconds.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PIPELINE_STEPS.map((step, i) => {
            const done    = i < stepIndex;
            const active  = i === stepIndex;
            const pending = i > stepIndex;
            return (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Icon */}
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: done ? colors.primary : active ? colors.primaryLight : '#f3f4f6',
                  border: active ? `2px solid ${colors.primary}` : 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  color: done ? '#fff' : active ? colors.primaryDark : colors.textLight,
                }}>
                  {done ? '✓' : i + 1}
                </div>
                {/* Label */}
                <span style={{
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: done ? colors.textPrimary : active ? colors.primaryDark : colors.textLight,
                }}>
                  {step.label}
                  {active && <span style={{ display: 'inline-block', marginLeft: 6 }}>
                    <SpinnerDots />
                  </span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Tiny animated dots
function SpinnerDots() {
  return (
    <span style={{ fontWeight: 400, color: colors.textLight, letterSpacing: 2 }}>
      <span style={{ animation: 'blink 1.2s infinite 0s', opacity: 0 }}>.</span>
      <span style={{ animation: 'blink 1.2s infinite 0.4s', opacity: 0 }}>.</span>
      <span style={{ animation: 'blink 1.2s infinite 0.8s', opacity: 0 }}>.</span>
      <style>{`@keyframes blink { 0%,80%,100%{opacity:0} 40%{opacity:1} }`}</style>
    </span>
  );
}

function ErrorScreen({ message, onReset }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.background,
    }}>
      <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.textPrimary, marginBottom: 8 }}>
          Alignment failed
        </h2>
        <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24, lineHeight: 1.6 }}>
          {message}
        </p>
        <button
          onClick={onReset}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: colors.primary,
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen]         = useState('upload');   // 'upload' | 'loading' | 'results' | 'error'
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState('');
  const [fileName, setFileName]     = useState('');
  const [subject, setSubject]       = useState('');
  const [elapsed, setElapsed]       = useState(0);

  async function handleRun(edusperience, subjectValue) {
    setSubject(subjectValue || '');
    setFileName(edusperience?.title || edusperience?.name || 'edusperience.json');
    setLoadingStep(0);
    setScreen('loading');

    // Advance the step indicator over the API call duration
    const stepTimings = [0, 800, 2000, 4000, 99999]; // ms offsets for each step
    const timers = stepTimings.map((t, i) =>
      i === 0 ? null : setTimeout(() => setLoadingStep(i), t)
    );

    try {
      const data = await runAlignment(edusperience, subjectValue || null);
      timers.forEach((t) => t && clearTimeout(t));
      setLoadingStep(PIPELINE_STEPS.length - 1);
      await new Promise((r) => setTimeout(r, 400)); // brief "finalizing" flash
      setResult(data.result);
      setElapsed(data.elapsed_seconds || 0);
      setScreen('results');
    } catch (err) {
      timers.forEach((t) => t && clearTimeout(t));
      setError(err.message || 'Unknown error');
      setScreen('error');
    }
  }

  function handleReset() {
    setScreen('upload');
    setResult(null);
    setError('');
    setLoadingStep(0);
  }

  if (screen === 'loading') return <LoadingScreen stepIndex={loadingStep} />;
  if (screen === 'error')   return <ErrorScreen message={error} onReset={handleReset} />;
  if (screen === 'results') return (
    <ResultsScreen
      result={result}
      fileName={fileName}
      subject={subject}
      elapsed={elapsed}
      onReset={handleReset}
    />
  );

  return <UploadScreen onRun={handleRun} />;
}
