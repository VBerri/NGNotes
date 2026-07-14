@echo off
setlocal enabledelayedexpansion
REM NGNotes one-time setup for Windows.
REM
REM Double-click this file in Explorer (or run it from a Command Prompt).
REM It creates a local Python virtual environment, installs backend +
REM frontend dependencies, and checks for the external tools NGNotes needs
REM (Ollama, pdflatex) -- it will not silently install those system-level
REM tools for you, since that can have side effects you didn't ask for; it
REM tells you exactly what to install and where to get it.
cd /d "%~dp0"
set ROOT=%CD%

echo ==================================================
echo  NGNotes Setup
echo ==================================================
echo.

REM --- Python ---
REM Guard against the Microsoft Store's Python "app execution alias": it sits
REM on PATH under WindowsApps and satisfies `where python`, but running it
REM either opens the Store or silently does nothing -- a well-known source of
REM confusing "nothing happens" reports. Install from python.org instead.
where python >nul 2>&1
if errorlevel 1 (
    echo   [FAIL]  python not found.
    echo           Install Python 3.10 or newer from https://www.python.org/downloads/
    echo           IMPORTANT: check "Add python.exe to PATH" during install, then re-run this script.
    pause
    exit /b 1
) else (
    for /f "delims=" %%p in ('where python') do (
        echo %%p | findstr /i "WindowsApps" >nul
        if not errorlevel 1 (
            echo   [FAIL]  python resolves to the Microsoft Store stub ^(%%p^), not a real install.
            echo           Install Python from https://www.python.org/downloads/ instead ^(check
            echo           "Add python.exe to PATH" during install^), then re-run this script.
            pause
            exit /b 1
        )
    )
    for /f "tokens=*" %%v in ('python --version') do echo   [OK]    %%v found
)

REM --- Node.js / npm ---
where node >nul 2>&1
if errorlevel 1 (
    echo   [FAIL]  Node.js not found.
    echo           Install the LTS version from https://nodejs.org then re-run this script.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%v in ('node --version') do echo   [OK]    node %%v found
)
where npm >nul 2>&1
if errorlevel 1 (
    echo   [FAIL]  npm not found ^(usually installed alongside Node.js^).
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%v in ('npm --version') do echo   [OK]    npm %%v found
)

REM --- Ollama (required to actually generate reports) ---
where ollama >nul 2>&1
if errorlevel 1 (
    echo   [!!]    Ollama not found -- NGNotes needs it to generate reports.
    echo           Install it from https://ollama.com/download, then run: ollama pull qwen3.6
) else (
    echo   [OK]    ollama found
    curl -s -o nul --max-time 2 http://127.0.0.1:11434/api/tags
    if errorlevel 1 (
        echo   [!!]    Ollama is installed but doesn't seem to be running.
        echo           Start the Ollama app, then re-run this script ^(or just start NGNotes -- it will retry^).
    ) else (
        REM PowerShell (not batch string matching) parses the JSON properly --
        REM avoids the well-known fragility of escaping literal quote characters
        REM inside a batch-quoted findstr/find argument.
        set MODEL_COUNT=0
        for /f "delims=" %%c in ('powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2).models.Count } catch { 0 }"') do set MODEL_COUNT=%%c
        if "!MODEL_COUNT!"=="0" (
            echo   [!!]    Ollama is running but has no models installed yet.
            echo           NGNotes needs at least one. A solid general-purpose pick:
            echo               ollama pull qwen3.6
            set /p PULL_ANSWER="          Pull qwen3.6 now? This downloads roughly 23GB. [y/N] "
            if /i "!PULL_ANSWER!"=="y" (
                ollama pull qwen3.6
            ) else (
                echo           Skipped. Run 'ollama pull ^<model^>' yourself before generating a report.
            )
        ) else (
            echo   [OK]    ollama has !MODEL_COUNT! model^(s^) installed
        )
    )
)

REM --- pdflatex (required to export PDFs) ---
where pdflatex >nul 2>&1
if errorlevel 1 (
    echo   [!!]    pdflatex not found -- PDF export won't work without a LaTeX distribution.
    echo           Recommended ^(lightweight^): MiKTeX -- https://miktex.org/download
    echo           After installing, open MiKTeX Console and set the on-the-fly package
    echo           install option to Yes/Always, or your first PDF export may hang behind
    echo           a hidden install-confirmation dialog.
) else (
    echo   [OK]    pdflatex found
)

echo.
echo -- Setting up backend --
cd /d "%ROOT%\backend"
if not exist ".venv" (
    python -m venv .venv
)
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt
echo   [OK]    Backend dependencies installed

echo.
echo -- Setting up frontend --
cd /d "%ROOT%\frontend"
call npm install --silent
echo   [OK]    Frontend dependencies installed

echo.
echo ==================================================
echo  Setup complete.
echo  Double-click start.bat to launch NGNotes.
echo ==================================================
pause
