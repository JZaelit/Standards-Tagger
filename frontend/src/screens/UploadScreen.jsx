import React, { useState, useRef } from 'react';
import SubjectPicker from '../components/SubjectPicker.jsx';
import { colors } from '../theme.js';

export default function UploadScreen({ onRun }) {
  const [edusperience, setEdusperience] = useState(null);
  const [fileName, setFileName]         = useState('');
  const [subject, setSubject]           = useState('');
  const [dragOver, setDragOver]         = useState(false);
  const [fileError, setFileError]       = useState('');
  const inputRef = useRef();

  function handleFile(file) {
    setFileError('');
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setFileError('Please upload a .json file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        setEdusperience(parsed);
        setFileName(file.name);
      } catch {
        setFileError('Could not parse JSON — make sure the file is valid.');
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  function handleSubmit() {
    if (!edusperience) return;
    onRun(edusperience, subject || null);
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: colors.textPrimary, marginBottom: 6 }}>
          Standards Tagger
        </h1>
        <p style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 1.6 }}>
          Upload an EdusPerience JSON file to automatically map its objectives to
          California academic standards using Gemini AI.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? colors.primary : edusperience ? colors.primaryDark : colors.border}`,
          borderRadius: 12,
          background: dragOver ? colors.primaryLight : edusperience ? '#f0fdf8' : colors.white,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s',
          marginBottom: 8,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {edusperience ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.primaryDark }}>
              {fileName}
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              Click to replace
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>
              Drop your EdusPerience JSON here
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              or click to browse
            </div>
          </>
        )}
      </div>

      {fileError && (
        <div style={{ fontSize: 12, color: colors.danger, marginBottom: 16 }}>
          {fileError}
        </div>
      )}

      {/* Subject picker */}
      <div style={{ marginTop: 28, marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Standards Database
        </div>
        <SubjectPicker value={subject} onChange={setSubject} />
      </div>

      {/* Pipeline info */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 28,
        flexWrap: 'wrap',
      }}>
        {[
          { n: 'Stage 1', title: 'TF-IDF Shortlist', desc: 'Top-15 candidates per objective by cosine similarity across all standards.' },
          { n: 'Stage 2', title: 'Heuristic Rerank', desc: 'Grade-band + strand boosts, subject auto-detection, metacognitive skips.' },
          { n: 'Stage 3', title: 'Gemini Curation', desc: 'Gemini reads the shortlist and commits codes with confidence & rationale.' },
        ].map((s) => (
          <div key={s.n} style={{
            flex: 1,
            minWidth: 180,
            background: colors.background,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: 14,
          }}>
            <div style={{ fontSize: 10, color: colors.primary, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.n}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 2, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={handleSubmit}
        disabled={!edusperience}
        style={{
          width: '100%',
          padding: '14px 24px',
          borderRadius: 10,
          border: 'none',
          background: edusperience ? colors.primary : colors.border,
          color: edusperience ? '#fff' : colors.textSecondary,
          fontWeight: 700,
          fontSize: 15,
          cursor: edusperience ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s',
        }}
      >
        {edusperience ? 'Run Alignment →' : 'Upload a file to continue'}
      </button>
    </div>
  );
}
