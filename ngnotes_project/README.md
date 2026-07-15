# NGNotes

NGNotes turns rough engineering notes — typed text, voice transcripts, and photos of whiteboards or drawings — into a polished, publication-style LaTeX report, compiled to PDF. It runs entirely on your own machine against a local [Ollama](https://ollama.com) model; nothing is sent to an external service.

For how to actually *use* the app once it's running, see **[USER_GUIDE.md](USER_GUIDE.md)**.

## Quick start

1. Install [Ollama](https://ollama.com/download) and pull a model: `ollama pull qwen3.6`
2. **Build** the launcher for your platform (a one-time step — PyInstaller can't cross-compile, so this has to run on the actual OS you're launching on). This only compiles the launcher itself; it does not install any of NGNotes' own dependencies yet.
   ```bash
   pip install -r launcher/requirements.txt
   python launcher/build.py
   ```
   This produces, at the project root — next to `backend/` and `frontend/`:
   - **macOS:** `NGNotes.app` — a real double-clickable app bundle
   - **Windows:** `NGNotes.exe`
3. **Run** it (double-click). This is the step that does the actual work:
   - Checks for Node.js/Ollama/pdflatex and tells you if anything's missing.
   - **First run only:** creates the backend's Python virtual environment, installs every backend package (FastAPI, Pillow, python-docx, etc.) and every frontend npm package automatically — nothing to install by hand.
   - **Every run:** starts both the backend and frontend servers and opens the app in your browser. Runs after the first one skip straight to this step, since it detects the venv/`node_modules` already exist.

Keep the window it opens running while you use the app; close it (or press Ctrl+C) to stop.

**macOS Gatekeeper note:** since this isn't Apple-notarized, the first launch may be blocked with an "unidentified developer" warning. Right-click `NGNotes.app` → **Open** (instead of double-clicking) to approve it once — after that, double-clicking works normally.

**macOS Automation permission note:** `NGNotes.app` opens Terminal.app to show you setup/server output (a plain double-clicked app has no console attached otherwise). The first time, macOS will ask permission for it to control Terminal — click **OK**. This is a one-time prompt.

**Windows SmartScreen note:** similarly, Windows may show an "unrecognized app" warning the first time. Click **More info** → **Run anyway**.

## What you need installed

| Tool | Why | Get it |
|---|---|---|
| Python 3.10+ | Runs the backend | [python.org](https://www.python.org/downloads/) — **not** the Microsoft Store version on Windows; check "Add python.exe to PATH" during install |
| Node.js (LTS) | Runs the frontend | [nodejs.org](https://nodejs.org) |
| [Ollama](https://ollama.com) | Runs the LLM locally | `ollama pull qwen3.6` (or any model you prefer) |
| pdflatex | Compiles reports to PDF | macOS: [TinyTeX](https://yihui.org/tinytex/) or [MacTeX](https://tug.org/mactex/) &nbsp;·&nbsp; Windows: [MiKTeX](https://miktex.org/download) |

The NGNotes launcher checks for all four on every run and tells you exactly what's missing — it won't silently install system-level tools for you. (It does not need Python or Node installed for *itself* — it's a compiled standalone binary — but it does still need them on your system to set up and run the backend/frontend it launches.)

**MiKTeX note (Windows only):** after installing, open MiKTeX Console and set "Install missing packages on-the-fly" to Yes/Always — otherwise your first PDF export can hang behind a hidden confirmation dialog the first time it needs a package.

## Manual setup

If you'd rather not use the executable at all:

```bash
# Backend (macOS/Linux)
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# Backend (Windows)
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# Frontend (separate terminal, same on all platforms)
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Then open `http://127.0.0.1:5173`.

## Running tests

```bash
# Backend (macOS/Linux) — pytest, compiles real LaTeX via pdflatex, not mocked
cd backend
./.venv/bin/pip install -r requirements-dev.txt
./.venv/bin/python -m pytest tests/ -v

# Backend (Windows)
cd backend
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m pytest tests/ -v

# Frontend (Vitest, same on all platforms)
cd frontend
npm test
```

## Project structure

```
backend/
  app/main.py        FastAPI backend: Ollama integration, LaTeX sanitize/
                      escape/compile pipeline, image analysis, template CRUD
  app/schemas.py      Request/response models
  tests/              pytest suite
frontend/
  src/App.jsx          React app: source-input blocks, rich-text LaTeX editor,
                        advanced sampler panel + presets, template management
  src/App.test.jsx     Vitest suite
templates/
  report_frameworks/  Curated report templates (IEEE / Patient Care / Monthly)
                       plus any templates you save from the app
launcher/
  launcher.py          Cross-platform setup + launch logic (single source,
                        compiled per-platform by PyInstaller)
  build.py             Build script — see "Quick start" above. On macOS this
                        also assembles the NGNotes.app bundle (Info.plist +
                        a Terminal-launching wrapper script around the
                        compiled binary — a plain --onefile binary alone
                        isn't double-clickable the same way .app bundles are)
```

## Key behavior

- `/api/generate` always returns LaTeX body content — no markdown mode.
- `/api/export-pdf` compiles that LaTeX with `pdflatex`, auto-retrying once through an LLM edit pass if compilation fails.
- Every structural element (title, author, date, abstract, each section) is optional and reflects only what was actually generated — nothing is fabricated to fill a gap.
