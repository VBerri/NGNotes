"""Builds the NGNotes launcher executable for the current platform.

Usage:
    pip install -r launcher/requirements.txt
    python launcher/build.py

Produces, at the project root -- next to backend/ and frontend/, which is
where launcher.py expects to find them at runtime (see root_dir() in
launcher.py):
  - Windows: NGNotes.exe
  - macOS:   NGNotes.app (a real double-clickable app bundle, not just a
             bare compiled binary -- see build_macos_app() for why that
             needs an extra wrapping step)
  - Linux:   NGNotes (bare binary)

PyInstaller cannot cross-compile: run this on each platform you want an
executable for.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

LAUNCHER_DIR = Path(__file__).resolve().parent
ROOT = LAUNCHER_DIR.parent
BUILD_DIR = LAUNCHER_DIR / "_build"
SPEC_DIR = LAUNCHER_DIR / "_build"

APP_WRAPPER_SCRIPT = """#!/bin/bash
# This is the .app bundle's actual CFBundleExecutable. Finder launches GUI
# apps with no attached terminal, so stdout/stdin would go nowhere visible
# (and the launcher's setup prompts would hang) if the real console binary
# were used directly here. Instead this opens Terminal.app and runs the real
# binary (bundled in Resources/) inside it, giving a normal visible console
# for a CLI-style program while still being a proper double-clickable app.
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
osascript <<APPLESCRIPT
tell application "Terminal"
    activate
    do script "\\"$DIR/NGNotes-bin\\""
end tell
APPLESCRIPT
"""

INFO_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>NGNotes</string>
    <key>CFBundleIdentifier</key>
    <string>com.ngnotes.launcher</string>
    <key>CFBundleName</key>
    <string>NGNotes</string>
    <key>CFBundleDisplayName</key>
    <string>NGNotes</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
"""


def build_binary(name: str, distpath: Path) -> Path:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--onefile",
            "--name",
            name,
            "--distpath",
            str(distpath),
            "--workpath",
            str(BUILD_DIR),
            "--specpath",
            str(SPEC_DIR),
            "--noconfirm",
            str(LAUNCHER_DIR / "launcher.py"),
        ],
        check=True,
    )
    shutil.rmtree(BUILD_DIR, ignore_errors=True)
    exe_name = f"{name}.exe" if sys.platform == "win32" else name
    return distpath / exe_name


def build_macos_app() -> Path:
    """Wraps the compiled console binary in a real .app bundle (see
    APP_WRAPPER_SCRIPT for why a plain --onefile binary isn't enough on its
    own for a double-click launcher)."""
    bundle_dir = ROOT / "NGNotes.app"
    if bundle_dir.exists():
        shutil.rmtree(bundle_dir)

    contents = bundle_dir / "Contents"
    macos_dir = contents / "MacOS"
    resources_dir = contents / "Resources"
    macos_dir.mkdir(parents=True)
    resources_dir.mkdir(parents=True)

    # Build the real binary straight into Resources/ under its internal name
    # (NGNotes-bin) so it never collides with the wrapper script's own name.
    real_binary = build_binary("NGNotes-bin", resources_dir)

    (contents / "Info.plist").write_text(INFO_PLIST)
    wrapper_path = macos_dir / "NGNotes"
    wrapper_path.write_text(APP_WRAPPER_SCRIPT)
    wrapper_path.chmod(0o755)
    real_binary.chmod(0o755)

    return bundle_dir


def main() -> None:
    if sys.platform == "darwin":
        result = build_macos_app()
    else:
        name = "NGNotes"
        result = build_binary(name, ROOT)

    print(f"\nBuilt {result}")


if __name__ == "__main__":
    main()
