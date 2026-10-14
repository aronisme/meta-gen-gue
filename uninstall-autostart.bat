@echo off
title Uninstall MetaGen Local FTP Bridge Auto-Start
echo ========================================================
echo   MetaGen Local FTP Bridge - Uninstall Auto-Start
echo ========================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_TARGET=%STARTUP_FOLDER%\MetaGen-FTP-Bridge.vbs"

if exist "%VBS_TARGET%" (
    del /f /q "%VBS_TARGET%"
    echo [V] File auto-start berhasil dihapus dari Startup Windows.
) else (
    echo [i] File auto-start tidak ditemukan di Startup.
)

echo.
echo Menghentikan proses node FTP Bridge pada port 45678...
powershell -NoProfile -Command "$port = 45678; $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if ($conn) { $pidToKill = $conn.OwningProcess | Select-Object -Unique; Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue; Write-Host '● Proses Bridge (PID: ' $pidToKill ') telah dihentikan.' -ForegroundColor Yellow } else { Write-Host '● Tidak ada proses aktif di port 45678.' -ForegroundColor Green }"

echo.
echo ========================================================
echo   Auto-start MetaGen FTP Bridge telah dinonaktifkan.
echo ========================================================
echo.
pause
