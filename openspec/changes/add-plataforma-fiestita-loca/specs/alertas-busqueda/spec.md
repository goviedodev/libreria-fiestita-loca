## Purpose

Convierte en venta futura lo que hoy se pierde: cuando alguien busca un libro que no está, queda
registrado, y cuando ese libro llega el dueño se entera y puede avisarle al cliente que lo pidió.

## ADDED Requirements

### Requirement: Registro de una búsqueda no satisfecha

El sistema SHALL permitir a un visitante dejar registrado un libro que buscó y no encontró,
indicando título o autor y su teléfono de contacto.

El sistema SHALL exigir al menos título o autor, y un teléfono chileno válido.

La solicitud SHALL quedar en estado `abierta` y registrar la fecha.

El sistema SHALL evitar duplicados: una solicitud del mismo teléfono con el mismo título y autor
que ya esté `abierta` NO SHALL crear un registro nuevo.

#### Scenario: Registro tras una búsqueda vacía

- **WHEN** un visitante no encuentra resultados y deja su teléfono junto al autor que buscaba
- **THEN** el sistema registra la solicitud en estado `abierta` con la fecha

#### Scenario: Solicitud sin datos suficientes

- **WHEN** un visitante envía una solicitud sin título ni autor
- **THEN** el sistema la rechaza indicando que debe señalar al menos uno de los dos

#### Scenario: Solicitud repetida

- **WHEN** un visitante registra la misma solicitud que ya tiene abierta
- **THEN** el sistema confirma que su solicitud ya está registrada sin crear un duplicado

### Requirement: Detección de coincidencias al ingresar inventario

Cuando se registra un libro nuevo, el sistema SHALL comparar sus datos con las solicitudes en
estado `abierta` y marcar las que coincidan.

La coincidencia SHALL evaluarse por autor o por título, ignorando mayúsculas, minúsculas y tildes,
y admitiendo coincidencia parcial de palabra.

Una solicitud SHALL poder coincidir con varios libros, y un libro con varias solicitudes.

La detección NO SHALL impedir ni retrasar el alta del libro: si falla, el libro se registra igual.

#### Scenario: Coincidencia por autor

- **WHEN** el dueño registra un libro de "Isabel Allende" y existe una solicitud abierta por esa autora
- **THEN** el sistema marca esa solicitud como coincidente con el libro recién ingresado

#### Scenario: Coincidencia por título parcial

- **WHEN** el dueño registra "Cien años de soledad" y existe una solicitud abierta por "cien años"
- **THEN** el sistema marca la coincidencia

#### Scenario: Sin coincidencias

- **WHEN** el dueño registra un libro que no coincide con ninguna solicitud abierta
- **THEN** el libro se registra normalmente y no se marca ninguna solicitud

#### Scenario: Fallo en la detección

- **WHEN** la detección de coincidencias falla durante el alta de un libro
- **THEN** el libro queda registrado de todos modos

### Requirement: Aviso al cliente

El sistema SHALL mostrar al dueño, en el backoffice, las solicitudes con coincidencias pendientes
de avisar, indicando el cliente, lo que pidió y qué libro coincide.

Para cada coincidencia el sistema SHALL ofrecer un enlace que abra WhatsApp con el cliente y un
mensaje prearmado que mencione el libro que llegó y la URL de su ficha.

El aviso SHALL ser una acción explícita del dueño; el sistema NO SHALL enviar mensajes
automáticamente al cliente.

Tras avisar, el dueño SHALL poder marcar la solicitud como `avisada` o como `cerrada`.

#### Scenario: Aviso pendiente visible

- **WHEN** una solicitud abierta obtiene una coincidencia
- **THEN** el backoffice la muestra entre los avisos pendientes con el libro que coincide

#### Scenario: Envío del aviso

- **WHEN** el dueño usa el enlace de aviso de una coincidencia
- **THEN** se abre WhatsApp con el cliente y un mensaje que menciona el libro y su ficha

#### Scenario: Ningún envío automático

- **WHEN** se detecta una coincidencia
- **THEN** el sistema no envía ningún mensaje por su cuenta y espera la acción del dueño

#### Scenario: Cierre de la solicitud

- **WHEN** el dueño marca una solicitud como `cerrada`
- **THEN** deja de aparecer entre los avisos pendientes y no vuelve a generar coincidencias
