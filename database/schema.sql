-- =====================================================================
-- FincaMarket - Script de creación de base de datos
-- Motor: MariaDB 10.4+ / MySQL 8.0+   Charset: utf8mb4
-- Ruta: database/schema.sql
-- Ejecutar:  mysql -u root -p < database/schema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS fincamarket
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fincamarket;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS pagos;
DROP TABLE IF EXISTS detalle_cierre_productos;
DROP TABLE IF EXISTS detalle_cierres;
DROP TABLE IF EXISTS detalle_pedidos;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS cierres_semanales;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS unidades_medida;
DROP TABLE IF EXISTS categorias_productos;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS apartamentos;
DROP TABLE IF EXISTS unidades_residenciales;
DROP TABLE IF EXISTS configuracion;
DROP VIEW IF EXISTS v_pedidos_totales;
DROP VIEW IF EXISTS v_saldos_cierre;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. Unidades residenciales / edificios
-- ---------------------------------------------------------------------
CREATE TABLE unidades_residenciales (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  direccion      VARCHAR(200) NULL,
  observaciones  VARCHAR(500) NULL,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_unidad_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. Apartamentos (numero NULL = "Sin especificar")
--    numero_clave permite UNIQUE incluso cuando numero es NULL.
-- ---------------------------------------------------------------------
CREATE TABLE apartamentos (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unidad_id      INT UNSIGNED NOT NULL,
  numero         VARCHAR(20)  NULL,
  numero_clave   VARCHAR(20)  AS (COALESCE(numero, '')) STORED,
  observaciones  VARCHAR(500) NULL,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_apto_unidad FOREIGN KEY (unidad_id)
    REFERENCES unidades_residenciales(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT uq_apto UNIQUE (unidad_id, numero_clave),
  INDEX ix_apto_numero (numero)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. Clientes (compradores / responsables de un apartamento)
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  apartamento_id  INT UNSIGNED NOT NULL,
  nombre          VARCHAR(120) NULL,
  nombre_clave    VARCHAR(120) AS (COALESCE(nombre, '')) STORED,
  telefono        VARCHAR(30)  NULL,
  observaciones   VARCHAR(500) NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cliente_apto FOREIGN KEY (apartamento_id)
    REFERENCES apartamentos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT uq_cliente UNIQUE (apartamento_id, nombre_clave),
  INDEX ix_cliente_nombre (nombre)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. Catálogos de productos
-- ---------------------------------------------------------------------
CREATE TABLE categorias_productos (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(60)  NOT NULL,
  descripcion  VARCHAR(255) NULL,
  CONSTRAINT uq_categoria UNIQUE (nombre)
) ENGINE=InnoDB;

CREATE TABLE unidades_medida (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre             VARCHAR(40) NOT NULL,
  abreviatura        VARCHAR(10) NOT NULL,
  permite_decimales  TINYINT(1)  NOT NULL DEFAULT 0,
  CONSTRAINT uq_um_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

CREATE TABLE productos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(100)  NOT NULL,
  categoria_id      INT UNSIGNED  NOT NULL,
  unidad_medida_id  INT UNSIGNED  NOT NULL,
  descripcion       VARCHAR(500)  NULL,
  precio            DECIMAL(12,2) NOT NULL,
  activo            TINYINT(1)    NOT NULL DEFAULT 1,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_producto_nombre UNIQUE (nombre),
  CONSTRAINT ck_producto_precio CHECK (precio >= 0),
  CONSTRAINT fk_prod_cat FOREIGN KEY (categoria_id)
    REFERENCES categorias_productos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_prod_um FOREIGN KEY (unidad_medida_id)
    REFERENCES unidades_medida(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX ix_prod_activo (activo)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. Cierres semanales (fotografía histórica de la liquidación)
-- ---------------------------------------------------------------------
CREATE TABLE cierres_semanales (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo             VARCHAR(20)   NOT NULL,
  fecha_inicio       DATE          NOT NULL,
  fecha_fin          DATE          NOT NULL,
  estado             ENUM('CERRADO','REABIERTO') NOT NULL DEFAULT 'CERRADO',
  total_general      DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_pedidos      INT UNSIGNED  NOT NULL DEFAULT 0,
  observaciones      VARCHAR(500)  NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reabierto_at       DATETIME      NULL,
  motivo_reapertura  VARCHAR(500)  NULL,
  CONSTRAINT uq_cierre_codigo UNIQUE (codigo),
  CONSTRAINT ck_cierre_fechas CHECK (fecha_fin >= fecha_inicio),
  INDEX ix_cierre_fechas (fecha_inicio, fecha_fin),
  INDEX ix_cierre_estado (estado)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. Pedidos y su detalle
-- ---------------------------------------------------------------------
CREATE TABLE pedidos (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero              VARCHAR(20)  NULL,
  clave_idempotencia  CHAR(36)     NULL,
  fecha               DATE         NOT NULL,
  apartamento_id      INT UNSIGNED NOT NULL,
  cliente_id          INT UNSIGNED NULL,
  estado              ENUM('PENDIENTE','CONFIRMADO','ENTREGADO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  observaciones       VARCHAR(500) NULL,
  motivo_cancelacion  VARCHAR(500) NULL,
  cierre_id           INT UNSIGNED NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_pedido_numero UNIQUE (numero),
  CONSTRAINT uq_pedido_idem UNIQUE (clave_idempotencia),
  CONSTRAINT fk_ped_apto FOREIGN KEY (apartamento_id)
    REFERENCES apartamentos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_ped_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_ped_cierre FOREIGN KEY (cierre_id)
    REFERENCES cierres_semanales(id) ON UPDATE CASCADE ON DELETE SET NULL,
  INDEX ix_ped_fecha (fecha),
  INDEX ix_ped_estado (estado),
  INDEX ix_ped_fecha_estado (fecha, estado)
) ENGINE=InnoDB;

CREATE TABLE detalle_pedidos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id         INT UNSIGNED  NOT NULL,
  producto_id       INT UNSIGNED  NOT NULL,
  unidad_medida_id  INT UNSIGNED  NOT NULL,      -- unidad vigente al momento del pedido
  cantidad          DECIMAL(10,3) NOT NULL,
  precio_unitario   DECIMAL(12,2) NOT NULL,      -- PRECIO HISTÓRICO congelado
  subtotal          DECIMAL(14,2) AS (ROUND(cantidad * precio_unitario, 2)) STORED,
  CONSTRAINT uq_det_producto UNIQUE (pedido_id, producto_id),
  CONSTRAINT ck_det_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_det_precio CHECK (precio_unitario >= 0),
  CONSTRAINT fk_det_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_det_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_det_um FOREIGN KEY (unidad_medida_id)
    REFERENCES unidades_medida(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX ix_det_producto (producto_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. Detalle de cierres (cuenta de cobro por apartamento) - snapshot
-- ---------------------------------------------------------------------
CREATE TABLE detalle_cierres (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cierre_id           INT UNSIGNED  NOT NULL,
  apartamento_id      INT UNSIGNED  NOT NULL,
  unidad_nombre       VARCHAR(120)  NOT NULL,   -- snapshot
  apartamento_numero  VARCHAR(20)   NULL,       -- snapshot
  clientes_nombres    VARCHAR(300)  NULL,       -- snapshot
  cantidad_pedidos    INT UNSIGNED  NOT NULL DEFAULT 0,
  total               DECIMAL(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT uq_detcierre UNIQUE (cierre_id, apartamento_id),
  CONSTRAINT fk_dc_cierre FOREIGN KEY (cierre_id)
    REFERENCES cierres_semanales(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_dc_apto FOREIGN KEY (apartamento_id)
    REFERENCES apartamentos(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE detalle_cierre_productos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  detalle_cierre_id  INT UNSIGNED  NOT NULL,
  producto_id        INT UNSIGNED  NOT NULL,
  producto_nombre    VARCHAR(100)  NOT NULL,    -- snapshot
  unidad_medida      VARCHAR(40)   NOT NULL,    -- snapshot
  cantidad           DECIMAL(12,3) NOT NULL,
  precio_unitario    DECIMAL(12,2) NOT NULL,
  total              DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_dcp_dc FOREIGN KEY (detalle_cierre_id)
    REFERENCES detalle_cierres(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_dcp_prod FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX ix_dcp_prod (producto_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. Pagos (abonos a una cuenta de cobro). No se borran: se anulan.
-- ---------------------------------------------------------------------
CREATE TABLE pagos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  detalle_cierre_id  INT UNSIGNED  NOT NULL,
  fecha              DATE          NOT NULL,
  monto              DECIMAL(14,2) NOT NULL,
  metodo             ENUM('EFECTIVO','TRANSFERENCIA','NEQUI','DAVIPLATA','OTRO') NOT NULL DEFAULT 'EFECTIVO',
  referencia         VARCHAR(80)   NULL,
  observaciones      VARCHAR(500)  NULL,
  anulado            TINYINT(1)    NOT NULL DEFAULT 0,
  motivo_anulacion   VARCHAR(500)  NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_pago_monto CHECK (monto > 0),
  CONSTRAINT fk_pago_dc FOREIGN KEY (detalle_cierre_id)
    REFERENCES detalle_cierres(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX ix_pago_fecha (fecha)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. Auditoría de modificaciones importantes
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entidad     VARCHAR(40)  NOT NULL,
  entidad_id  INT UNSIGNED NULL,
  accion      VARCHAR(40)  NOT NULL,
  detalle     LONGTEXT     NULL,        -- JSON con valores antes/después
  motivo      VARCHAR(500) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_aud_entidad (entidad, entidad_id),
  INDEX ix_aud_fecha (created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. Configuración general (clave/valor)
-- ---------------------------------------------------------------------
CREATE TABLE configuracion (
  clave  VARCHAR(60)  PRIMARY KEY,
  valor  VARCHAR(500) NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Vistas de apoyo (los totales se derivan, no se almacenan -> 3FN)
-- ---------------------------------------------------------------------
CREATE VIEW v_pedidos_totales AS
SELECT p.id AS pedido_id, COALESCE(SUM(d.subtotal), 0) AS total, COUNT(d.id) AS items
FROM pedidos p
LEFT JOIN detalle_pedidos d ON d.pedido_id = p.id
GROUP BY p.id;

CREATE VIEW v_saldos_cierre AS
SELECT dc.id AS detalle_cierre_id, dc.cierre_id, dc.apartamento_id, dc.total,
       COALESCE(SUM(CASE WHEN pg.anulado = 0 THEN pg.monto END), 0) AS pagado,
       dc.total - COALESCE(SUM(CASE WHEN pg.anulado = 0 THEN pg.monto END), 0) AS saldo
FROM detalle_cierres dc
LEFT JOIN pagos pg ON pg.detalle_cierre_id = dc.id
GROUP BY dc.id, dc.cierre_id, dc.apartamento_id, dc.total;
