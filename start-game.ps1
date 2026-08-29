$ErrorActionPreference = "Stop"

$gameRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$gameUrl = "http://127.0.0.1:4173/"
$listener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue

if (-not $listener) {
  $nodePath = (Get-Command node -ErrorAction Stop).Source
  $serverScript = Join-Path $gameRoot "tools\server.mjs"
  Start-Process -FilePath $nodePath -ArgumentList @($serverScript, "--root", "dist") -WorkingDirectory $gameRoot -WindowStyle Hidden

  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 100
    try {
      $response = Invoke-WebRequest -Uri $gameUrl -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw "ゲームサーバーを起動できませんでした。" }
}

Start-Process $gameUrl
