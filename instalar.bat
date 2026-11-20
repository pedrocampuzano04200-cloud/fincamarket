@echo off
chcp 65001 >nul
title FincaMarket - Instalacion
cd /d "%~dp0"
echo ==============================================
echo   FincaMarket - Instalacion
echo ==============================================
where node >nul 2>nul || (echo [ERROR] Node.js no esta instalado. Descarguelo de https://nodejs.org ^(version LTS^) & pause & exit /b 1)
echo Node.js: & node -v

if not exist backend\.env (
  copy backend\.env.example backend\.env >nul
  echo Se creo backend\.env con la configuracion por defecto de XAMPP.
)

echo.
echo [1/4] Instalando dependencias del backend...
pushd backend & call npm install --omit=dev || (popd & echo [ERROR] Fallo npm install en backend & pause & exit /b 1)
popd
echo [2/4] Instalando dependencias del frontend...
pushd frontend & call npm install || (popd & echo [ERROR] Fallo npm install en frontend & pause & exit /b 1)
echo [3/4] Compilando la interfaz...
call npm run build || (popd & echo [ERROR] Fallo la compilacion & pause & exit /b 1)
popd

echo [4/4] Creando la base de datos (MySQL debe estar iniciado en XAMPP)...
pushd backend & call npm run db:init
popd
echo.
echo Instalacion terminada. Ejecute iniciar.bat para abrir FincaMarket.
pause
