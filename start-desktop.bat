@echo off
title MetaGen Microstock Desktop
echo ========================================================
echo   Menjalankan MetaGen Microstock Desktop App...
echo ========================================================
cd /d "%~dp0"
pnpm dev:desktop
pause
