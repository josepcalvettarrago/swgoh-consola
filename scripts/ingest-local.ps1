# Ingesta LOCAL de swgoh.gg -> Firestore (Fase 2, plan B).
#
# Por qué local: desde el IP de datacenter de GitHub Actions, swgoh.gg devuelve 403
# (Cloudflare bloquea por IP; ni curl-impersonate lo esquiva). Desde tu IP de casa, curl
# pasa. Esta tarea corre la MISMA ingesta (scripts/ingest.mjs) desde tu equipo.
#
# La lanza la Tarea Programada "SWGOH Ingesta swgoh.gg" al iniciar sesion. Ejecucion manual:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingest-local.ps1
#
# El service account NO va en el repo: se lee de firebase\*adminsdk*.json (gitignored).

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot          # raiz del repo (padre de scripts\)
$log  = Join-Path $env:LOCALAPPDATA "swgoh-consola\ingest.log"
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $log -Value $line -Encoding utf8
  Write-Host $line
}

try {
  # 1) Localizar el service account (primer *adminsdk*.json en firebase\).
  $saFile = Get-ChildItem -Path (Join-Path $repo "firebase") -Filter "*adminsdk*.json" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $saFile) { throw "No encuentro el service account (firebase\*adminsdk*.json)." }

  # 2) Resolver node (full path para que la tarea no dependa del PATH).
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }
  if (-not (Test-Path $node)) { throw "No encuentro node.exe." }

  # 3) Env para el script: el JSON entero como string (ingest.mjs hace JSON.parse).
  $env:FIREBASE_SERVICE_ACCOUNT = Get-Content -Raw -Path $saFile.FullName
  $env:ALLY_CODE = "355463284"
  # (Sin CURL_BIN: en local se usa curl normal, que desde tu IP pasa el filtro de Cloudflare.)

  Log "=== inicio ingesta (sa: $($saFile.Name)) ==="
  Push-Location $repo
  $out = & $node "scripts/ingest.mjs" 2>&1
  $code = $LASTEXITCODE
  Pop-Location
  foreach ($l in $out) { Log $l }
  Log "=== fin (exit $code) ==="

  # 4) Rotacion simple: conservar las ultimas 800 lineas del log.
  $lines = Get-Content $log
  if ($lines.Count -gt 800) { $lines[-800..-1] | Set-Content -Path $log -Encoding utf8 }

  exit $code
}
catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}
