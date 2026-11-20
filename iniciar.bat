@echo off
chcp 65001 >nul
title FincaMarket - Servidor (no cierre esta ventana)
cd /d "%~dp0backend"
if not exist "..\frontend\dist\index.html" (echo Ejecute primero instalar.bat & pause & exit /b 1)
echo Recuerde: MySQL debe estar iniciado en el panel de XAMPP.
start "" http://localhost:3001
node src\server.js
pause
