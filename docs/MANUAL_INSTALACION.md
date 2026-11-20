# Manual de instalación — FincaMarket (Windows)

## 1. Requisitos
| Programa | Versión | Descarga |
|---|---|---|
| XAMPP (incluye MariaDB/MySQL) | 8.x o superior | https://www.apachefriends.org |
| Node.js LTS | 18, 20 o 22 | https://nodejs.org |
| Navegador | Chrome, Edge o Firefox actualizados | — |
| (Opcional) Visual Studio Code | — | https://code.visualstudio.com |

La instalación requiere Internet **solo una vez** (para descargar las dependencias con npm). Después el sistema funciona sin conexión.

## 2. Instalación rápida (recomendada)
1. Instale XAMPP y Node.js con las opciones por defecto.
2. Abra el **Panel de control de XAMPP** y pulse **Start** en **MySQL** (no se necesita Apache).
3. Descomprima la carpeta `fincamarket` en un lugar fijo, por ejemplo `C:\fincamarket`.
4. Doble clic en **`instalar.bat`**. Este programa:
   - crea `backend\.env` a partir de `backend\.env.example`;
   - instala dependencias del backend y del frontend;
   - compila la interfaz;
   - crea la base de datos `fincamarket` con categorías, unidades de medida, los productos de ejemplo y las unidades Los Pinos / Mirador.
5. Doble clic en **`iniciar.bat`**. Se abrirá el navegador en **http://localhost:3001**. Mientras use el sistema, **no cierre la ventana negra** del servidor.

> Si su MySQL de XAMPP tiene contraseña, edite `backend\.env` (`DB_PASSWORD=...`) antes de ejecutar `instalar.bat`, o ejecute luego `cd backend` → `npm run db:init`.

## 3. Instalación manual (paso a paso)
```bat
:: 1. Base de datos (opción A: consola de MySQL de XAMPP)
C:\xampp\mysql\bin\mysql.exe -u root < C:\fincamarket\database\schema.sql
C:\xampp\mysql\bin\mysql.exe -u root fincamarket < C:\fincamarket\database\seed.sql
::    (opción B: phpMyAdmin → Importar → schema.sql y luego seed.sql)
::    (opción C: cd backend && npm run db:init)

:: 2. Backend
cd C:\fincamarket\backend
copy .env.example .env
npm install

:: 3. Frontend
cd ..\frontend
npm install
npm run build

:: 4. Ejecutar
cd ..\backend
npm start
```
Abra http://localhost:3001.

## 4. Variables de entorno (`backend\.env`)
| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | 3001 | Puerto de la aplicación |
| `HOST` | 127.0.0.1 | Use `0.0.0.0` para entrar desde una tableta en la misma red WiFi (`http://IP-DEL-PC:3001`; permita el puerto en el Firewall de Windows) |
| `DB_HOST` / `DB_PORT` | 127.0.0.1 / 3306 | Servidor MySQL |
| `DB_USER` / `DB_PASSWORD` | root / (vacía) | Credenciales |
| `DB_NAME` | fincamarket | Nombre de la base |
| `BACKUP_DIR` | ../backups | Carpeta de copias (relativa a `backend`) |
| `MYSQLDUMP_PATH` / `MYSQL_PATH` | C:\xampp\mysql\bin\… | Programas para respaldar/restaurar |
| `CORS_ORIGIN` | http://localhost:5173 | Solo para modo desarrollo |

## 5. Modo desarrollo (para modificar el código)
Dos terminales en VS Code:
```bat
cd backend && npm run dev        :: API con recarga automática en :3001
cd frontend && npm run dev       :: Interfaz con recarga en http://localhost:5173
```

## 6. Datos de demostración y pruebas (opcional, base de pruebas)
Con el servidor iniciado:
```bat
cd backend
npm run db:demo     :: 8 semanas de pedidos, cierres y pagos de ejemplo
npm test            :: 63 pruebas funcionales de la API
```
⚠️ Ambos comandos crean datos. Para volver a empezar desde cero: `npm run db:init -- --force` (BORRA todo).

## 7. Copias de seguridad
- **Desde la aplicación**: Configuración → *Crear copia ahora*. Se guardan en `fincamarket\backups`. Desde allí también se descargan y se restauran (antes de restaurar se crea automáticamente una copia del estado actual).
- **Con doble clic**: `respaldo.bat`.
- **Automática**: Programador de tareas de Windows → Crear tarea básica → Diaria/Semanal → Iniciar programa → `C:\fincamarket\respaldo.bat`.
- Copie periódicamente la carpeta `backups` a una memoria USB.
- Restauración manual: `C:\xampp\mysql\bin\mysql.exe -u root fincamarket < backups\archivo.sql`

## 8. Solución de problemas
| Síntoma | Solución |
|---|---|
| "Sin conexión a la base de datos" | Inicie MySQL en XAMPP; revise usuario/contraseña en `backend\.env` |
| `'node' no se reconoce…` | Reinstale Node.js y reinicie el computador |
| Puerto 3001 en uso | Cambie `PORT` en `.env` |
| MySQL de XAMPP no inicia (puerto 3306 ocupado) | Cierre otro MySQL instalado, o cambie el puerto en XAMPP y en `DB_PORT` |
| Error al crear copia: "No se encontró el programa" | Corrija `MYSQLDUMP_PATH` y `MYSQL_PATH` en `.env` |
| La interfaz no carga en http://localhost:3001 | Ejecute `instalar.bat` (falta `frontend\dist`) |
