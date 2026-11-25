# Comprueba que la copia de la oficina está al día y que sus archivos no han cambiado.
#
#   powershell -ExecutionPolicy Bypass -File copia\comprobar.ps1
#
# Mira cuatro cosas:
#   1. Cuándo se actualizó la copia por última vez, según la tarea programada.
#   2. Si en GitHub hay algo que la copia todavía no tiene.
#   3. Que ninguna ruta pase de 250 caracteres. Windows no abre las de más de 260.
#   4. Que cada documento del índice está en la copia y su huella coincide.
# Al final dice «Todo bien» o lo que falla. No cambia nada.

param(
  [string]$Carpeta = (Split-Path -Parent $PSScriptRoot)
)

# Git escribe en UTF-8. Sin esto, PowerShell lo lee con la codificación antigua de Windows y las tildes salen mal.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$problemas = @()

# 1. La última actualización.
$registro = Join-Path $Carpeta '.git\copia-registro.txt'
if (Test-Path $registro) {
  $ultima = Get-Content $registro -Encoding UTF8 | Select-Object -Last 1
  Write-Output "Última actualización: $ultima"
  $ultimaBien = Get-Content $registro -Encoding UTF8 | Where-Object { $_ -match '^\S+ \S+  ok\.' } | Select-Object -Last 1
  if (-not $ultimaBien) {
    $problemas += 'La tarea programada no ha conseguido actualizar la copia ninguna vez.'
  } elseif ([datetime]::ParseExact($ultimaBien.Substring(0, 10), 'yyyy-MM-dd', $null) -lt (Get-Date).Date.AddDays(-1)) {
    $problemas += "La última actualización buena es de hace más de un día: $($ultimaBien.Substring(0, 16))."
  }
} else {
  $problemas += 'La tarea programada no se ha ejecutado nunca: no hay registro.'
}

# 2. Lo que hay en GitHub y la copia no tiene. Solo mira; no descarga los cambios.
& git -C $Carpeta fetch --quiet 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  $problemas += 'No se ha podido conectar con GitHub para comparar.'
} else {
  $faltan = [int](& git -C $Carpeta rev-list --count 'HEAD..@{upstream}')
  if ($faltan -gt 0) { $problemas += "En GitHub hay $faltan cambios que la copia todavía no tiene." }
  else { Write-Output 'La copia tiene todo lo que hay en GitHub.' }
}

# 3. Las rutas largas. Los nombres llevan la fecha, el tipo y una descripción (#77): como mucho 116 caracteres.
#    Con la carpeta de la copia delante, Windows no abre una ruta de más de 260. Se avisa antes, a los 250.
$limiteRuta = 250
$largas = @(& git -C $Carpeta -c core.quotepath=off ls-files |
  ForEach-Object { Join-Path $Carpeta ($_ -replace '/', '\') } |
  Where-Object { $_.Length -gt $limiteRuta })
if ($largas.Count -gt 0) {
  $masLarga = ($largas | Measure-Object -Property Length -Maximum).Maximum
  $problemas += "Archivos con una ruta de más de $limiteRuta caracteres: $($largas.Count). La más larga tiene $masLarga. Windows puede no abrirlos: haz la copia en una carpeta más corta, como C:\LibroBelagua. Ver copia\README.md."
}

# 4. Los documentos del índice, uno a uno.
$indice = Join-Path $Carpeta 'indice\documentos.csv'
if (-not (Test-Path $indice)) {
  $problemas += 'No está el índice: indice\documentos.csv.'
} else {
  $documentos = @(Import-Csv -Path $indice -Delimiter ';' -Encoding UTF8)
  $mal = 0
  foreach ($d in $documentos) {
    $ruta = Join-Path $Carpeta ($d.ruta -replace '/', '\')
    # Una ruta demasiado larga ya se ha avisado arriba. Aquí parecería que falta el archivo, y no es eso.
    if ($ruta.Length -ge 260) { $mal++; continue }
    if (-not (Test-Path $ruta)) {
      $problemas += "Falta el archivo de «$($d.titulo)»: $($d.ruta)"; $mal++
    } elseif ((Get-FileHash -Algorithm SHA256 -Path $ruta).Hash.ToLower() -ne $d.sha256) {
      $problemas += "El archivo de «$($d.titulo)» ha cambiado: $($d.ruta)"; $mal++
    }
  }
  Write-Output "Documentos en el índice: $($documentos.Count). Con su archivo y su huella bien: $($documentos.Count - $mal)."
}

Write-Output ''
if ($problemas.Count -eq 0) {
  Write-Output 'Todo bien.'
  exit 0
}
Write-Output 'Hay que mirar esto:'
$problemas | ForEach-Object { Write-Output "  - $_" }
exit 1
