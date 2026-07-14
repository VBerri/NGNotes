#!/bin/bash
# NGNotes one-time setup.
#
# Double-click this file in Finder (or run `./setup.command` in a terminal).
# It creates a local Python virtual environment, installs backend + frontend
# dependencies, and checks for the external tools NGNotes needs (Ollama,
# pdflatex) -- it will not silently install those system-level tools for you,
# since that can have side effects you didn't ask for; it tells you exactly
# what to install and where to get it.
set -e
cd "$(cd "$(dirname "$0")" && pwd)"
ROOT="$(pwd)"

ok()   { echo "  [OK]    $1"; }
warn() { echo "  [!!]    $1"; }
fail() { echo "  [FAIL]  $1"; }

echo "=================================================="
echo " NGNotes Setup"
echo "=================================================="
echo

# --- Python ---
if command -v python3 >/dev/null 2>&1; then
  PY_VERSION="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
  ok "python3 found (version $PY_VERSION)"
else
  fail "python3 not found."
  echo "         Install Python 3.10 or newer from https://www.python.org/downloads/"
  echo "         then re-run this script."
  read -p "Press Enter to close this window..." _
  exit 1
fi

# --- Node.js / npm ---
if ! command -v node >/dev/null 2>&1; then
  # Not on PATH yet -- try the common nvm install location before giving up.
  export NVM_DIR="$HOME/.nvm"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  fi
fi
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  ok "node found ($(node --version)), npm found ($(npm --version))"
else
  fail "Node.js not found."
  echo "         Install the LTS version from https://nodejs.org then re-run this script."
  read -p "Press Enter to close this window..." _
  exit 1
fi

# --- Ollama (required to actually generate reports) ---
if command -v ollama >/dev/null 2>&1; then
  ok "ollama found"
  if curl -s -o /dev/null --max-time 2 http://127.0.0.1:11434/api/tags; then
    MODEL_COUNT="$(curl -s http://127.0.0.1:11434/api/tags | grep -o '"name"' | wc -l | tr -d ' ')"
    if [ "$MODEL_COUNT" = "0" ]; then
      warn "Ollama is running but has no models installed yet."
      echo "          NGNotes needs at least one. A solid general-purpose pick:"
      echo "              ollama pull qwen3.6"
      read -p "          Pull qwen3.6 now? This downloads roughly 23GB. [y/N] " PULL_ANSWER
      if [ "$PULL_ANSWER" = "y" ] || [ "$PULL_ANSWER" = "Y" ]; then
        ollama pull qwen3.6
      else
        echo "          Skipped. Run 'ollama pull <model>' yourself before generating a report."
      fi
    else
      ok "ollama has $MODEL_COUNT model(s) installed"
    fi
  else
    warn "Ollama is installed but doesn't seem to be running."
    echo "          Start the Ollama app, then re-run this script (or just start NGNotes -- it will retry)."
  fi
else
  warn "Ollama not found -- NGNotes needs it to generate reports."
  echo "          Install it from https://ollama.com/download, then run: ollama pull qwen3.6"
fi

# --- pdflatex (required to export PDFs) ---
if command -v pdflatex >/dev/null 2>&1; then
  ok "pdflatex found"
else
  warn "pdflatex not found -- PDF export won't work without a LaTeX distribution."
  echo "          Recommended (lightweight, a few hundred MB): TinyTeX -- https://yihui.org/tinytex/"
  echo "          Full alternative (~5GB): MacTeX -- https://tug.org/mactex/"
fi

echo
echo "-- Setting up backend --"
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
"./.venv/bin/pip" install --quiet --upgrade pip
"./.venv/bin/pip" install --quiet -r requirements.txt
ok "Backend dependencies installed"

echo
echo "-- Setting up frontend --"
cd "$ROOT/frontend"
npm install --silent
ok "Frontend dependencies installed"

echo
echo "=================================================="
echo " Setup complete."
echo " Double-click start.command to launch NGNotes."
echo "=================================================="
read -p "Press Enter to close this window..." _
