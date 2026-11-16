# Actualiza la copia de este repositorio en el ordenador de la oficina.
#
# La lanza cada mañana la tarea programada (ver instalar-tarea.ps1). También se puede lanzar a mano:
#   powershell -ExecutionPolicy Bypass -File copia\actualizar.ps1
#
# Solo descarga. Nunca cambia ni borra nada en GitHub.
# Cada vez apunta el resultado en .git\copia-registro.txt, dentro de la copia. Git no lo sube.

param(
  # La carpeta de la copia. Por defecto, la que contiene a este script.
  [string]$Carpeta = (Split-Path -Parent $PSScriptRoot)
)

$registro = Join-Path $Carpeta '.git\copia-registro.txt'
function Apuntar([string]$texto) {
  $linea = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $texto
  Add-Content -Path $registro -Value $linea -Encoding UTF8
  Write-Output $linea
}

if (-not (Test-Path (Join-Path $Carpeta '.git'))) {
  Write-Output "No hay una copia de Git en $Carpeta"
  exit 1
}

# --ff-only: si la copia tuviera cambios propios, no los mezcla; para y lo dice.
$salida = & git -C $Carpeta pull --ff-only 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  Apuntar ("FALLO al actualizar: " + ($salida -replace '\s+', ' ').Trim())
  exit 1
}

$ultimo = (& git -C $Carpeta log -1 --format='%cd %s' --date=format:'%Y-%m-%d %H:%M').Trim()
Apuntar "ok. Último cambio: $ultimo"
exit 0
