## Purpose

Le da al dueño el control de sus cobranzas y entregas: saber en todo momento qué reservas están
pendientes, cuáles ya se pagaron y cuáles se entregaron, sin depender de recordar conversaciones de
WhatsApp.

## ADDED Requirements

### Requirement: Listado de reservas

El sistema SHALL mostrar al dueño todas las reservas con su folio, fecha, nombre y teléfono del
cliente, cantidad de libros, total y estado.

El listado SHALL poder filtrarse por estado y buscarse por folio, nombre o teléfono, y SHALL
ordenarse por fecha descendente de forma predeterminada.

El sistema SHALL destacar las reservas `pendiente` con más de 7 días de antigüedad, porque son las
que probablemente hay que cerrar o liberar.

#### Scenario: Listado inicial

- **WHEN** el dueño abre el backoffice de pedidos
- **THEN** ve todas las reservas de la más reciente a la más antigua con su estado

#### Scenario: Filtro por estado

- **WHEN** el dueño filtra por estado `pendiente`
- **THEN** el listado muestra únicamente las reservas pendientes

#### Scenario: Búsqueda por teléfono

- **WHEN** el dueño busca por el teléfono de un cliente
- **THEN** el listado muestra todas las reservas de ese cliente

#### Scenario: Reserva pendiente antigua

- **WHEN** una reserva lleva más de 7 días en estado `pendiente`
- **THEN** el listado la muestra destacada respecto de las demás

### Requirement: Detalle de una reserva

El sistema SHALL mostrar al dueño el detalle de una reserva con los datos del cliente, la nota si
la hubo, cada libro con su título, autor y precio, el total, el estado actual y el historial de
cambios de estado con su fecha.

El detalle SHALL ofrecer un enlace que abra WhatsApp con la conversación de ese cliente.

#### Scenario: Apertura del detalle

- **WHEN** el dueño abre una reserva del listado
- **THEN** ve los datos del cliente, los libros, el total y el historial de estados

#### Scenario: Contacto directo al cliente

- **WHEN** el dueño usa el enlace de contacto de una reserva
- **THEN** se abre WhatsApp con la conversación del teléfono de ese cliente

### Requirement: Transiciones de estado de una reserva

Una reserva SHALL estar siempre en uno de estos estados: `pendiente`, `pagado`, `entregado` o
`cancelado`.

El sistema SHALL permitir únicamente estas transiciones: `pendiente → pagado`,
`pendiente → cancelado`, `pagado → entregado` y `pagado → cancelado`. Cualquier otra transición
SHALL ser rechazada. `entregado` y `cancelado` SHALL ser estados finales.

Cada cambio de estado SHALL quedar registrado con su fecha.

#### Scenario: Marcar como pagada

- **WHEN** el dueño marca como `pagado` una reserva `pendiente`
- **THEN** la reserva queda en estado `pagado` y se registra la fecha del cambio

#### Scenario: Marcar como entregada

- **WHEN** el dueño marca como `entregado` una reserva `pagado`
- **THEN** la reserva queda en estado `entregado` y no admite más cambios

#### Scenario: Transición no permitida

- **WHEN** el dueño intenta marcar como `entregado` una reserva que aún está `pendiente`
- **THEN** el sistema rechaza el cambio indicando que primero debe registrarse el pago

#### Scenario: Cambio sobre un estado final

- **WHEN** el dueño intenta cambiar el estado de una reserva `entregado`
- **THEN** el sistema rechaza el cambio indicando que la reserva ya está cerrada

### Requirement: Efecto del estado de la reserva sobre el stock

El estado de los libros SHALL derivarse del estado de las reservas que los incluyen.

Cuando una reserva pasa a `entregado`, todos sus libros SHALL pasar a estado `vendido`.

Cuando una reserva pasa a `cancelado`, todos sus libros SHALL volver a estado `disponible` y
reaparecer en el catálogo público, salvo que estén incluidos en otra reserva activa.

El cambio de estado de la reserva y el de sus libros SHALL ocurrir de forma atómica.

#### Scenario: Entrega vende los libros

- **WHEN** el dueño marca una reserva como `entregado`
- **THEN** todos sus libros quedan en estado `vendido`
- **AND** el catálogo público los muestra como no disponibles

#### Scenario: Cancelación libera los libros

- **WHEN** el dueño cancela una reserva `pendiente`
- **THEN** todos sus libros vuelven a estado `disponible`
- **AND** reaparecen como reservables en el catálogo público

#### Scenario: Fallo a mitad del cambio

- **WHEN** el cambio de estado de una reserva falla al actualizar sus libros
- **THEN** ni la reserva ni ninguno de sus libros queda modificado

### Requirement: Resumen del negocio

El sistema SHALL mostrar al dueño un resumen con la cantidad de libros disponibles, reservados y
vendidos, la cantidad de reservas por estado, y el monto total pendiente de cobro correspondiente a
las reservas en estado `pendiente` y `pagado` no entregadas.

#### Scenario: Consulta del resumen

- **WHEN** el dueño abre el resumen del backoffice
- **THEN** ve los totales de inventario, las reservas por estado y el monto pendiente de cobro

#### Scenario: Negocio sin movimientos

- **WHEN** no hay libros ni reservas registradas
- **THEN** el resumen muestra todos los totales en cero sin error
