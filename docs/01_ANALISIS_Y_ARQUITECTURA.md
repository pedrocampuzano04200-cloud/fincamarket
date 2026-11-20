# FincaMarket — Análisis de requisitos y arquitectura

## 1. Análisis de requisitos

### Actores
- **Administrador de la finca** (usuario único, en un computador o tableta de la casa). No se implementó inicio de sesión porque el sistema es local y de un solo usuario; la tabla `usuarios` queda como ampliación futura (ver §6).

### Requisitos funcionales (resumen y dónde se cumplen)

| # | Requisito | Implementación |
|---|---|---|
| RF1 | CRUD de productos, cambio de precio, activar/desactivar, búsqueda y filtro por categoría, sin duplicados | `routes/productos.js`, página **Productos**. `UNIQUE(nombre)` + validación previa |
| RF2 | Precio histórico en pedidos | `detalle_pedidos.precio_unitario` se copia al registrar; al editar, las líneas existentes conservan su precio |
| RF3 | Conservar productos con historial | No se borra un producto usado (`ON DELETE RESTRICT`); solo se desactiva |
| RF4 | Unidades residenciales, apartamentos (opcional), compradores, sin duplicados | `unidades_residenciales`, `apartamentos` (numero NULL = "Sin especificar"), `clientes`; claves únicas compuestas |
| RF5 | Registro de pedidos con cálculo automático, edición, cancelación, consultas por fecha / cliente / producto / estado | `routes/pedidos.js`, páginas **Registrar pedido** y **Pedidos** |
| RF6 | Pedidos cancelados fuera de la liquidación | Filtro `estado <> 'CANCELADO'` en `services/liquidacion.js` |
| RF7 | Cierre semanal: agrupar por unidad/apartamento, sumar productos, total por apartamento y total general | `services/liquidacion.js` + `routes/cierres.js`, página **Cierre semanal** |
| RF8 | Liquidación individual, pedidos que la conforman, imprimir, PDF, Excel | `GET /cierres/:id/cuentas/:detalleId`, `/pdf`, `/excel`; `window.print()` con CSS de impresión |
| RF9 | Pagos, saldo pendiente, total recaudado / por cobrar | Tabla `pagos`, vista `v_saldos_cierre` |
| RF10 | Fotografía histórica del cierre y reapertura auditada | Tablas `detalle_cierres` y `detalle_cierre_productos` (snapshot), pedidos bloqueados, `POST /cierres/:id/reabrir` con motivo y registro en `auditoria` |
| RF11 | Dashboard con KPIs, 6 gráficos, 4 tablas y filtros | `routes/dashboard.js`, página **Dashboard** (Recharts) |
| RF12 | Historial completo | `routes/historial.js`, página **Historial** |
| RF13 | Copias de seguridad y restauración | `routes/backups.js` (mysqldump / mysql), página **Configuración**, `respaldo.bat` |

### Requisitos no funcionales
- 100 % local (Windows + XAMPP), sin servicios en la nube.
- Validación en frontend **y** backend (esquemas `zod`).
- Consultas parametrizadas (mysql2 `?`) → sin inyección SQL.
- Transacciones (`withTransaction`) en: crear/editar/cancelar pedidos, cierre, reapertura, pagos, cambios de precio.
- Manejo centralizado de errores (`middleware/errorHandler.js`) con mensajes en español.
- Interfaz responsive (computador y tableta).

