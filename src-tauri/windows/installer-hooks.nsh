; InvoraLite Installer — 750x450 split mockup
!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

!define MODERN_W 750
!define MODERN_H 450
!define MODERN_BODY_H 400
!define MODERN_TIMER_ID 1337

Var ModernPathField
Var ModernBrowseBtn
Var ModernLicenseCheck
Var ModernLicenseLink
Var ModernBgReady
Var ModernPctLabel
Var ModernPageDlg

Function ModernLoadAssets
  ${If} $ModernBgReady = 1
    Return
  ${EndIf}
  InitPluginsDir
  !if "${SIDEBARIMAGE}" != ""
    File /nonfatal /oname=$PLUGINSDIR\invora-bg.bmp "${SIDEBARIMAGE}"
  !endif
  !if "${INSTALLERICON}" != ""
    File /nonfatal /oname=$PLUGINSDIR\invora-icon.ico "${INSTALLERICON}"
  !endif
  StrCpy $ModernBgReady 1
FunctionEnd

Function ModernCenterWindow
  System::Call 'user32::GetSystemMetrics(i 0) i .r1'
  System::Call 'user32::GetSystemMetrics(i 1) i .r2'
  IntOp $3 ${MODERN_W} / 2
  IntOp $4 ${MODERN_H} / 2
  IntOp $5 $1 - $3
  IntOp $6 $2 - $4
  System::Call 'user32::SetWindowPos(i $HWNDPARENT, i 0, i r5, i r6, i ${MODERN_W}, i ${MODERN_H}, i 0x14)'
FunctionEnd

Function ModernHideChrome
  GetDlgItem $0 $HWNDPARENT 1034
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1035
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1036
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1037
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1038
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1028
  ShowWindow $0 ${SW_HIDE}
FunctionEnd

Function ModernGetPageDialog
  GetDlgItem $ModernPageDlg $HWNDPARENT 1044
FunctionEnd

Function ModernPreparePage
  Call ModernHideChrome
  GetDlgItem $0 $HWNDPARENT 1044
  System::Call 'user32::SetWindowPos(i r0, i 0, i 0, i 0, i ${MODERN_W}, i ${MODERN_BODY_H}, i 0x40)'
FunctionEnd

Function ModernGuiInit
  StrCpy $ModernBgReady 0
  Call ModernLoadAssets
  Call ModernCenterWindow
FunctionEnd

Function ModernInstallShow
  Call ModernPreparePage
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Install"
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
FunctionEnd

Function ModernInstallCreate
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}
  Call ModernInstallShow
  Call ModernLoadAssets

  nsDialogs::Create 1018
  Pop $0
  ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

  ; Full split background (white left + gradient right) — must be first control
  ${NSD_CreateBitmap} 0u 0u 100% 100%
  Pop $0
  ${NSD_SetStretchedImage} $0 "$PLUGINSDIR\invora-bg.bmp" $1

  CreateFont $1 "Segoe UI" 12 600
  CreateFont $2 "Segoe UI" 15 700
  CreateFont $3 "Segoe UI" 9 400
  CreateFont $4 "Segoe UI" 8 400
  CreateFont $5 "Segoe UI" 9 400

  ${NSD_CreateLabel} 32u 10u 44% 14u "${PRODUCTNAME}"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $1 0

  ${NSD_CreateLabel} 10u 34u 44% 40u "Streamlining your stock, sales, and inventory management."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $2 0

  ${NSD_CreateLabel} 10u 74u 44% 18u "${PRODUCTNAME} will be ready in just a few moments."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $3 0

  ${NSD_CreateLabel} 10u 98u 44% 10u "Install location"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $4 0

  ${NSD_CreateText} 10u 110u 38% 12u "$INSTDIR"
  Pop $ModernPathField
  SendMessage $ModernPathField ${WM_SETFONT} $5 0

  ${NSD_CreateBrowseButton} 40% 109u 4% 14u "..."
  Pop $ModernBrowseBtn
  ${NSD_OnClick} $ModernBrowseBtn ModernBrowseClick

  !if "${LICENSE}" != ""
    File /nonfatal /oname=$PLUGINSDIR\InvoraLite-EULA.txt "${LICENSE}"

    ${NSD_CreateLink} 10u 128u 44% 10u "View License terms and conditions"
    Pop $ModernLicenseLink
    ${NSD_OnClick} $ModernLicenseLink ModernLicenseOpen

    ${NSD_CreateCheckbox} 10u 142u 44% 12u "I agree to the License terms and conditions"
    Pop $ModernLicenseCheck
    SendMessage $ModernLicenseCheck ${WM_SETFONT} $5 0
    ${NSD_SetState} $ModernLicenseCheck ${BST_UNCHECKED}
  !endif

  ${NSD_CreateLabel} 10u 168u 44% 10u "Developed by Gyan B. Baraily"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $4 0

  nsDialogs::Show
