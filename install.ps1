# ========================================================
# MetaGen Local FTP Bridge - One-Line GitHub Installer
# Usage in PowerShell:
#   irm https://raw.githubusercontent.com/aronisme/meta-gen-gue/main/install.ps1 | iex
# ========================================================

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  🚀 MetaGen Local FTP Bridge - Auto Installer" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Cek Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js belum terpasang di komputer Anda." -ForegroundColor Red
    Write-Host "Silakan unduh dan pasang Node.js terlebih dahulu di: https://nodejs.org" -ForegroundColor Yellow
    Exit 1
}

$nodeVersion = node -v
Write-Host "✔ Node.js terdeteksi: $nodeVersion" -ForegroundColor Green

# 2. Tentukan Direktori Kerja
$targetDir = "C:\App Tools\meta-gen-gue"
if (-not (Test-Path $targetDir)) {
    $targetDir = "$env:LOCALAPPDATA\MetaGen-Bridge"
    if (-not (Test-Path $targetDir)) {
        Write-Host "📥 Mengunduh MetaGen FTP Bridge dari GitHub..." -ForegroundColor Cyan
        if (Get-Command git -ErrorAction SilentlyContinue) {
            git clone --depth 1 https://github.com/aronisme/meta-gen-gue.git $targetDir
        } else {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            $zipPath = "$env:TEMP\metagen.zip"
            Invoke-WebRequest -Uri "https://github.com/aronisme/meta-gen-gue/archive/refs/heads/main.zip" -OutFile $zipPath
            Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\metagen-extract" -Force
            Copy-Item -Path "$env:TEMP\metagen-extract\meta-gen-gue-main\*" -Destination $targetDir -Recurse -Force
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            Remove-Item "$env:TEMP\metagen-extract" -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "✔ Direktori projek: $targetDir" -ForegroundColor Green

# 3. Install Dependencies jika belum ada
if (-not (Test-Path "$targetDir\node_modules")) {
    Write-Host "📦 Memasang modul dependensi..." -ForegroundColor Cyan
    Push-Location $targetDir
    npm install --omit=dev --silent
    Pop-Location
}

# 4. Daftarkan CLI Global (npm link)
Write-Host "🔗 Mendaftarkan perintah 'metagen-bridge' ke sistem..." -ForegroundColor Cyan
Push-Location $targetDir
try {
    npm link --silent
    Write-Host "✔ Perintah 'metagen-bridge' sekarang bisa diketik di mana saja!" -ForegroundColor Green
} catch {
    Write-Host "⚠ Gagal npm link, auto-start tetap akan dipasang via VBS." -ForegroundColor Yellow
}
Pop-Location

# 5. Pasang ke Startup Windows (Otomatis Aktif saat PC Dinyalakan)
Write-Host "⚙ Memasang auto-start permanen di Startup Windows..." -ForegroundColor Cyan
$startupFolder = [Environment]::GetFolderPath('Startup')
$vbsPath = Join-Path $startupFolder 'MetaGen-FTP-Bridge.vbs'

$vbsScript = @"
' MetaGen Local FTP Bridge - AutoStart Runner
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$targetDir"
WshShell.Run "node ftp-bridge/server.mjs", 0, False
"@

Set-Content -Path $vbsPath -Value $vbsScript -Encoding ASCII
Write-Host "✔ File auto-start terpasang di: $vbsPath" -ForegroundColor Green

# 6. Jalankan Sekarang di Latar Belakang
Write-Host "🚀 Menjalankan FTP Bridge di latar belakang sekarang..." -ForegroundColor Cyan
Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`""

Start-Sleep -Seconds 2

# 7. Verifikasi
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:45678/health" -TimeoutSec 3
    if ($res.ok) {
        Write-Host ""
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "  ✔ PEMASANGAN SELESAI & AKTIF!" -ForegroundColor Green
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "  ● Status:      Ready & Listening di port 45678" -ForegroundColor Cyan
        Write-Host "  ● Auto-Start:  Aktif permanen tiap PC dinyalakan" -ForegroundColor Cyan
        Write-Host "  ● Perintah:    Ketik 'metagen-bridge' di terminal kapan saja" -ForegroundColor Yellow
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host ""
    }
} catch {
    Write-Host "⚠ Server sedang dalam proses inisialisasi di port 45678." -ForegroundColor Yellow
}
