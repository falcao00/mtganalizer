@echo off
rem Gera dist\installer\MTGA-Stats-Setup-<versao>.exe a partir de dist\MTGA Stats.exe.
rem Precisa do Inno Setup 6 (winget install JRSoftware.InnoSetup). Uso: build_installer.bat [versao]
cd /d "%~dp0"
if not exist "dist\MTGA Stats.exe" (
  echo Gere antes o executavel com build_exe.bat
  pause & exit /b 1
)
set ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe
if not exist "%ISCC%" set ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe
if not exist "%ISCC%" set ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe
if not exist "%ISCC%" (
  echo Inno Setup 6 nao encontrado. Instale com: winget install JRSoftware.InnoSetup
  pause & exit /b 1
)
set VER=%~1
if "%VER%"=="" set VER=1.0.0
"%ISCC%" /Q /DAppVersion=%VER% installer\MTGAStats.iss || (pause & exit /b 1)
echo.
echo Pronto: dist\installer\MTGA-Stats-Setup-%VER%.exe
pause
