# La copia de la oficina

El ordenador de la oficina guarda una copia completa de este repositorio: los documentos, las fotos, las firmas y el índice. Sirve para consultar el archivo sin Internet y para tenerlo custodiado en otro sitio.

Cada mañana, una tarea programada de Windows descarga lo nuevo. Antes, de madrugada, Supabase ha actualizado el índice. Así, por la mañana la copia tiene los archivos y el índice del día anterior.

| Archivo | Qué hace |
|---|---|
| `actualizar.ps1` | Descarga lo nuevo de GitHub. Lo lanza la tarea programada |
| `instalar-tarea.ps1` | Crea la tarea programada. Se ejecuta una sola vez |
| `comprobar.ps1` | Dice si la copia está al día y si los archivos están bien |

Ninguno de los tres cambia ni borra nada en GitHub. Solo descargan o miran.

## Prepararla, una sola vez

1. **Instala Git para Windows** desde [git-scm.com](https://git-scm.com/download/win). Deja las opciones que trae.
2. **Una cuenta de GitHub con permiso de lectura** en este repositorio, y nada más. No hace falta que pueda escribir.
3. **Haz la copia en una carpeta de nombre corto**, `C:\LibroBelagua`. Abre PowerShell y escribe:

   ```powershell
   git clone -c core.longpaths=true https://github.com/<organizacion>/<repositorio>.git C:\LibroBelagua
   ```

   La primera vez se abre una ventana para entrar en GitHub. Windows recuerda la sesión, así que la tarea programada ya no la pide.

   **Por qué una carpeta corta.** Windows no abre un archivo cuya ruta completa pase de 260 caracteres. Los nombres de los archivos llevan la fecha, el tipo y una descripción, y pueden ocupar 116. Dentro de `Documentos`, y sobre todo si `Documentos` está en OneDrive, la carpeta puede ocupar más de 120, y la ruta se pasa. En `C:\LibroBelagua` sobra sitio. `core.longpaths=true` deja que Git descargue igualmente un archivo con una ruta larga.
4. **Crea la tarea programada**, desde la carpeta de la copia:

   ```powershell
   cd C:\LibroBelagua
   powershell -ExecutionPolicy Bypass -File copia\instalar-tarea.ps1
   ```

   Queda creada «Libro del Edificio - copia», cada día a las 7:00. Si el ordenador está apagado a esa hora, se lanza al encenderlo. Para otra hora: `-Hora 08:30`.
5. **Pruébala ya**, sin esperar a mañana:

   ```powershell
   Start-ScheduledTask -TaskName 'Libro del Edificio - copia'
   ```

   Y después, el paso siguiente.

## Comprobar que está al día

Desde la carpeta de la copia:

```powershell
powershell -ExecutionPolicy Bypass -File copia\comprobar.ps1
```

Mira cuatro cosas:

1. **Cuándo se actualizó** por última vez. Avisa si la última vez que fue bien es de hace más de un día.
2. **Si en GitHub hay algo** que la copia todavía no tiene.
3. **Si alguna ruta pasa de 250 caracteres.** Windows no abre las de más de 260.
4. **Cada documento del índice:** que su archivo está y que su huella coincide con la columna `sha256`. Si un archivo se ha borrado o ha cambiado, lo dice.

Al final dice «Todo bien» o la lista de lo que hay que mirar.

Cada vez que se actualiza, la tarea apunta el resultado en `.git\copia-registro.txt`, una línea por día. Git no lo sube. También se ve en el **Programador de tareas** de Windows, en la columna «Resultado de la última ejecución»: `0x0` es que fue bien.

## Si algo falla

| Qué dice | Qué hacer |
|---|---|
| «No se ha podido conectar con GitHub» | Mira la conexión a Internet. Si hay conexión, la sesión de GitHub ha caducado: lanza `git pull` a mano en la carpeta y entra otra vez |
| «FALLO al actualizar» en el registro | Lo mismo. Si dice algo de cambios locales, alguien ha tocado un archivo de la copia: no lo hagas, esta carpeta solo se lee |
| «El archivo de … ha cambiado» | Alguien lo ha abierto y guardado encima. Vuelve a dejarlo como en GitHub: `git checkout -- <ruta>` |
| «En GitHub hay N cambios que la copia todavía no tiene» | Lanza la tarea a mano, como en el paso 5 |
| «Archivos con una ruta de más de 250 caracteres» | La copia está en una carpeta de nombre largo. Haz otra en `C:\LibroBelagua`, como en el paso 3, y vuelve a crear la tarea desde allí, como en el paso 4. Comprueba la nueva y después borra la vieja |
