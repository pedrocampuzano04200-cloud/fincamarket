# 🌱 FincaMarket

Sistema local de gestión de pedidos, ventas y liquidación semanal de productos agrícolas para unidades residenciales y apartamentos.

**Stack:** React 18 + Vite + Recharts · Node.js + Express 5 (API REST) · MariaDB/MySQL (XAMPP) · PDF (pdfkit) · Excel (exceljs)

## Inicio rápido (Windows)
1. Instale **XAMPP** y **Node.js LTS**. En XAMPP inicie **MySQL**.
2. Doble clic en **`instalar.bat`** (solo la primera vez).
3. Doble clic en **`iniciar.bat`** → se abre http://localhost:3001

## Documentación
| Documento | Contenido |
|---|---|
| [docs/01_ANALISIS_Y_ARQUITECTURA.md](docs/01_ANALISIS_Y_ARQUITECTURA.md) | Requisitos, arquitectura, decisiones técnicas, API REST, pruebas |
| [database/DIAGRAMA_ER.md](database/DIAGRAMA_ER.md) | Diagrama entidad-relación (Mermaid) |
| [database/DICCIONARIO_DATOS.md](database/DICCIONARIO_DATOS.md) | Diccionario de datos |
| [database/schema.sql](database/schema.sql) · [seed.sql](database/seed.sql) | Script SQL de creación y datos iniciales |
| [docs/MANUAL_INSTALACION.md](docs/MANUAL_INSTALACION.md) | Instalación, variables de entorno, respaldos, problemas frecuentes |
| [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md) | Uso de cada módulo |

## Comandos útiles (carpeta `backend`)
| Comando | Acción |
|---|---|
| `npm start` | Inicia el servidor (sirve API e interfaz) |
| `npm run dev` | Servidor con recarga automática |
| `npm run db:init` | Crea la base de datos (no borra si hay pedidos; `-- --force` para borrar) |
| `npm run db:demo` | Carga 8 semanas de datos de demostración (servidor iniciado) |
| `npm test` | 63 pruebas funcionales de la API (usar en base de pruebas) |
