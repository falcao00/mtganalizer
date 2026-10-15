@echo off
rem Gera dist\MTGA Stats.exe (executavel unico, nao precisa de Python instalado para rodar).
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe python -m venv .venv
.venv\Scripts\python -m pip install -q -r requirements.txt pyinstaller
.venv\Scripts\pyinstaller --noconfirm --onefile --windowed --name "MTGA Stats" --add-data "web;web" app.py
echo.
echo Pronto: dist\MTGA Stats.exe
pause
