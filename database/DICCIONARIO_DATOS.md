# Diccionario de datos — FincaMarket

Motor: MariaDB 10.4+ / MySQL 8.0+ · Charset `utf8mb4` · Collation `utf8mb4_unicode_ci` (las comparaciones de nombres no distinguen mayúsculas ni tildes, lo que evita duplicados como "Tomate"/"tomate").
Convenciones: **PK** clave primaria · **FK** clave foránea · **UK** único · **Req.** obligatorio.

## unidades_residenciales
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | Identificador |
| nombre | VARCHAR(120) | Sí · UK | Nombre del conjunto o edificio |
| direccion | VARCHAR(200) | No | Dirección |
| observaciones | VARCHAR(500) | No | Notas |
| activo | TINYINT(1) | Sí (1) | 1 activa, 0 inactiva |
| created_at | DATETIME | Sí | Fecha de registro |

## apartamentos
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | Identificador (distingue aptos iguales en unidades distintas) |
| unidad_id | INT UNSIGNED | Sí · FK → unidades_residenciales | Unidad a la que pertenece (RESTRICT) |
| numero | VARCHAR(20) | No | Número/torre; **NULL = "Sin especificar"** |
| numero_clave | VARCHAR(20) generada | — | `COALESCE(numero,'')`; permite UK con NULL |
| observaciones, activo, created_at | | | Igual que arriba |
Restricciones: UK `(unidad_id, numero_clave)`; índice `numero`.

## clientes
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | ID del cliente |
| apartamento_id | INT UNSIGNED | Sí · FK → apartamentos | Apartamento del comprador |
| nombre | VARCHAR(120) | No | Comprador o responsable |
| nombre_clave | VARCHAR(120) generada | — | Para UK con NULL |
| telefono | VARCHAR(30) | No | Contacto (validado: 7–30 dígitos/símbolos) |
| observaciones, activo, created_at | | | |
Restricciones: UK `(apartamento_id, nombre_clave)`.

## categorias_productos
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | |
| nombre | VARCHAR(60) | Sí · UK | Hortalizas, Legumbres… |
| descripcion | VARCHAR(255) | No | |

## unidades_medida
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | |
| nombre | VARCHAR(40) | Sí · UK | Kilogramo, Libra, Unidad, Atado, Bolsa, Manojo, Docena |
| abreviatura | VARCHAR(10) | Sí | kg, lb, und… |
| permite_decimales | TINYINT(1) | Sí | 1 = admite 1,5; 0 = solo enteros |

## productos
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | ID del producto |
| nombre | VARCHAR(100) | Sí · UK | Nombre (sin duplicados) |
| categoria_id | INT UNSIGNED | Sí · FK | Categoría |
| unidad_medida_id | INT UNSIGNED | Sí · FK | Unidad de venta |
| descripcion | VARCHAR(500) | No | |
| precio | DECIMAL(12,2) | Sí · CHECK ≥ 0 | Precio **vigente** |
| activo | TINYINT(1) | Sí (1) | Estado |
| created_at / updated_at | DATETIME | Sí | Fechas de creación / modificación |

## pedidos
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | |
| numero | VARCHAR(20) | UK | Número visible `P-000001` |
| clave_idempotencia | CHAR(36) | UK | UUID del formulario; evita doble registro |
| fecha | DATE | Sí | Día del pedido |
| apartamento_id | INT UNSIGNED | Sí · FK | Unidad + apartamento (o "Sin especificar") |
| cliente_id | INT UNSIGNED | No · FK (SET NULL) | Comprador, si se conoce |
| estado | ENUM | Sí | PENDIENTE, CONFIRMADO, ENTREGADO, CANCELADO |
| observaciones | VARCHAR(500) | No | |
| motivo_cancelacion | VARCHAR(500) | No | Obligatorio al cancelar |
| cierre_id | INT UNSIGNED | No · FK | Cierre que lo liquidó (bloquea edición si está CERRADO) |
| created_at / updated_at | DATETIME | Sí | |
Índices: `fecha`, `estado`, `(fecha, estado)`.

