# Registra la Tarea Programada de Windows que corre la ingesta al iniciar sesion.
# EJECUTAR UNA VEZ COMO ADMINISTRADOR:
#   - Boton derecho sobre este fichero -> "Ejecutar con PowerShell" (si tu usuario es admin), o
#   - Abre PowerShell como administrador y:  powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
#
# No contiene secretos: solo define la tarea. La clave la lee ingest-local.ps1 en tiempo de ejecucion.
# Para quitarla:  Unregister-ScheduledTask -TaskName "SWGOH Ingesta swgoh.gg" -Confirm:$false

$ErrorActionPreference = "Stop"
$taskName = "SWGOH Ingesta swgoh.gg"
$ps1 = Join-Path $PSScriptRoot "ingest-local.ps1"
if (-not (Test-Path $ps1)) { throw "No encuentro $ps1" }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ps1`""

$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = "PT1M"   # 1 min tras el logon, para que haya red

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force `
  -Description "Ingesta swgoh.gg -> Firestore (swgohapi). Corre al iniciar sesion desde la IP local; Cloudflare bloquea el datacenter de GitHub." | Out-Null

Write-Host "OK: tarea '$taskName' registrada."
Write-Host "Probarla ahora:  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Ver ultimo log:  Get-Content `"$env:LOCALAPPDATA\swgoh-consola\ingest.log`" -Tail 20"
