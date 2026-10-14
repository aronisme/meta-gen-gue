@echo off
title MetaGen Local FTP Bridge (Port 45678)
echo ========================================================
echo   MetaGen Local FTP Bridge
echo   Jembatan Pengunggahan FTP/SFTP Microstock Lokal
echo ========================================================
echo.
cd /d "%~dp0"
node ftp-bridge/server.mjs
pause
