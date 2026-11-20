-- =====================================================================
-- FincaMarket - Datos iniciales (catálogos y ejemplos)
-- Ruta: database/seed.sql
-- Ejecutar después de schema.sql:  mysql -u root -p fincamarket < database/seed.sql
-- =====================================================================
USE fincamarket;

INSERT INTO configuracion (clave, valor) VALUES
  ('nombre_finca', 'Finca La Esperanza'),
  ('telefono_finca', ''),
  ('nit_finca', ''),
  ('mensaje_cuenta_cobro', 'Gracias por preferir nuestros productos del campo.'),
  ('dia_inicio_semana', '1');

INSERT INTO categorias_productos (nombre, descripcion) VALUES
  ('Hortalizas', 'Hojas y hortalizas frescas'),
  ('Legumbres', 'Granos y vainas'),
  ('Verduras', 'Verduras y frutos de huerta'),
  ('Hierbas aromáticas', 'Hierbas y condimentos frescos'),
  ('Tubérculos y raíces', 'Papa, zanahoria, yuca, etc.'),
  ('Frutas', 'Frutas de la finca');

INSERT INTO unidades_medida (nombre, abreviatura, permite_decimales) VALUES
  ('Kilogramo', 'kg', 1),
  ('Libra', 'lb', 1),
  ('Unidad', 'und', 0),
  ('Atado', 'atado', 0),
  ('Bolsa', 'bolsa', 0),
  ('Manojo', 'manojo', 0),
  ('Docena', 'doc', 0);

INSERT INTO productos (nombre, categoria_id, unidad_medida_id, descripcion, precio) VALUES
  ('Lechuga crespa', 1, 4, 'Lechuga crespa fresca', 3000),
  ('Frijol',         2, 1, 'Frijol verde desgranado', 8000),
  ('Arveja',         2, 1, 'Arveja verde', 7000),
  ('Zucchini',       3, 1, 'Zucchini verde', 4500),
  ('Pepino',         3, 3, 'Pepino cohombro', 2000),
  ('Cilantro',       4, 6, 'Cilantro fresco', 1500),
  ('Cebolla',        3, 2, 'Cebolla larga', 2500),
  ('Tomate',         3, 1, 'Tomate chonto', 4000),
  ('Zanahoria',      5, 1, 'Zanahoria', 3000);

INSERT INTO unidades_residenciales (nombre, direccion) VALUES
  ('Unidad Los Pinos', NULL),
  ('Edificio Mirador', NULL);

INSERT INTO apartamentos (unidad_id, numero) VALUES
  (1, '101'), (1, '102'), (1, '201'), (1, NULL),
  (2, '301'), (2, NULL);