### Reglas de negocio clave
1. **Subtotal** = cantidad × precio unitario (columna generada en BD); **total del pedido** = suma de subtotales (vista `v_pedidos_totales`).
2. Productos por unidad, atado, bolsa, manojo o docena solo aceptan cantidades enteras; kg y lb aceptan decimales (`unidades_medida.permite_decimales`).
3. Un mismo producto repetido en un pedido se consolida en una sola línea.
4. **Pedidos duplicados**: (a) clave de idempotencia por formulario — si se pulsa dos veces "Registrar", se crea un solo pedido; (b) si ya existe un pedido idéntico (mismo apartamento, fecha y productos) el sistema pregunta antes de registrarlo.
5. Un pedido incluido en un cierre **CERRADO** no se puede editar, cancelar ni reactivar, y no se pueden crear pedidos con fecha dentro de un período cerrado.
6. Dos cierres CERRADOS no pueden superponer fechas.
7. Para reabrir un cierre no debe tener pagos activos (los pagos se **anulan**, nunca se borran). Al reabrir, el cierre se conserva como `REABIERTO` (historial) y sus pedidos quedan libres para corregirlos y volver a cerrar.
8. No se aceptan pagos mayores al saldo.

## 2. Arquitectura

```
┌────────────────────────┐   HTTP/JSON    ┌──────────────────────────┐   SQL (mysql2)   ┌─────────────────┐
│ Frontend React (Vite)  │ ─────────────▶ │ Backend Node.js/Express  │ ───────────────▶ │ MariaDB / MySQL │
│ frontend/src           │ ◀───────────── │ API REST  /api/*         │ ◀─────────────── │ (XAMPP)         │
│ Recharts, React Router │                │ zod, pdfkit, exceljs     │                  │ BD: fincamarket │
└────────────────────────┘                └──────────────────────────┘                  └─────────────────┘
        ▲  En producción el backend sirve frontend/dist → una sola dirección: http://localhost:3001
```

- **Capas del backend**: `routes/` (controladores + validación) → `services/` (cálculo de liquidación, PDF, Excel) → `config/db.js` (pool y transacciones). Utilidades en `utils/`, middlewares en `middleware/`.
- **Frontend**: páginas en `src/pages`, componentes reutilizables en `src/components` (modales, confirmaciones, notificaciones, selectores), cliente HTTP en `src/api.js`.

### Justificación de decisiones
| Decisión | Motivo |
|---|---|
| **Vite** como empaquetador de React | Arranque y compilación rápidos; reemplaza a Create React App (descontinuado). |
| **zod** para validación | Esquemas declarativos con mensajes en español; un solo lugar por endpoint. |
| **PDF y Excel generados en el backend** (pdfkit, exceljs) | Mismo formato desde cualquier pantalla y desde la tableta; no depende del navegador. |
| **Express 5** | Captura automáticamente errores de funciones `async` → manejo centralizado sin código repetido. |
| **Backend sirve el frontend compilado** | El usuario solo inicia un programa y abre una dirección. |
| **Snapshot en `detalle_cierres*`** (desnormalización controlada) | Requisito explícito de "fotografía histórica": aunque cambien nombres o precios, la liquidación cerrada no cambia. Es la única excepción intencional a la 3FN. |
| **Totales derivados en vistas** | El total del pedido no se almacena (evita inconsistencias); el subtotal es columna generada. |
| Tabla **`unidades_medida`** y **`auditoria`** y **`configuracion`** (no pedidas explícitamente) | Normalizar unidades de medida (3FN); registrar modificaciones importantes (requisito §13); guardar nombre de la finca/mensaje para las cuentas de cobro. |

