; Instalador do MTGA Stats (Inno Setup 6).
; Gere antes o dist\MTGA Stats.exe (build_exe.bat) e depois rode build_installer.bat.
; Resultado: dist\installer\MTGA-Stats-Setup-<versão>.exe

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6E0B7C2A-3F4D-4B8E-9C1A-5D2E8F7A9B31}
AppName=MTGA Stats
AppVersion={#AppVersion}
AppPublisher=falcao00
AppPublisherURL=https://github.com/falcao00/mtganalizer
AppSupportURL=https://github.com/falcao00/mtganalizer/issues
DefaultDirName={localappdata}\Programs\MTGA Stats
DefaultGroupName=MTGA Stats
DisableProgramGroupPage=yes
; instala só para o usuário atual: não pede permissão de administrador
PrivilegesRequired=lowest
OutputDir=..\dist\installer
OutputBaseFilename=MTGA-Stats-Setup-{#AppVersion}
UninstallDisplayIcon={app}\MTGA Stats.exe
UninstallDisplayName=MTGA Stats
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; fecha o MTGA Stats aberto antes de atualizar
CloseApplications=yes

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\MTGA Stats.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\MTGA Stats"; Filename: "{app}\MTGA Stats.exe"
Name: "{group}\{cm:UninstallProgram,MTGA Stats}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\MTGA Stats"; Filename: "{app}\MTGA Stats.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\MTGA Stats.exe"; Description: "{cm:LaunchProgram,MTGA Stats}"; Flags: nowait postinstall skipifsilent

; O histórico (%APPDATA%\MTGAStats) não é apagado na desinstalação.
