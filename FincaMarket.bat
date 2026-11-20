@echo off
title FincaMarket - NO CERRAR esta ventana mientras usa el sistema
cd /d "%~dp0"

netstat -ano | findstr ":3306" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo Encendiendo MySQL...
  start "MySQL" /min "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone
  timeout /t 6 /nobreak >nul
) else (
  echo MySQL ya estaba encendido.
)

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3001"
cd backend
node src\server.js
pause