# Diagrama entidad-relación — FincaMarket

> Se visualiza en VS Code con la extensión "Markdown Preview Mermaid Support", o pegando el bloque en https://mermaid.live

```mermaid
erDiagram
    unidades_residenciales ||--o{ apartamentos : "contiene"
    apartamentos ||--o{ clientes : "tiene compradores"
    apartamentos ||--o{ pedidos : "realiza"
    clientes |o--o{ pedidos : "solicita (opcional)"
    categorias_productos ||--o{ productos : "clasifica"
    unidades_medida ||--o{ productos : "se vende en"
    unidades_medida ||--o{ detalle_pedidos : "unidad histórica"
    pedidos ||--|{ detalle_pedidos : "incluye"
    productos ||--o{ detalle_pedidos : "pedido en"
    cierres_semanales |o--o{ pedidos : "liquida"
    cierres_semanales ||--|{ detalle_cierres : "cuenta por apartamento"
    apartamentos ||--o{ detalle_cierres : "se cobra a"
    detalle_cierres ||--|{ detalle_cierre_productos : "detalle"
    productos ||--o{ detalle_cierre_productos : "referencia"
    detalle_cierres ||--o{ pagos : "recibe"

    unidades_residenciales { int id PK  varchar nombre UK  varchar direccion  bool activo }
    apartamentos { int id PK  int unidad_id FK  varchar numero "NULL=Sin especificar"  bool activo }
    clientes { int id PK  int apartamento_id FK  varchar nombre  varchar telefono }
    categorias_productos { int id PK  varchar nombre UK }
    unidades_medida { int id PK  varchar nombre UK  varchar abreviatura  bool permite_decimales }
    productos { int id PK  varchar nombre UK  int categoria_id FK  int unidad_medida_id FK  decimal precio  bool activo  datetime created_at }
    pedidos { int id PK  varchar numero UK  char clave_idempotencia UK  date fecha  int apartamento_id FK  int cliente_id FK  enum estado  int cierre_id FK }
    detalle_pedidos { int id PK  int pedido_id FK  int producto_id FK  int unidad_medida_id FK  decimal cantidad  decimal precio_unitario  decimal subtotal "generada" }
    cierres_semanales { int id PK  varchar codigo UK  date fecha_inicio  date fecha_fin  enum estado  decimal total_general }
    detalle_cierres { int id PK  int cierre_id FK  int apartamento_id FK  varchar unidad_nombre "snapshot"  varchar apartamento_numero "snapshot"  decimal total }
    detalle_cierre_productos { int id PK  int detalle_cierre_id FK  int producto_id FK  varchar producto_nombre "snapshot"  decimal cantidad  decimal precio_unitario  decimal total }
    pagos { int id PK  int detalle_cierre_id FK  date fecha  decimal monto  enum metodo  bool anulado }
    auditoria { bigint id PK  varchar entidad  int entidad_id  varchar accion  longtext detalle  varchar motivo }
    configuracion { varchar clave PK  varchar valor }
```

**Vistas**: `v_pedidos_totales` (total e ítems por pedido) y `v_saldos_cierre` (total, pagado y saldo por cuenta de cobro).