## detalle_pedidos
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | |
| pedido_id | INT UNSIGNED | Sí · FK (CASCADE) | |
| producto_id | INT UNSIGNED | Sí · FK (RESTRICT) | |
| unidad_medida_id | INT UNSIGNED | Sí · FK | Unidad vigente al momento del pedido |
| cantidad | DECIMAL(10,3) | Sí · CHECK > 0 | |
| precio_unitario | DECIMAL(12,2) | Sí · CHECK ≥ 0 | **Precio histórico congelado** |
| subtotal | DECIMAL(14,2) generada | — | `ROUND(cantidad × precio_unitario, 2)` |
Restricciones: UK `(pedido_id, producto_id)`.

## cierres_semanales
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | |
| codigo | VARCHAR(20) | Sí · UK | `C-2026-0001` |
| fecha_inicio / fecha_fin | DATE | Sí · CHECK fin ≥ inicio | Período liquidado |
| estado | ENUM | Sí | CERRADO o REABIERTO |
| total_general | DECIMAL(14,2) | Sí | Total de la semana (snapshot) |
| total_pedidos | INT UNSIGNED | Sí | Pedidos incluidos |
| observaciones | VARCHAR(500) | No | |
| created_at, reabierto_at | DATETIME | | |
| motivo_reapertura | VARCHAR(500) | No | |

## detalle_cierres (cuenta de cobro por apartamento — snapshot)
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | |
| cierre_id | INT UNSIGNED | Sí · FK (CASCADE) | |
| apartamento_id | INT UNSIGNED | Sí · FK | |
| unidad_nombre | VARCHAR(120) | Sí | Nombre al momento del cierre |
| apartamento_numero | VARCHAR(20) | No | Número al momento del cierre |
| clientes_nombres | VARCHAR(300) | No | Compradores del período |
| cantidad_pedidos | INT UNSIGNED | Sí | |
| total | DECIMAL(14,2) | Sí | Valor a pagar |
Restricciones: UK `(cierre_id, apartamento_id)`.

## detalle_cierre_productos (snapshot)
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | |
| detalle_cierre_id | INT UNSIGNED | Sí · FK (CASCADE) | |
| producto_id | INT UNSIGNED | Sí · FK | |
| producto_nombre | VARCHAR(100) | Sí | |
| unidad_medida | VARCHAR(40) | Sí | Abreviatura |
| cantidad | DECIMAL(12,3) | Sí | Suma de la semana |
| precio_unitario | DECIMAL(12,2) | Sí | Si el precio cambió durante la semana aparecen líneas separadas |
| total | DECIMAL(14,2) | Sí | |

## pagos
| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| id | INT UNSIGNED AI | PK | |
| detalle_cierre_id | INT UNSIGNED | Sí · FK (RESTRICT) | Cuenta de cobro |
| fecha | DATE | Sí | |
| monto | DECIMAL(14,2) | Sí · CHECK > 0 | No puede superar el saldo (validado) |
| metodo | ENUM | Sí | EFECTIVO, TRANSFERENCIA, NEQUI, DAVIPLATA, OTRO |
| referencia | VARCHAR(80) | No | |
| observaciones | VARCHAR(500) | No | |
| anulado | TINYINT(1) | Sí (0) | Los pagos no se borran, se anulan |
| motivo_anulacion | VARCHAR(500) | No | |
| created_at | DATETIME | Sí | |

## auditoria
| Campo | Tipo | Descripción |
|---|---|---|
| id | BIGINT AI PK | |
| entidad | VARCHAR(40) | pedido, producto, cierre, pago, cliente… |
| entidad_id | INT UNSIGNED | Registro afectado |
| accion | VARCHAR(40) | CREAR, EDITAR, CAMBIO_PRECIO, CANCELAR, CERRAR, REABRIR, ANULAR, RESTAURAR… |
| detalle | LONGTEXT (JSON) | Valores antes/después |
| motivo | VARCHAR(500) | Motivo indicado por el usuario |
| created_at | DATETIME | |

## configuracion
| Campo | Tipo | Descripción |
|---|---|---|
| clave | VARCHAR(60) PK | nombre_finca, nit_finca, telefono_finca, mensaje_cuenta_cobro |
| valor | VARCHAR(500) | |

## Vistas
- **v_pedidos_totales**: `pedido_id, total, items`.
- **v_saldos_cierre**: `detalle_cierre_id, cierre_id, apartamento_id, total, pagado (sin anulados), saldo`.