FunctionEnd

Function ModernBrowseClick
  ${NSD_GetText} $ModernPathField $0
  nsDialogs::SelectFolderDialog "Choose install location" $0
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $ModernPathField $0
    StrCpy $INSTDIR $0
  ${EndIf}
FunctionEnd

Function ModernLicenseOpen
  ExecShell "open" "$PLUGINSDIR\InvoraLite-EULA.txt"
FunctionEnd

Function ModernInstallLeave
  ${NSD_GetText} $ModernPathField $0
  ${IfThen} $0 != "" ${|} StrCpy $INSTDIR $0 ${|}

  !if "${LICENSE}" != ""
    ${NSD_GetState} $ModernLicenseCheck $1
    ${If} $1 != ${BST_CHECKED}
      MessageBox MB_ICONEXCLAMATION|MB_OK "Please accept the License terms and conditions to install ${PRODUCTNAME}."
      Abort
    ${EndIf}
  !endif
FunctionEnd

Function ModernPaintBgOnDialog
  Call ModernLoadAssets
  Call ModernGetPageDialog
  IfFileExists "$PLUGINSDIR\invora-bg.bmp" 0 bg_done
  System::Call 'user32::LoadImage(i 0, t "$PLUGINSDIR\invora-bg.bmp", i 0, i 0, i 0, i 0x10) i .r1'
  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "", i 0x2000000E, i 0, i 0, i ${MODERN_W}, i ${MODERN_BODY_H}, p $ModernPageDlg, i 1999, i 0, i 0) i .r2'
  SendMessage $2 ${STM_SETIMAGE} 0 $1
bg_done:
FunctionEnd

Function ModernCreateLeftBrandPx
  Call ModernGetPageDialog
  CreateFont $1 "Segoe UI" 12 600
  CreateFont $2 "Segoe UI" 15 700
  CreateFont $3 "Segoe UI" 9 400
  CreateFont $4 "Segoe UI" 8 400

  IfFileExists "$PLUGINSDIR\invora-icon.ico" 0 no_icon
    System::Call 'user32::LoadImage(i 0, t "$PLUGINSDIR\invora-icon.ico", i 1, i 32, i 32, i 0x10) i .r5'
    System::Call 'user32::CreateWindowEx(i 0, w "Static", w "", i 0x50000003, i 40, i 36, i 32, i 32, p $ModernPageDlg, i 0, i 0, i 0) i .r6'
    SendMessage $6 ${STM_SETIMAGE} 1 $5
  no_icon:

  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "${PRODUCTNAME}", i 0x50000000, i 80, i 40, i 260, i 24, p $ModernPageDlg, i 0, i 0, i 0) i .r7'
  SendMessage $7 ${WM_SETFONT} $1 0

  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "Streamlining your stock, sales, and inventory management.", i 0x50000000, i 40, i 100, i 300, i 72, p $ModernPageDlg, i 0, i 0, i 0) i .r8'
  SendMessage $8 ${WM_SETFONT} $2 0

  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "${PRODUCTNAME} will be ready in just a few moments.", i 0x50000000, i 40, i 178, i 300, i 36, p $ModernPageDlg, i 0, i 0, i 0) i .r9'
  SendMessage $9 ${WM_SETFONT} $3 0

  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "Developed by Gyan B. Baraily", i 0x50000000, i 40, i 360, i 280, i 18, p $ModernPageDlg, i 0, i 0, i 0) i .r0'
  SendMessage $0 ${WM_SETFONT} $4 0
