@echo off
echo Apagando FincaMarket...
taskkill /f /im node.exe >nul 2>nul
echo Apagando MySQL de forma segura...
"C:\xampp\mysql\bin\mysqladmin.exe" -u root shutdown
echo Listo. Ya puede apagar el computador.
timeout /t 3 >nul