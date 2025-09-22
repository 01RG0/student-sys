param(
  [string]$BindHost = '0.0.0.0',
  [int]$Port = 8443,
  [string]$CertFile = '../ssl/cert.pem',
  [string]$KeyFile = '../ssl/key.pem'
)

$ErrorActionPreference = 'Stop'

Push-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
try {
  Set-Location ..
  if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Virtual env not found. Creating...'
    py -3 -m venv .venv
  }
  if (-not (Test-Path $CertFile) -or -not (Test-Path $KeyFile)) {
    throw "SSL files not found: $CertFile or $KeyFile"
  }
  .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host $BindHost --port $Port --ssl-keyfile $KeyFile --ssl-certfile $CertFile
}
finally {
  Pop-Location
}