FunctionEnd

Function ModernInstFilesTimer
  GetDlgItem $0 $HWNDPARENT 1046
  SendMessage $0 ${PBM_GETPOS} 0 0 $1
  IntFmt $2 "%d%%" $1
  SendMessage $ModernPctLabel ${WM_SETTEXT} 0 "STR:$2"
FunctionEnd

Function ModernInstFilesShow
  ${IfThen} $PassiveMode = 1 ${|} Return ${|}

  Call ModernPreparePage
  Call ModernPaintBgOnDialog
  Call ModernCreateLeftBrandPx

  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}

  GetDlgItem $1 $HWNDPARENT 1016
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1006
  ShowWindow $1 ${SW_HIDE}

  GetDlgItem $1 $HWNDPARENT 1046
  SendMessage $1 ${PBM_SETBARCOLOR} 0 0x00EED322
  SendMessage $1 ${PBM_SETBKCOLOR} 0 0x40FFFFFF
  System::Call 'user32::SetWindowPos(i r1, i 0, i 430, i 185, i 270, i 20, i 0x40)'

  Call ModernGetPageDialog
  CreateFont $2 "Segoe UI" 9 600
  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "0%", i 0x50000005, i 545, i 188, i 40, i 18, p $ModernPageDlg, i 0, i 0, i 0) i .r3'
  SendMessage $3 ${WM_SETFONT} $2 0
  StrCpy $ModernPctLabel $3

  CreateFont $4 "Segoe UI" 9 400
  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "Now installing...", i 0x50000005, i 430, i 214, i 270, i 20, p $ModernPageDlg, i 0, i 0, i 0) i .r5'
  SendMessage $5 ${WM_SETFONT} $4 0

  GetFunctionAddress $6 ModernInstFilesTimer
  System::Call 'user32::SetTimer(p $HWNDPARENT, i ${MODERN_TIMER_ID}, i 120, p r6) p .r7'
FunctionEnd

Function ModernInstFilesLeave
  System::Call 'user32::KillTimer(p $HWNDPARENT, i ${MODERN_TIMER_ID})'
FunctionEnd

Function ModernFinishShow
  ${IfThen} $PassiveMode = 1 ${|} Return ${|}
  Call ModernPreparePage
  Call ModernPaintBgOnDialog

  Call ModernGetPageDialog
  CreateFont $1 "Segoe UI" 12 600
  CreateFont $2 "Segoe UI" 15 700
  CreateFont $3 "Segoe UI" 9 400
  CreateFont $4 "Segoe UI" 8 400

  IfFileExists "$PLUGINSDIR\invora-icon.ico" 0 fin_no_icon
    System::Call 'user32::LoadImage(i 0, t "$PLUGINSDIR\invora-icon.ico", i 1, i 32, i 32, i 0x10) i .r5'
    System::Call 'user32::CreateWindowEx(i 0, w "Static", w "", i 0x50000003, i 40, i 36, i 32, i 32, p $ModernPageDlg, i 0, i 0, i 0) i .r6'
    SendMessage $6 ${STM_SETIMAGE} 1 $5
  fin_no_icon:

  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "${PRODUCTNAME}", i 0x50000000, i 80, i 40, i 260, i 24, p $ModernPageDlg, i 0, i 0, i 0) i .r7'
  SendMessage $7 ${WM_SETFONT} $1 0

  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "${PRODUCTNAME} is ready to use.", i 0x50000000, i 40, i 100, i 300, i 72, p $ModernPageDlg, i 0, i 0, i 0) i .r8'
  SendMessage $8 ${WM_SETFONT} $2 0

  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "Launch ${PRODUCTNAME} or create a desktop shortcut below.", i 0x50000000, i 40, i 178, i 300, i 36, p $ModernPageDlg, i 0, i 0, i 0) i .r9'
  SendMessage $9 ${WM_SETFONT} $3 0

  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "Developed by Gyan B. Baraily", i 0x50000000, i 40, i 360, i 280, i 18, p $ModernPageDlg, i 0, i 0, i 0) i .r0'
  SendMessage $0 ${WM_SETFONT} $4 0
FunctionEnd
