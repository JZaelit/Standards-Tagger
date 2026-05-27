# Standards Tagger (GradeFlow)

Web app for uploading EduSperiences, aligning them to standards with Gemini, and reviewing tagged mappings.

## Prerequisites

- **Node.js** 18+ and npm
- **Python 3** (for the local Gemini proxy — recommended for team use)
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)

## Quick start (recommended — key stays in `.env`)

The repo **does not** commit `.env`. Each teammate creates their own local file.

### 1. Install dependencies

```bash
git clone https://github.com/JZaelit/Standards-Tagger.git
cd Standards-Tagger
npm run install:frontend
```

### 2. Add your API key

```bash
cp .env.example .env
```

Edit `.env` at the **repo root**:

```env
GEMINI_API_KEY=AIza...your_key...
```

Tips:

- Key must start with **`AIza`** (letter 2 is capital **I**, not lowercase **L**).
- Do not wrap the key in quotes unless your editor adds them correctly.
- Share keys with teammates over a **private channel** (Slack DM, 1Password, etc.) — not in GitHub.

### 3. Run two terminals

**Terminal 1 — Gemini proxy** (reads `.env`, keeps the key out of the browser):

```bash
npm run gemini-proxy
```

You should see something like `Key OK (dotenv, …)`. If you see `No GEMINI_API_KEY yet`, check that `.env` exists in the repo root.

**Terminal 2 — web app:**

```bash
npm run web
```

Open the URL Expo prints (usually `http://localhost:8081`).

### 4. Configure the app once

In the app, go to **Settings**:

1. **Local proxy URL:** `http://127.0.0.1:8787`
2. Click **Save proxy**
3. Leave the **browser API key field empty** (the proxy uses `.env`)
4. Click **Test connection** — should succeed

You’re ready to upload EduSperiences, parse PDFs/DOCX, and run **Align with AI**.

---

## Alternative: key in the browser (no proxy)

If you skip the proxy:

1. Do **not** set a proxy URL in Settings.
2. Paste your key in Settings, or use **Load from .env file** to import from your local `.env`.
3. Run only `npm run web`.

Use this for solo/local testing. For teams, prefer the proxy + `.env` setup above.

---


---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `API_KEY_INVALID` | Create a fresh key at AI Studio. Clear Settings key, fix `.env`, restart proxy. |
| Proxy says no key | `.env` must live at **repo root** (same folder as `package.json`), not inside `frontend/`. |
| Referrer / browser errors | Use the proxy (`http://127.0.0.1:8787`) instead of calling Gemini directly from the browser. |
| Key works for teammate but not you | Compare last 4 characters of the key; re-share the full string privately. |

---

## Project layout

```
standardsTagger/
├── .env              # your secret key (gitignored)
├── .env.example      # template — safe to commit
├── frontend/         # Expo / React Native web app
├── tools/
│   └── gemini_proxy.py
└── package.json      # npm run web | gemini-proxy
```

## Security

- **Never commit `.env`** — it is listed in `.gitignore`.
- **Never commit API keys** in code, screenshots, or chat logs tied to the repo.
- If a key is leaked, **revoke it** in Google AI Studio and create a new one.
