@echo off
setlocal enabledelayedexpansion
REM Launches the NGNotes backend and frontend, each in its own window, waits
REM for both to come up, and opens the app in your default browser. Close
REM either of the two windows this opens (NGNotes Backend / NGNotes
REM Frontend) to stop that server.
cd /d "%~dp0"
set ROOT=%CD%

if not exist "%ROOT%\backend\.venv\Scripts\python.exe" goto :needsetup
if not exist "%ROOT%\frontend\node_modules" goto :needsetup
goto :afterSetupCheck

:needsetup
echo Setup hasn't been run yet.
echo Double-click setup.bat first, then come back to this one.
pause
exit /b 1

:afterSetupCheck
set BACKEND_PORT=8010
set FRONTEND_PORT=5173

REM Port-busy check: only a LISTENING socket counts as "busy" -- a plain
REM `netstat` match can also hit stale/closed connections that merely
REM reference the port number without anything actually bound there.
netstat -ano | findstr /r /c:":%BACKEND_PORT% .*LISTENING" >nul
if not errorlevel 1 goto :portbusy
netstat -ano | findstr /r /c:":%FRONTEND_PORT% .*LISTENING" >nul
if not errorlevel 1 goto :portbusy
goto :afterPortCheck

:portbusy
echo Port %BACKEND_PORT% or %FRONTEND_PORT% is already in use by something else
echo (maybe NGNotes is already running? check for another open window).
echo Close whatever is using it, then try again.
pause
exit /b 1

:afterPortCheck
echo ==================================================
echo  Starting NGNotes
echo ==================================================

echo Starting backend on port %BACKEND_PORT%...
start "NGNotes Backend" /d "%ROOT%\backend" cmd /k ""%ROOT%\backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port %BACKEND_PORT%"

echo Starting frontend on port %FRONTEND_PORT%...
start "NGNotes Frontend" /d "%ROOT%\frontend" cmd /k "npm run dev -- --host 127.0.0.1 --port %FRONTEND_PORT% --strictPort"

echo Waiting for both to come up...
set READY=
for /l %%i in (1,1,30) do (
    curl -s -o nul "http://127.0.0.1:%BACKEND_PORT%/api/health" && (
        curl -s -o nul "http://127.0.0.1:%FRONTEND_PORT%/" && (
            set READY=1
        )
    )
    if defined READY goto :ready
    timeout /t 1 /nobreak >nul
)

:ready
if not defined READY (
    echo Servers are taking longer than expected -- check the NGNotes Backend
    echo and NGNotes Frontend windows for errors.
)

start "" "http://127.0.0.1:%FRONTEND_PORT%"

echo.
echo ==================================================
echo  NGNotes is running:
echo    App:     http://127.0.0.1:%FRONTEND_PORT%
echo    Backend: http://127.0.0.1:%BACKEND_PORT%
echo.
echo  Also make sure the Ollama app is running -- report
echo  generation needs it.
echo.
echo  Two new windows opened, titled NGNotes Backend and NGNotes
echo  Frontend. Closing either one stops that server. You can
echo  close this window now.
echo ==================================================
pause
