@echo off
cd /d "%~dp0"
where py >nul 2>nul && (start "" http://127.0.0.1:8080 & py -m http.server 8080 --bind 127.0.0.1 & exit /b)
where python >nul 2>nul && (start "" http://127.0.0.1:8080 & python -m http.server 8080 --bind 127.0.0.1 & exit /b)
echo No se encontro Python.
pause
