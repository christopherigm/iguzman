# init-config.ps1 — Run once during Windows installation to generate config.json.
# Executed by the NSIS installer via:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File init-config.ps1 -ConfigPath <path>
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath
)

if (-not (Test-Path $ConfigPath)) {
    $uuid  = [guid]::NewGuid().ToString()
    $label = $env:COMPUTERNAME

    $config = [ordered]@{
        uuid        = $uuid
        wsBrokerUrl = "wss://ws.vd2.iguzman.com.mx/ws"
        label       = $label
    }

    $config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8

    Write-Host ""
    Write-Host "──────────────────────────────────────────────────────────"
    Write-Host " server-video-editor installed."
    Write-Host " Your agent UUID: $uuid"
    Write-Host " Register this UUID in the video-downloader UI at:"
    Write-Host "   https://vd2.iguzman.com.mx"
    Write-Host " Config file: $ConfigPath"
    Write-Host "──────────────────────────────────────────────────────────"
    Write-Host ""
}
