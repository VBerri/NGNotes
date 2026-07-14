#!/bin/bash
# Launches the NGNotes backend and frontend, waits for both to come up, and
# opens the app in your default browser. Keep the window this opens running
# while you use NGNotes; press Ctrl+C (or close the window) to stop it.
cd "$(cd "$(dirname "$0")" && pwd)"
ROOT="$(pwd)"

if [ ! -d "$ROOT/backend/.venv" ] || [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Setup hasn't been run yet."
  echo "Double-click setup.command first, then come back to this one."
  read -p "Press Enter to close this window..." _
  exit 1
fi

BACKEND_PORT=8010
FRONTEND_PORT=5173
BACKEND_PID=""
FRONTEND_PID=""

# -sTCP:LISTEN matters: a plain `lsof -ti :$port` also matches closed/stale
# client-side sockets that merely reference the port number (e.g. a browser's
# leftover connection handles from an earlier session) without anything
# actually listening there, which produced a false "port busy" positive here.
port_busy() { lsof -ti ":$1" -sTCP:LISTEN >/dev/null 2>&1; }

if port_busy "$BACKEND_PORT" || port_busy "$FRONTEND_PORT"; then
  echo "Port $BACKEND_PORT or $FRONTEND_PORT is already in use by something else"
  echo "(maybe NGNotes is already running? check for another open terminal window)."
  echo "Close whatever is using it, then try again."
  read -p "Press Enter to close this window..." _
  exit 1
fi

cleanup() {
  echo
  echo "Stopping NGNotes..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

echo "=================================================="
echo " Starting NGNotes"
echo "=================================================="

echo "Starting backend on port $BACKEND_PORT..."
cd "$ROOT/backend"
"./.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" &
BACKEND_PID=$!

echo "Starting frontend on port $FRONTEND_PORT..."
cd "$ROOT/frontend"
# --strictPort: fail loudly instead of vite's default behavior of silently
# picking a different port on conflict, which would desync the health check
# and the browser-open step below (both assume $FRONTEND_PORT specifically).
npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort &
FRONTEND_PID=$!

echo "Waiting for both to come up..."
READY=""
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "http://127.0.0.1:$BACKEND_PORT/api/health" \
     && curl -s -o /dev/null "http://127.0.0.1:$FRONTEND_PORT/"; then
    READY="1"
    break
  fi
  sleep 1
done

if [ -z "$READY" ]; then
  echo "Servers are taking longer than expected -- check the output above for errors."
fi

open "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null || true

echo
echo "=================================================="
echo " NGNotes is running:"
echo "   App:     http://127.0.0.1:$FRONTEND_PORT"
echo "   Backend: http://127.0.0.1:$BACKEND_PORT"
echo
echo " Also make sure the Ollama app is running -- report"
echo " generation needs it."
echo
echo " Keep this window open while using NGNotes."
echo " Press Ctrl+C or close this window to stop."
echo "=================================================="

wait