## 3. API REST (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor y la BD |
| GET/POST/PUT/DELETE | `/api/categorias[/:id]` | Categorías |
| GET/POST/PUT | `/api/unidades-medida[/:id]` | Unidades de medida |
| GET | `/api/productos?q&categoria_id&activo` | Listar/buscar productos |
| GET/POST/PUT/DELETE | `/api/productos[/:id]` | CRUD (DELETE solo sin historial) |
| PATCH | `/api/productos/:id/precio` · `/estado` | Cambiar precio · activar/desactivar |
| GET/POST/PUT | `/api/unidades[/:id]` | Unidades residenciales |
| GET/POST/PUT | `/api/apartamentos[/:id]?unidad_id&numero&q` | Apartamentos |
| GET/POST/PUT | `/api/clientes[/:id]?unidad_id&apartamento_id&apartamento&q` | Compradores |
| GET | `/api/pedidos?desde&hasta&estado&unidad_id&apartamento_id&cliente_id&producto_id&q&page&limit` | Consultar pedidos |
| GET/POST/PUT | `/api/pedidos[/:id]` | Ver / registrar / editar |
| PATCH | `/api/pedidos/:id/estado` | Cambiar estado / cancelar (motivo obligatorio) |
| GET | `/api/cierres/preview?desde&hasta` | Vista previa de la liquidación |
| GET/POST | `/api/cierres[/:id]` | Listar / generar / consultar cierre |
| POST | `/api/cierres/:id/reabrir` | Reabrir con motivo |
| GET | `/api/cierres/:id/cuentas/:detalleId` | Cuenta individual + pedidos + pagos |
| GET | `/api/cierres/:id/pdf[?detalle=]` · `/excel` | Exportar |
| GET/POST | `/api/pagos` · POST `/api/pagos/:id/anular` | Pagos |
| GET | `/api/dashboard?desde&hasta&producto_id&unidad_id&apartamento_id` | Dashboard |
| GET | `/api/historial/ventas-semanales` · `/productos` · `/apartamentos` · `/saldos` | Historial |
| GET | `/api/reportes/ventas.xlsx` · `/ventas.pdf` | Reportes |
| GET/PUT | `/api/configuracion` · GET `/api/auditoria` | Configuración y auditoría |
| GET/POST | `/api/backups` · GET `/api/backups/:nombre` · POST `/api/backups/:nombre/restaurar` | Respaldos |

Los errores responden con `{ "error": "mensaje", "code": "CODIGO" }` y el código HTTP adecuado (400 validación, 404, 409 conflicto/duplicado, 503 sin base de datos).

## 4. Estructura de carpetas

```
fincamarket/
├── README.md
├── instalar.bat · iniciar.bat · respaldo.bat     (Windows)
├── database/   schema.sql · seed.sql · DIAGRAMA_ER.md · DICCIONARIO_DATOS.md
├── backend/
│   ├── .env.example · package.json
│   ├── scripts/  init-db.js · demo-data.js · test-api.js
│   └── src/
│       ├── server.js · app.js
│       ├── config/db.js
│       ├── middleware/  errorHandler.js · validate.js
│       ├── utils/helpers.js
│       ├── services/  liquidacion.js · pdf.js · excel.js
│       └── routes/  productos · clientes · pedidos · cierres · pagos · dashboard · historial · configuracion · backups
├── frontend/
│   ├── index.html · vite.config.js · package.json
│   └── src/  main.jsx · api.js · utils.js · styles.css
│       ├── components/  Layout.jsx · ui.jsx · selectors.jsx
│       └── pages/  Dashboard · RegistrarPedido · Pedidos · Productos · Unidades · Cierre · CierreDetalle · Historial · Reportes · Configuracion
├── backups/    (se crea automáticamente)
└── docs/       01_ANALISIS_Y_ARQUITECTURA.md · MANUAL_INSTALACION.md · MANUAL_USUARIO.md
```

## 5. Pruebas (Fase 8)
`backend/scripts/test-api.js` ejecuta 63 pruebas de punta a punta contra la API y una base MariaDB real: duplicados, validaciones, precio histórico, consolidación de productos, idempotencia, detección de duplicados, liquidación del ejemplo del enunciado (Apto 101 = $35.000, total semana = $117.000), bloqueo de pedidos cerrados, sobrepagos, anulación, reapertura y nuevo cierre, PDF/Excel, dashboard, historial y copia de seguridad. Resultado: **63 correctas, 0 fallidas**.

## 6. Ampliaciones posibles
- Autenticación con tabla `usuarios` (bcrypt + sesión) si varias personas usan el sistema.
- Envío de la cuenta de cobro por WhatsApp (requiere Internet).
- Inventario/cosecha disponible por producto.
- Respaldo automático programado con el Programador de tareas de Windows usando `respaldo.bat`.
