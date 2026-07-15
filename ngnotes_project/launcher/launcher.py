"""NGNotes launcher — single cross-platform entry point.

This is the source for the NGNotes.exe (Windows) / NGNotes (macOS) executable
built by PyInstaller (see launcher/build.py). It replaces the old
setup.command/start.command/setup.bat/start.bat shell scripts with one binary
that works the same way on both platforms: double-click it, and it checks
prerequisites, sets up the project on first run (or whenever dependencies are
missing), and launches both servers.

Requirements this launcher does NOT bundle (same as the old scripts): Python
3.10+, Node.js, Ollama, and a LaTeX distribution (TinyTeX/MacTeX/MiKTeX) must
already be installed on the system -- the launcher checks for each and tells
you exactly what's missing rather than silently installing system-level
tools. What it DOES remove is all bash/batch scripting: cross-platform tool
detection, venv creation, port checks, health polling, and browser-opening
all go through Python's standard library instead of shell-specific syntax
(no more batch quote-escaping fragility, no more macOS-only `sips`/`open`
vs. Windows `netstat`/`start` divergence at the script level).
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

BACKEND_PORT = 8010
FRONTEND_PORT = 5173
OLLAMA_URL = "http://127.0.0.1:11434"
RECOMMENDED_MODEL = "qwen3.6"

IS_WINDOWS = platform.system() == "Windows"


def root_dir() -> Path:
    """The NGNotes project root -- the directory the executable itself lives
    in (or this script's directory, when run unfrozen via `python launcher.py`
    for local testing). PyInstaller onefile executables extract to a temp
    directory at runtime, so `sys.executable`, not `__file__`, is the correct
    anchor when frozen.

    Inside a macOS .app bundle the real binary lives several directories
    deeper (NGNotes.app/Contents/MacOS/<exe> or .../Contents/Resources/<exe>),
    so the project root is the directory *containing* the .app bundle, not
    its immediate parent -- walk up until a ".app" directory is found and use
    its parent instead.
    """
    if getattr(sys, "frozen", False):
        exe_path = Path(sys.executable).resolve()
        for parent in exe_path.parents:
            if parent.suffix == ".app":
                return parent.parent
        return exe_path.parent
    return Path(__file__).resolve().parent.parent


def ok(msg: str) -> None:
    print(f"  [OK]    {msg}")


def warn(msg: str) -> None:
    print(f"  [!!]    {msg}")


def fail(msg: str) -> None:
    print(f"  [FAIL]  {msg}")


def pause_and_exit(code: int) -> None:
    input("Press Enter to close this window...")
    sys.exit(code)


def find_system_python() -> str | None:
    for name in (["python3", "python"] if not IS_WINDOWS else ["python", "python3"]):
        path = shutil.which(name)
        if not path:
            continue
        if IS_WINDOWS and "WindowsApps" in path:
            # The Microsoft Store's Python "app execution alias" sits on PATH
            # and satisfies shutil.which, but running it either opens the
            # Store or does nothing -- a well-known source of confusing
            # "nothing happens" reports. Skip it and keep looking.
            continue
        return path
    return None


def venv_python(venv_dir: Path) -> Path:
    if IS_WINDOWS:
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def check_ollama() -> None:
    ollama_bin = shutil.which("ollama")
    if not ollama_bin:
        warn("Ollama not found -- NGNotes needs it to generate reports.")
        print("          Install it from https://ollama.com/download, then run: ollama pull " + RECOMMENDED_MODEL)
        return

    ok("ollama found")
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=2) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, OSError, ValueError):
        warn("Ollama is installed but doesn't seem to be running.")
        print("          Start the Ollama app, then re-run this (or just continue -- it will retry).")
        return

    models = data.get("models", [])
    if not models:
        warn("Ollama is running but has no models installed yet.")
        print(f"          NGNotes needs at least one. A solid general-purpose pick: ollama pull {RECOMMENDED_MODEL}")
        try:
            answer = input(f"          Pull {RECOMMENDED_MODEL} now? This downloads roughly 23GB. [y/N] ").strip().lower()
        except EOFError:
            answer = ""
        if answer == "y":
            subprocess.run(["ollama", "pull", RECOMMENDED_MODEL])
        else:
            print("          Skipped. Run 'ollama pull <model>' yourself before generating a report.")
    else:
        ok(f"ollama has {len(models)} model(s) installed")


def check_pdflatex() -> None:
    if shutil.which("pdflatex"):
        ok("pdflatex found")
        return
    warn("pdflatex not found -- PDF export won't work without a LaTeX distribution.")
    if IS_WINDOWS:
        print("          Recommended: MiKTeX -- https://miktex.org/download")
        print("          After installing, open MiKTeX Console and set the on-the-fly package")
        print("          install option to Yes/Always, or your first PDF export may hang behind")
        print("          a hidden install-confirmation dialog.")
    else:
        print("          Recommended (lightweight): TinyTeX -- https://yihui.org/tinytex/")
        print("          Full alternative (~5GB): MacTeX -- https://tug.org/mactex/")


def run_setup(root: Path) -> bool:
    print()
    print("=" * 50)
    print(" NGNotes Setup")
    print("=" * 50)
    print()

    python_bin = find_system_python()
    if not python_bin:
        fail("Python not found.")
        if IS_WINDOWS:
            print("          Install Python 3.10+ from https://www.python.org/downloads/")
            print("          (not the Microsoft Store version) and check \"Add python.exe to PATH\".")
        else:
            print("          Install Python 3.10+ from https://www.python.org/downloads/")
        return False
    ok(f"python found ({python_bin})")

    node_bin = shutil.which("node")
    npm_bin = shutil.which("npm")
    if not node_bin or not npm_bin:
        fail("Node.js not found.")
        print("          Install the LTS version from https://nodejs.org")
        return False
    ok("node and npm found")

    check_ollama()
    check_pdflatex()

    print()
    print("-- Setting up backend --")
    backend_dir = root / "backend"
    venv_dir = backend_dir / ".venv"
    if not venv_dir.exists():
        subprocess.run([python_bin, "-m", "venv", str(venv_dir)], cwd=backend_dir, check=True)
    vpy = str(venv_python(venv_dir))
    subprocess.run([vpy, "-m", "pip", "install", "--quiet", "--upgrade", "pip"], cwd=backend_dir, check=True)
    subprocess.run([vpy, "-m", "pip", "install", "--quiet", "-r", "requirements.txt"], cwd=backend_dir, check=True)
    ok("Backend dependencies installed")

    print()
    print("-- Setting up frontend --")
    frontend_dir = root / "frontend"
    subprocess.run([npm_bin, "install", "--silent"], cwd=frontend_dir, check=True)
    ok("Frontend dependencies installed")

    print()
    return True


def port_busy(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1):
            return True
    except urllib.error.HTTPError:
        # Got a real HTTP response (even an error status) -- something is
        # listening and answering HTTP on this port.
        return True
    except (urllib.error.URLError, OSError):
        return False


def wait_healthy(url: str, tries: int = 30) -> bool:
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1):
                return True
        except (urllib.error.URLError, OSError):
            time.sleep(1)
    return False


def run_start(root: Path) -> None:
    backend_dir = root / "backend"
    frontend_dir = root / "frontend"
    venv_dir = backend_dir / ".venv"
    vpy = venv_python(venv_dir)

    if not vpy.exists() or not (frontend_dir / "node_modules").exists():
        if not run_setup(root):
            pause_and_exit(1)

    if port_busy(BACKEND_PORT) or port_busy(FRONTEND_PORT):
        fail(f"Port {BACKEND_PORT} or {FRONTEND_PORT} is already in use by something else.")
        print("          Maybe NGNotes is already running? Close it and try again.")
        pause_and_exit(1)

    print("=" * 50)
    print(" Starting NGNotes")
    print("=" * 50)

    npm_bin = shutil.which("npm")

    # Both subprocesses inherit this console's stdout/stderr rather than
    # opening their own windows -- one place to watch, and it sidesteps
    # Windows-only APIs (CREATE_NEW_CONSOLE) entirely, keeping this launcher's
    # process-management code identical across platforms.
    print(f"Starting backend on port {BACKEND_PORT}...")
    backend_proc = subprocess.Popen(
        [str(vpy), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(BACKEND_PORT)],
        cwd=backend_dir,
    )

    print(f"Starting frontend on port {FRONTEND_PORT}...")
    frontend_proc = subprocess.Popen(
        [npm_bin, "run", "dev", "--", "--host", "127.0.0.1", "--port", str(FRONTEND_PORT), "--strictPort"],
        cwd=frontend_dir,
    )

    print("Waiting for both to come up...")
    backend_ready = wait_healthy(f"http://127.0.0.1:{BACKEND_PORT}/api/health")
    frontend_ready = wait_healthy(f"http://127.0.0.1:{FRONTEND_PORT}/")
    if not (backend_ready and frontend_ready):
        print("Servers are taking longer than expected -- check for error output.")

    webbrowser.open(f"http://127.0.0.1:{FRONTEND_PORT}")

    print()
    print("=" * 50)
    print(" NGNotes is running:")
    print(f"   App:     http://127.0.0.1:{FRONTEND_PORT}")
    print(f"   Backend: http://127.0.0.1:{BACKEND_PORT}")
    print()
    print(" Also make sure the Ollama app is running -- report generation needs it.")
    print()
    print(" Keep this window open while using NGNotes.")
    print(" Press Ctrl+C to stop.")
    print("=" * 50)

    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None or frontend_proc.poll() is not None:
                print("A server process exited unexpectedly -- stopping.")
                break
    except KeyboardInterrupt:
        print("\nStopping NGNotes...")
    finally:
        for proc in (backend_proc, frontend_proc):
            if proc.poll() is None:
                proc.terminate()
        for proc in (backend_proc, frontend_proc):
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


def main() -> None:
    # Python block-buffers stdout when it isn't a TTY (e.g. when a compiled
    # executable is launched from a GUI/Finder/Explorer double-click, or
    # output is redirected). Without this, this script's own print() calls
    # sit in an unflushed buffer for the entire run (confirmed while testing:
    # only the child uvicorn/vite subprocess output -- which bypasses this
    # buffer, writing straight to the inherited file descriptor -- showed up)
    # while this script waits in its keep-alive loop, showing nothing.
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:
        pass

    root = root_dir()
    os.chdir(root)
    try:
        run_start(root)
    except subprocess.CalledProcessError as err:
        fail(f"A setup command failed: {err}")
        pause_and_exit(1)


if __name__ == "__main__":
    main()
