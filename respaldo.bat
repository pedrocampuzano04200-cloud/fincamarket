@echo off
chcp 65001 >nul
REM Copia de seguridad manual o programada (Programador de tareas de Windows).
REM Ajuste MYSQLDUMP y las credenciales si no usa XAMPP con root sin clave.
cd /d "%~dp0"
set MYSQLDUMP=C:\xampp\mysql\bin\mysqldump.exe
set DB_USER=root
set DB_NAME=fincamarket
if not exist backups mkdir backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
"%MYSQLDUMP%" -u %DB_USER% --single-transaction --routines --triggers --add-drop-table %DB_NAME% > "backups\fincamarket_%TS%.sql"
if errorlevel 1 (echo [ERROR] No se pudo crear la copia. & pause & exit /b 1)
echo Copia creada: backups\fincamarket_%TS%.sql
