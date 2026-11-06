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
if "%VER%"=="" set VER=1.2.0
rem com certificado configurado (ver sign.bat), o Inno Setup assina o instalador e o desinstalador
if exist sign.local.bat call sign.local.bat
set SIGNARGS=
if defined SIGN_CERT_SHA1 set SIGNARGS=1
if defined SIGN_AZURE_METADATA set SIGNARGS=1
if defined SIGN_PFX set SIGNARGS=1
if defined SIGNARGS (
  "%ISCC%" /Q /DAppVersion=%VER% /DSIGN "/Smtgasign=cmd /c call $q%~dp0sign.bat$q $f" installer\MTGAStats.iss || (pause & exit /b 1)
) else (
  echo Sem certificado configurado: o instalador nao sera assinado.
  "%ISCC%" /Q /DAppVersion=%VER% installer\MTGAStats.iss || (pause & exit /b 1)
)
echo.
echo Pronto: dist\installer\MTGA-Stats-Setup-%VER%.exe
pause
