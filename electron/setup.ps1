$zip = "$env:TEMP\electron-v44.7.0-win32-x64.zip"
if ((Test-Path $zip) -and ((Get-Item $zip).Length -lt 1000000)) {
    Remove-Item $zip -Force
}

Write-Host "Mulai download Electron v44.7.0 (~150MB) dari GitHub Releases..."
& curl.exe -L -C - --retry 5 -o $zip "https://github.com/electron/electron/releases/download/v44.7.0/electron-v44.7.0-win32-x64.zip"

if (Test-Path $zip) {
    Write-Host "Download berhasil! Ukuran file: $((Get-Item $zip).Length) bytes"
    Write-Host "Mengekstrak ke node_modules/electron/dist..."
    $dist = "node_modules/electron/dist"
    if (!(Test-Path $dist)) {
        New-Item -ItemType Directory -Path $dist -Force | Out-Null
    }
    & tar.exe -xf $zip -C $dist
    [System.IO.File]::WriteAllText("node_modules/electron/path.txt", "electron.exe")
    Write-Host "SUCCESS: Electron binary terpasang dan siap digunakan!"
} else {
    Write-Error "Gagal mengunduh Electron zip."
}
