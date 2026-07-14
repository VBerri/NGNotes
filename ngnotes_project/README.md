# NGNotes

NGNotes turns rough engineering notes — typed text, voice transcripts, and photos of whiteboards or drawings — into a polished, publication-style LaTeX report, compiled to PDF. It runs entirely on your own machine against a local [Ollama](https://ollama.com) model; nothing is sent to an external service.

For how to actually *use* the app once it's running, see **[USER_GUIDE.md](USER_GUIDE.md)**.

## Quick start (macOS)

1. Install [Ollama](https://ollama.com/download) and pull a model: `ollama pull qwen3.6`
2. Double-click **`setup.command`** — installs everything the project needs and checks for Ollama/pdflatex.
3. Double-click **`start.command`** — launches the app and opens it in your browser.

That's it. Keep the terminal window `start.command` opens running while you use the app; close it (or press Ctrl+C) to stop.

## What you need installed

| Tool | Why | Get it |
|---|---|---|
| Python 3.10+ | Runs the backend | [python.org](https://www.python.org/downloads/) |
| Node.js (LTS) | Runs the frontend | [nodejs.org](https://nodejs.org) |
| [Ollama](https://ollama.com) | Runs the LLM locally | `ollama pull qwen3.6` (or any model you prefer) |
| pdflatex | Compiles reports to PDF | [TinyTeX](https://yihui.org/tinytex/) (lightweight) or [MacTeX](https://tug.org/mactex/) (full) |

`setup.command` checks for all four and tells you exactly what's missing — it won't silently install system-level tools for you.

## Manual setup

If you'd rather not use the `.command` scripts:

```bash
# Backend
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# Frontend (separate terminal)
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Then open `http://127.0.0.1:5173`.

## Running tests

```bash
# Backend (pytest — compiles real LaTeX via pdflatex, not mocked)
cd backend
./.venv/bin/pip install -r requirements-dev.txt
./.venv/bin/python -m pytest tests/ -v

# Frontend (Vitest)
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
setup.command          One-time setup (double-click)
start.command           Launch both servers (double-click)
```

## Key behavior

- `/api/generate` always returns LaTeX body content — no markdown mode.
- `/api/export-pdf` compiles that LaTeX with `pdflatex`, auto-retrying once through an LLM edit pass if compilation fails.
- Every structural element (title, author, date, abstract, each section) is optional and reflects only what was actually generated — nothing is fabricated to fill a gap.
