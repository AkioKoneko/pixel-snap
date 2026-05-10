$ErrorActionPreference = "Stop"

try {
  $Root = Split-Path -Parent $MyInvocation.MyCommand.Path
  $NeedStart = $false
  $Port = $null

  function Test-PortFree {
    param([int]$Port)
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
      $listener.Start()
      return $true
    } catch {
      return $false
    } finally {
      if ($listener) { $listener.Stop() }
    }
  }

  function Test-AppServing {
    param([int]$Port)
    try {
      $res = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/web/index.html" -UseBasicParsing -TimeoutSec 1
      return $res.StatusCode -eq 200 -and $res.Content -match "Pixel Snap"
    } catch {
      return $false
    }
  }

  foreach ($candidate in 8765..8775) {
    if (Test-AppServing $candidate) {
      $Port = $candidate
      break
    }

    if (Test-PortFree $candidate) {
      $Port = $candidate
      $NeedStart = $true
      break
    }
  }

  if ($null -eq $Port) {
    throw "No free port found in 8765..8775."
  }

  if ($NeedStart) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    $py = Get-Command py -ErrorAction SilentlyContinue

    if ($python) {
      Start-Process -FilePath $python.Source -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1") -WorkingDirectory $Root -WindowStyle Hidden
    } elseif ($py) {
      Start-Process -FilePath $py.Source -ArgumentList @("-3", "-m", "http.server", "$Port", "--bind", "127.0.0.1") -WorkingDirectory $Root -WindowStyle Hidden
    } else {
      throw "Python was not found. Install Python or add it to PATH."
    }

    $ready = $false
    foreach ($i in 1..30) {
      Start-Sleep -Milliseconds 200
      if (Test-AppServing $Port) {
        $ready = $true
        break
      }
    }

    if (-not $ready) {
      throw "Local web server did not become ready on port $Port."
    }
  }

  Start-Process "http://127.0.0.1:$Port/web/"
} catch {
  Write-Host ""
  Write-Host "Pixel Snap Web launch failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 1
}
