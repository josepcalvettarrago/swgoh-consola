# Ingesta LOCAL de gremio: roster de cada miembro -> players/{ally} (Fase 5.2).
#
# Igual que ingest-local.ps1 pero corre scripts/ingest-guild.mjs. Local (IP residencial) porque
# swgoh.gg bloquea el IP de datacenter. Pensado para una Tarea Programada aparte, DESPUES de la de
# Yusepi (ingest-local.ps1) — necesita que meta/characters y players/{admin} ya esten en Firestore.
#
# Ejecucion manual:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingest-guild-local.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingest-guild-local.ps1 --dry
#
# El service account NO va en el repo: se lee de firebase\*adminsdk*.json (gitignored).

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot          # raiz del repo (padre de scripts\)
$log  = Join-Path $env:LOCALAPPDATA "swgoh-consola\ingest-guild.log"
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

  # 3) Env para el script: el JSON entero como string (el mjs hace JSON.parse).
  $env:FIREBASE_SERVICE_ACCOUNT = Get-Content -Raw -Path $saFile.FullName
  $env:ALLY_CODE = "355463284"
  # (Sin CURL_BIN: en local se usa curl normal, que desde tu IP pasa el filtro de Cloudflare.)

  Log "=== inicio ingesta de gremio (sa: $($saFile.Name)) ==="
  Push-Location $repo
  $out = & $node "scripts/ingest-guild.mjs" @args 2>&1   # reenvia --dry / --limit / --only
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
