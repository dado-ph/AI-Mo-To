!macro customInstall
  CreateDirectory "$LOCALAPPDATA\Microsoft\WindowsApps"
  CopyFiles /SILENT "$INSTDIR\resources\launcher\aimoto-launcher.ps1" "$INSTDIR\aimoto-launcher.ps1"
  FileOpen $0 "$LOCALAPPDATA\Microsoft\WindowsApps\aimoto.cmd" w
  ; The helper keeps ordinary CLI commands synchronous, while `open` validates,
  ; launches the GUI independently, emits its response, and returns promptly.
  FileWrite $0 '@powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\aimoto-launcher.ps1" %*$\r$\n'
  FileClose $0
  WriteRegStr HKCU "Software\AI-Mo-To" "InstallPath" "$INSTDIR"

  ; AI-Mo-To owns this skill name. Always replace stale copies so agents use
  ; the current workspace handoff contract after an upgrade.
  ; Install for new Codex users, then upgrade every existing agent home that
  ; already contains an aimoto-operate skill. This avoids vendor assumptions.
  StrCpy $2 "$PROFILE\.codex\skills\aimoto-operate"
  RMDir /r "$2"
  CreateDirectory "$2\agents"
  CopyFiles /SILENT "$INSTDIR\resources\agent-skills\aimoto-operate\SKILL.md" "$2\SKILL.md"
  CopyFiles /SILENT "$INSTDIR\resources\agent-skills\aimoto-operate\agents\openai.yaml" "$2\agents\openai.yaml"
  CopyFiles /SILENT "$INSTDIR\resources\agent-skills\aimoto-operate\.installed-by-ai-mo-to" "$2\.installed-by-ai-mo-to"
  WriteRegStr HKCU "Software\AI-Mo-To" "CodexSkillPath" "$2"
  StrCpy $2 "$PROFILE\.agents\skills\aimoto-operate"
  RMDir /r "$2"
  CreateDirectory "$2\agents"
  CopyFiles /SILENT "$INSTDIR\resources\agent-skills\aimoto-operate\SKILL.md" "$2\SKILL.md"
  CopyFiles /SILENT "$INSTDIR\resources\agent-skills\aimoto-operate\agents\openai.yaml" "$2\agents\openai.yaml"
  CopyFiles /SILENT "$INSTDIR\resources\agent-skills\aimoto-operate\.installed-by-ai-mo-to" "$2\.installed-by-ai-mo-to"
!macroend

!macro customUnInstall
  Delete "$LOCALAPPDATA\Microsoft\WindowsApps\aimoto.cmd"
  Delete "$INSTDIR\aimoto-launcher.ps1"

  ; Use the path recorded at install time even if CODEX_HOME later changes.
  ReadRegStr $2 HKCU "Software\AI-Mo-To" "CodexSkillPath"
  StrCmp $2 "" aimoto_skill_uninstall_fallback aimoto_skill_uninstall_path_ready
aimoto_skill_uninstall_fallback:
  ReadEnvStr $1 "CODEX_HOME"
  StrCmp $1 "" 0 +2
    StrCpy $1 "$PROFILE\.codex"
  StrCpy $2 "$1\skills\aimoto-operate"
aimoto_skill_uninstall_path_ready:
  IfFileExists "$2\.installed-by-ai-mo-to" 0 aimoto_skill_uninstall_done
  Delete "$2\SKILL.md"
  Delete "$2\agents\openai.yaml"
  Delete "$2\.installed-by-ai-mo-to"
  RMDir "$2\agents"
  ; Preserve the directory if the user added any files of their own.
  RMDir "$2"
aimoto_skill_uninstall_done:
  DeleteRegValue HKCU "Software\AI-Mo-To" "CodexSkillPath"
  DeleteRegValue HKCU "Software\AI-Mo-To" "InstallPath"
!macroend
