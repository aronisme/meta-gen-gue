@echo off
title Status MetaGen Local FTP Bridge
echo ========================================================
echo   Status MetaGen Local FTP Bridge (Port 45678)
echo ========================================================
echo.

powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri http://127.0.0.1:45678/health -TimeoutSec 3; if ($r.ok) { Write-Host '● STATUS: AKTIF DI LATAR BELAKANG (Port 45678)' -ForegroundColor Green; Write-Host ('  Uptime: ' + [Math]::Floor($r.uptimeSec / 60) + ' menit ' + ($r.uptimeSec %% 60) + ' detik'); Write-Host '  Web App (Cloudflare / Local) siap melakukan upload.' -ForegroundColor Cyan } } catch { Write-Host '● STATUS: TIDAK AKTIF (Offline)' -ForegroundColor Red; Write-Host '  Jalankan install-autostart.bat atau start-ftp-bridge.bat untuk mengaktifkannya.' -ForegroundColor Yellow }"

echo.
pause
