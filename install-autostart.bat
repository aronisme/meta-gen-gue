@echo off
title Install MetaGen Local FTP Bridge Auto-Start
echo ========================================================
echo   MetaGen Local FTP Bridge - Auto-Start Installer
echo ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_TARGET=%STARTUP_FOLDER%\MetaGen-FTP-Bridge.vbs"

echo [1/3] Menyiapkan auto-start di folder Startup Windows...
echo       Lokasi: %STARTUP_FOLDER%

(
echo ' MetaGen Local FTP Bridge - AutoStart Runner
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%SCRIPT_DIR:~0,-1%"
echo WshShell.Run "node ftp-bridge/server.mjs", 0, False
) > "%VBS_TARGET%"

echo [V] File auto-start berhasil dipasang: MetaGen-FTP-Bridge.vbs
echo.

echo [2/3] Memastikan FTP Bridge aktif di latar belakang sekarang...
wscript.exe "%VBS_TARGET%"

echo [3/3] Memverifikasi status server...
timeout /t 2 >nul
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri http://127.0.0.1:45678/health -TimeoutSec 3; if ($r.ok) { Write-Host '● Status: BERHASIL AKTIF & SIAP di Port 45678' -ForegroundColor Green } } catch { Write-Host '● Catatan: Bridge sedang dalam proses inisialisasi...' -ForegroundColor Yellow }"

echo.
echo ========================================================
echo   SELESAI!
echo   Mulai sekarang, MetaGen FTP Bridge akan OTOMATIS AKTIF
echo   di latar belakang setiap kali PC/laptop dinyalakan
echo   tanpa jendela terminal yang mengganggu.
echo ========================================================
echo.
pause
