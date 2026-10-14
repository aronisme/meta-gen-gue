' ========================================================
' MetaGen Local FTP Bridge - Silent Background Runner
' Menjalankan server bridge tanpa memunculkan jendela CMD
' ========================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Dapatkan direktori root projek (folder di atas folder ftp-bridge)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)

WshShell.CurrentDirectory = rootDir

' Parameter 0 = Hidden Window (tidak ada jendela console/CMD)
' Parameter False = Jangan tunggu proses selesai (asinkron)
WshShell.Run "node ftp-bridge/server.mjs", 0, False
