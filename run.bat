@echo off
rem Abre o MTGA Stats. Na primeira vez cria o ambiente Python e instala as dependencias.
cd /d "%~dp0"
if not exist .venv\Scripts\pythonw.exe (
  echo Preparando ambiente pela primeira vez...
  python -m venv .venv || (echo Python 3.10+ nao encontrado. Instale em https://www.python.org/downloads/ & pause & exit /b 1)
  .venv\Scripts\python -m pip install -q -r requirements.txt || (pause & exit /b 1)
)
start "" .venv\Scripts\pythonw.exe app.py
