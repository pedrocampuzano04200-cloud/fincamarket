# Manual de usuario — FincaMarket

## Inicio diario
1. Abra XAMPP y pulse **Start** en MySQL.
2. Doble clic en `iniciar.bat`. El navegador abre el **Dashboard**.
3. Al terminar, cierre la ventana negra del servidor (los datos ya están guardados).

En tableta, el menú lateral se abre con el botón ☰ arriba a la izquierda.

## 1. Configuración inicial (una sola vez)
1. **Configuración** → escriba el nombre de la finca, NIT, teléfono y el mensaje que aparecerá en las cuentas de cobro (por ejemplo, "Pague por Nequi al 300…").
2. **Productos** → revise los productos de ejemplo, ajuste precios y agregue los suyos. En las pestañas *Categorías* y *Unidades de medida* puede crear nuevas (indique si la unidad admite decimales: kg y lb sí; atado o unidad no).
3. **Unidades y apartamentos** → cree cada conjunto/edificio y sus apartamentos. Cada unidad trae automáticamente el registro **"Sin especificar"** para pedidos sin número. En *Compradores / clientes* puede registrar nombre y teléfono de quien pide.

## 2. Registrar un pedido
**Registrar pedido** (menú):
1. Revise la **fecha** (por defecto hoy).
2. Elija la **unidad residencial** y el **apartamento** (o "Sin especificar"). El botón **+** crea un apartamento nuevo sin salir de la pantalla.
3. Opcional: elija el **comprador** y el **estado**.
4. Agregue productos: seleccione el producto, escriba la cantidad y pulse **Agregar** (o Enter). También puede **tocar el nombre** de un producto para sumar 1.
5. El subtotal de cada línea y el **total** se calculan solos. Puede cambiar cantidades o quitar líneas (🗑).
6. Pulse **Registrar pedido**. Aparece el número asignado (ej. P-000045). La fecha y la unidad se conservan para registrar el siguiente pedido rápidamente.

Protecciones: si pulsa dos veces el botón no se duplica el pedido; si ya existe un pedido idéntico para ese apartamento y día, el sistema pregunta antes de registrarlo.

## 3. Consultar y gestionar pedidos
**Pedidos**: filtre por fechas, estado, unidad, apartamento, producto o busque por número/comprador.
- 👁 Ver detalle (con opción de imprimir).
- ✏️ Editar: los productos que ya estaban conservan el **precio con el que se pidieron**; los nuevos toman el precio actual.
- Cambie el **estado** directamente en la lista: Pendiente → Confirmado → Entregado.
- ⛔ **Cancelar**: pide confirmación y un motivo. Los cancelados no se cobran. Se pueden reactivar (↺) mientras la semana no esté cerrada.
- Los pedidos con candado 🔒 pertenecen a una semana cerrada y no se pueden modificar.

## 4. Productos y precios
- **$** cambio rápido de precio (muestra el historial de precios).
- **Desactivar** retira el producto de los pedidos nuevos sin afectar el historial. Solo se puede eliminar un producto que nunca se haya pedido.
- Cambiar un precio **no** modifica pedidos ya registrados.

## 5. Cierre semanal (cuenta de cobro)
**Cierre semanal**:
1. Elija la fecha inicial y final (botones *Semana anterior* / *Semana actual*).
2. Pulse **Calcular liquidación**. Verá por unidad residencial cada apartamento con su total; haga clic en una fila para ver el detalle por producto. Al final, el **TOTAL GENERAL**. Avisos: pedidos aún *Pendientes*, períodos ya cerrados.
3. Pulse **Generar cierre** y confirme. A partir de ese momento los pedidos de esa semana quedan bloqueados y se guarda una "fotografía" de la liquidación.

En el detalle del cierre:
- **Imprimir**, **PDF** (consolidado + una cuenta de cobro por página para entregar a cada apartamento) y **Excel**.
- **Cuenta**: abre la cuenta de cobro del apartamento con productos, pedidos que la conforman y pagos. Allí se **registra un pago** (fecha, monto, método, referencia); el botón *Saldo total* llena el monto pendiente. El estado cambia a *Parcial* o *Pagado*.
- Un pago mal registrado se **anula** (queda en el historial con su motivo).

### Corregir una semana ya cerrada
1. Anule los pagos que tenga ese cierre (si los hay).
2. Pulse **Reabrir** y escriba el motivo (queda en Auditoría).
3. Corrija los pedidos.
4. Vuelva a *Cierre semanal* y genere el cierre del mismo período. El cierre anterior queda en el historial marcado como *Reabierto*.

## 6. Dashboard
Indicadores de ventas del día, de la semana y del período, pedidos, clientes, productos activos, **pendiente de cobro**, **recaudado** y **por liquidar** (pedidos sin cierre). Gráficos de ventas por día, comparación de 8 semanas, productos más y menos vendidos, ventas por unidad y distribución de ingresos; tablas de últimos pedidos, mejores clientes, productos más vendidos y apartamentos con saldo pendiente. Todo se actualiza al cambiar los filtros (fechas, semana, producto, unidad, apartamento).

## 7. Historial
Pestañas: ventas por semana, pedidos anteriores, productos vendidos, compras por apartamento (clic en un apartamento para ver sus pedidos), liquidaciones, pagos realizados, saldos pendientes y **auditoría** (quién cambió qué: precios, cancelaciones, cierres, reaperturas, pagos anulados, restauraciones).

## 8. Reportes
- **Reporte de ventas** por rango de fechas (y opcionalmente unidad, apartamento o producto) en **PDF** o **Excel** (hojas: ventas semanales, por producto, por apartamento, saldos pendientes y detalle de pedidos).
- **Liquidaciones** de cada cierre en PDF o Excel.

## 9. Copias de seguridad
**Configuración → Crear copia ahora** (recomendado después de cada cierre). Para volver a un estado anterior: botón ↺ *Restaurar* en la copia deseada y escriba `RESTAURAR`. Antes de restaurar el sistema guarda automáticamente una copia del estado actual.
