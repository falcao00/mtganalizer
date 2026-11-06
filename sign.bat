@echo off
rem Assina digitalmente um arquivo (exe ou instalador) com o signtool do Windows SDK.
rem Uso: sign.bat "caminho\arquivo.exe"
rem
rem O certificado vem de variaveis de ambiente, que podem ficar em sign.local.bat (fora do git):
rem   Certificado instalado no Windows ou em token USB da certificadora:
rem     set SIGN_CERT_SHA1=<impressao digital do certificado>
rem   Azure Artifact Signing (antigo Trusted Signing):
rem     set SIGN_AZURE_DLIB=<caminho do Azure.CodeSigning.Dlib.dll>
rem     set SIGN_AZURE_METADATA=<caminho do metadata.json>
rem   Arquivo .pfx:
rem     set SIGN_PFX=<caminho do .pfx>
rem     set SIGN_PFX_PASSWORD=<senha>
rem Sem nenhuma delas o arquivo fica sem assinatura e o build continua.
setlocal
if "%~1"=="" (
  echo Uso: sign.bat "arquivo.exe"
  exit /b 1
)
if exist "%~dp0sign.local.bat" call "%~dp0sign.local.bat"

set TS=http://timestamp.digicert.com
if defined SIGN_CERT_SHA1 (
  set "MODE=/sha1 %SIGN_CERT_SHA1%"
) else if defined SIGN_AZURE_METADATA (
  set "MODE=/dlib "%SIGN_AZURE_DLIB%" /dmdf "%SIGN_AZURE_METADATA%""
  set TS=http://timestamp.acs.microsoft.com
) else if defined SIGN_PFX (
  set "MODE=/f "%SIGN_PFX%" /p "%SIGN_PFX_PASSWORD%""
) else (
  echo Sem certificado configurado: "%~nx1" nao foi assinado.
  exit /b 0
)

rem a ultima versao do SDK listada e a mais nova
set SIGNTOOL=
for /f "delims=" %%s in ('dir /b /s "%ProgramFiles(x86)%\Windows Kits\10\bin\signtool.exe" 2^>nul ^| findstr /i "\\x64\\signtool.exe"') do set "SIGNTOOL=%%s"
if not defined SIGNTOOL (
  echo signtool.exe nao encontrado. Instale o Windows SDK: winget install Microsoft.WindowsSDK.10.0.26100
  exit /b 1
)

"%SIGNTOOL%" sign %MODE% /fd SHA256 /tr %TS% /td SHA256 /d "MTGA Stats" /du "https://github.com/falcao00/mtganalizer" "%~1" || exit /b 1
"%SIGNTOOL%" verify /pa /q "%~1" >nul 2>&1 || echo Aviso: assinado, mas o Windows nao confia neste certificado.
exit /b 0
