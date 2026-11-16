@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
    echo MVDeF is available at http://127.0.0.1:5500/
    echo Press Ctrl+C to stop the server.
    py -m http.server 5500 --bind 127.0.0.1
    exit /b %errorlevel%
)

where python >nul 2>nul
if not errorlevel 1 (
    echo MVDeF is available at http://127.0.0.1:5500/
    echo Press Ctrl+C to stop the server.
    python -m http.server 5500 --bind 127.0.0.1
    exit /b %errorlevel%
)

echo Python was not found. Install Python and make sure it is on PATH.
pause
exit /b 1
