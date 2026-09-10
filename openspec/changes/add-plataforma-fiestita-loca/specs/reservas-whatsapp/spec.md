## Purpose

Cierra la venta donde ya está la clientela: el cliente arma su reserva en la web y el sistema lo
deja en la conversación de WhatsApp con el pedido ya escrito, dejando registro en el negocio de qué
ejemplares quedaron comprometidos.

## ADDED Requirements

### Requirement: Selección de libros a reservar

El sistema SHALL permitir a un visitante acumular varios libros disponibles en una selección antes
de enviar la reserva.

La selección SHALL persistir en el navegador del visitante mientras navega el catálogo y entre
recargas de la página.

Solo SHALL poder agregarse libros en estado `disponible`; un libro que pasó a `reservado` o
`vendido` mientras estaba en la selección SHALL marcarse como no disponible antes de enviar.

#### Scenario: Agregar libros a la selección

- **WHEN** un visitante agrega dos libros disponibles desde sus fichas
- **THEN** la selección muestra ambos libros con el total a pagar

#### Scenario: La selección sobrevive a la recarga

- **WHEN** un visitante con libros en su selección recarga la página
- **THEN** la selección conserva los mismos libros

#### Scenario: Libro tomado por otro cliente

- **WHEN** un visitante intenta enviar una reserva que incluye un libro que ya fue reservado
- **THEN** el sistema le indica cuál libro dejó de estar disponible
- **AND** le permite quitarlo y continuar con el resto

#### Scenario: Quitar un libro

- **WHEN** un visitante quita un libro de su selección
- **THEN** el total se recalcula sin ese libro

### Requirement: Creación de una reserva

El sistema SHALL exigir al visitante un nombre y un número de teléfono chileno válido para crear
una reserva, y SHALL aceptar opcionalmente una nota.

Al crear la reserva el sistema SHALL asignarle un folio corto legible, único, comunicable por
teléfono, y SHALL dejarla en estado `pendiente`.

Al crear la reserva todos los libros incluidos SHALL pasar a estado `reservado`. La reserva y el
cambio de estado de los libros SHALL ocurrir de forma atómica: si algún libro no puede reservarse,
no SHALL crearse la reserva ni cambiar el estado de ningún otro libro.

El sistema SHALL rechazar una reserva sin libros.

#### Scenario: Reserva creada correctamente

- **WHEN** un visitante con dos libros seleccionados envía su nombre y teléfono
- **THEN** el sistema crea la reserva en estado `pendiente` con un folio
- **AND** ambos libros quedan en estado `reservado`

#### Scenario: Teléfono inválido

- **WHEN** un visitante envía un teléfono que no corresponde a un número chileno válido
- **THEN** el sistema rechaza la reserva indicando el error en el campo teléfono

#### Scenario: Reserva vacía

- **WHEN** un visitante intenta enviar una reserva sin libros seleccionados
- **THEN** el sistema la rechaza indicando que debe elegir al menos un libro

#### Scenario: Conflicto durante la creación

- **WHEN** dos visitantes envían al mismo tiempo una reserva que incluye el mismo libro
- **THEN** solo una de las dos reservas se crea
- **AND** la otra recibe el aviso de que el libro ya no está disponible, sin quedar registrada

### Requirement: Handoff a WhatsApp

Tras crear la reserva el sistema SHALL llevar al cliente a la conversación de WhatsApp del negocio
con un mensaje prearmado que incluya el folio, el título y autor de cada libro reservado, la URL de
cada ficha y el total.

El mensaje SHALL ir correctamente codificado para que los tildes, los saltos de línea y las URL
lleguen legibles.

El número de WhatsApp del negocio SHALL ser configurable y no SHALL estar escrito en el código.

Si el cliente no completa el envío en WhatsApp, la reserva SHALL permanecer registrada de todos
modos para que el dueño la vea en el backoffice.

#### Scenario: Apertura de WhatsApp con el mensaje

- **WHEN** un cliente confirma su reserva de dos libros
- **THEN** el sistema abre WhatsApp con un mensaje que contiene el folio, ambos libros con sus URL
  y el total

#### Scenario: Mensaje con caracteres especiales

- **WHEN** la reserva incluye un libro cuyo título tiene tildes o signos
- **THEN** el mensaje prearmado los muestra correctamente y no como secuencias de escape

#### Scenario: El cliente no envía el mensaje

- **WHEN** un cliente crea la reserva pero cierra WhatsApp sin enviar
- **THEN** la reserva sigue apareciendo como `pendiente` en el backoffice del dueño

### Requirement: Consulta de una reserva por folio

El sistema SHALL permitir a un cliente consultar el estado de su reserva usando el folio, sin
autenticarse.

La consulta SHALL devolver el estado, la fecha y los libros de la reserva, y SHALL ocultar el
teléfono del cliente salvo sus últimos dígitos.

#### Scenario: Consulta con folio válido

- **WHEN** un cliente consulta su folio
- **THEN** el sistema le muestra el estado de la reserva y los libros incluidos

#### Scenario: Consulta con folio inexistente

- **WHEN** alguien consulta un folio que no existe
- **THEN** el sistema responde que no se encontró la reserva, sin revelar ningún dato
