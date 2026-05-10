@echo off
REM Local server for the pixel-snap web app.
REM ES modules + WASM cannot load via file:// — need an http origin.
cd /d "%~dp0"
echo Open http://localhost:8000/web/
python -m http.server 8000
