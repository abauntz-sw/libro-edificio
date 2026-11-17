# Crea en Windows la tarea programada que actualiza la copia cada mañana.
#
# Se ejecuta una sola vez, en el ordenador de la oficina, con la sesión de quien la usará:
#   powershell -ExecutionPolicy Bypass -File copia\instalar-tarea.ps1
#
# Si ya existía, la cambia por la nueva. Para quitarla:
#   Unregister-ScheduledTask -TaskName 'Libro del Edificio - copia'

param(
  # La hora de cada día. La exportación se hace de madrugada, así que a las 7 ya está.
  [string]$Hora = '07:00',
  [string]$Nombre = 'Libro del Edificio - copia'
)

$script = Join-Path $PSScriptRoot 'actualizar.ps1'
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$cuando = New-ScheduledTaskTrigger -Daily -At $Hora
# Si el ordenador estaba apagado a esa hora, la lanza en cuanto se encienda.
# Si no hay red, lo intenta otras tres veces, cada media hora.
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $Nombre -Action $accion -Trigger $cuando -Settings $ajustes `
  -Description 'Descarga los cambios del Libro del Edificio. Ver copia\README.md' -Force | Out-Null

Write-Output "Tarea «$Nombre» creada: cada día a las $Hora."
Write-Output "Para probarla ahora: Start-ScheduledTask -TaskName '$Nombre'"
