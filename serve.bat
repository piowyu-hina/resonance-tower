@echo off
cd /d "%~dp0prototype"
echo Server starting at http://127.0.0.1:8000/index.html
echo Close this window to stop the server.
start "" "http://127.0.0.1:8000/index.html"
python -m http.server 8000 || py -m http.server 8000 || python3 -m http.server 8000
pause
