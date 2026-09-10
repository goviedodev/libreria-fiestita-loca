## Purpose

Impide que alguien ajeno al negocio pueda modificar el inventario o los pedidos, manteniendo el
acceso simple para un dueño que trabaja solo y entra desde su teléfono.

## ADDED Requirements

### Requirement: Ingreso al backoffice

El sistema SHALL exigir un token de acceso para entrar al backoffice.

El token SHALL almacenarse como secreto del servidor y NO SHALL estar escrito en el código fuente
ni ser accesible desde el cliente.

Cuando el token entregado es correcto, el sistema SHALL establecer una sesión mediante una cookie
`HttpOnly`, `Secure` y `SameSite=Strict`, con una vigencia máxima de 30 días. El token en sí NO
SHALL quedar guardado en el almacenamiento del navegador.

La comparación del token SHALL hacerse en tiempo constante.

#### Scenario: Ingreso con token correcto

- **WHEN** el dueño ingresa el token correcto
- **THEN** el sistema establece la cookie de sesión y le da acceso al backoffice

#### Scenario: Ingreso con token incorrecto

- **WHEN** alguien ingresa un token incorrecto
- **THEN** el sistema rechaza el acceso con un mensaje genérico que no revela si el token existe
- **AND** no establece ninguna sesión

#### Scenario: Sesión vencida

- **WHEN** el dueño abre el backoffice con una sesión de más de 30 días
- **THEN** el sistema le pide ingresar el token nuevamente

#### Scenario: Cierre de sesión

- **WHEN** el dueño cierra sesión
- **THEN** la cookie de sesión se invalida y el backoffice vuelve a pedir el token

### Requirement: Protección de las operaciones de administración

Toda operación que cree, modifique o elimine inventario, cambie el estado de una reserva, consulte
datos de clientes o acceda al resumen del negocio SHALL exigir una sesión válida.

Una petición sin sesión válida a una de esas operaciones SHALL ser rechazada como no autorizada,
sin ejecutar ningún efecto y sin revelar información del recurso solicitado.

La autorización SHALL verificarse en el servidor en cada petición; ocultar la interfaz de
administración NO SHALL considerarse control de acceso.

#### Scenario: Escritura sin sesión

- **WHEN** alguien intenta crear un libro sin sesión válida
- **THEN** el sistema rechaza la petición como no autorizada y no crea nada

#### Scenario: Cambio de estado sin sesión

- **WHEN** alguien intenta marcar una reserva como pagada sin sesión válida
- **THEN** el sistema rechaza la petición y la reserva conserva su estado

#### Scenario: Consulta de datos de clientes sin sesión

- **WHEN** alguien pide el listado de reservas sin sesión válida
- **THEN** el sistema rechaza la petición sin devolver ningún dato de clientes

#### Scenario: Lectura pública no afectada

- **WHEN** un visitante sin sesión consulta el catálogo o una ficha de libro
- **THEN** el sistema responde normalmente, porque son operaciones públicas

### Requirement: Contención de intentos de acceso

El sistema SHALL limitar los intentos fallidos de ingreso al backoffice desde un mismo origen, y
SHALL rechazar temporalmente nuevos intentos al superar 5 fallos en 15 minutos.

Los mensajes de error de autenticación NO SHALL distinguir entre token ausente, mal formado o
incorrecto.

El sistema NO SHALL registrar en logs el valor del token entregado, ni siquiera parcialmente.

#### Scenario: Intentos por fuerza bruta

- **WHEN** alguien falla 6 veces seguidas el ingreso en 15 minutos
- **THEN** el sistema rechaza los intentos siguientes indicando que debe esperar

#### Scenario: Token ausente frente a token incorrecto

- **WHEN** una petición llega sin token y otra con un token incorrecto
- **THEN** ambas reciben el mismo mensaje de error

#### Scenario: Registro de un intento fallido

- **WHEN** ocurre un intento fallido de ingreso
- **THEN** el registro del evento no contiene el token entregado
