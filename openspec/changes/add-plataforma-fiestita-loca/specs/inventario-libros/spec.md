## Purpose

Mantiene el inventario de libros de la librería, cada uno un ejemplar único con su condición y
precio, y reduce el trabajo de carga permitiendo que los datos bibliográficos se obtengan a partir
del ISBN en vez de escribirse a mano.

## ADDED Requirements

### Requirement: Registro de un libro

El sistema SHALL almacenar por cada libro un identificador propio, título, autor, condición
(`nuevo` o `usado`), precio en pesos chilenos, estado de stock (`disponible`, `reservado`,
`vendido`) y fecha de ingreso. El ISBN, el género, el año de publicación, la editorial, la sinopsis,
la URL de portada y la foto del ejemplar son opcionales.

El título, el autor, la condición y el precio SHALL ser obligatorios. Un precio no entero o menor
o igual a cero SHALL ser rechazado.

Todo libro recién creado SHALL quedar en estado `disponible`.

#### Scenario: Alta con los datos mínimos

- **WHEN** el dueño registra un libro con título, autor, condición y precio válidos
- **THEN** el sistema lo persiste, le asigna un identificador propio, lo deja en estado
  `disponible` y registra la fecha de ingreso

#### Scenario: Alta con precio inválido

- **WHEN** el dueño registra un libro con precio `0`, negativo o no numérico
- **THEN** el sistema rechaza el alta con un error de validación que indica el campo `precio`
- **AND** no se crea ningún libro

#### Scenario: Alta sin campos obligatorios

- **WHEN** el dueño registra un libro sin título o sin autor
- **THEN** el sistema rechaza el alta indicando cuáles campos faltan

### Requirement: Búsqueda de metadatos por ISBN

El sistema SHALL permitir al dueño consultar los metadatos bibliográficos de un libro a partir de
un ISBN-10 o ISBN-13, devolviendo título, autores, año, editorial, género, sinopsis y URL de
portada cuando estén disponibles.

La consulta SHALL realizarse contra fuentes bibliográficas públicas desde el servidor, nunca desde
el navegador del dueño, y SHALL consultar una segunda fuente cuando la primera no tenga resultado.

El sistema SHALL normalizar el ISBN recibido eliminando guiones y espacios antes de consultar, y
SHALL rechazar un ISBN cuyo dígito verificador no sea válido.

#### Scenario: ISBN encontrado en la primera fuente

- **WHEN** el dueño consulta un ISBN que existe en la fuente primaria
- **THEN** el sistema devuelve los metadatos encontrados junto con el nombre de la fuente

#### Scenario: ISBN encontrado solo en la fuente alternativa

- **WHEN** el dueño consulta un ISBN que la fuente primaria no tiene pero la alternativa sí
- **THEN** el sistema devuelve los metadatos de la fuente alternativa indicando su procedencia

#### Scenario: ISBN sin resultados

- **WHEN** el dueño consulta un ISBN que ninguna fuente reconoce
- **THEN** el sistema responde que no hubo coincidencias
- **AND** ofrece continuar con el alta manual del libro

#### Scenario: ISBN mal formado

- **WHEN** el dueño consulta un ISBN cuyo dígito verificador es inválido
- **THEN** el sistema rechaza la consulta indicando que el ISBN no es válido
- **AND** no consulta ninguna fuente externa

#### Scenario: Fuentes externas no disponibles

- **WHEN** las fuentes bibliográficas no responden o fallan
- **THEN** el sistema informa que el enriquecimiento no está disponible en este momento
- **AND** permite continuar con el alta manual sin perder lo que el dueño ya escribió

### Requirement: Ingesta asistida por ISBN

El sistema SHALL permitir crear un libro a partir de los metadatos obtenidos por ISBN,
prellenando los campos bibliográficos y exigiendo del dueño únicamente el precio y la condición.

El dueño SHALL poder corregir cualquier campo prellenado antes de confirmar el alta.

Un ISBN SHALL poder repetirse entre libros distintos, porque la librería puede tener más de un
ejemplar del mismo título en condiciones o precios diferentes; cada uno es un registro
independiente.

#### Scenario: Confirmación tras enriquecimiento

- **WHEN** el dueño consulta un ISBN, obtiene metadatos, ingresa precio y condición y confirma
- **THEN** el sistema crea el libro con los metadatos obtenidos y los datos ingresados

#### Scenario: Corrección de un campo prellenado

- **WHEN** el dueño edita el título prellenado antes de confirmar
- **THEN** el libro se crea con el título corregido y no con el de la fuente externa

#### Scenario: Segundo ejemplar del mismo ISBN

- **WHEN** el dueño ingresa un ISBN que ya tiene un libro registrado
- **THEN** el sistema advierte que ya existe un ejemplar con ese ISBN
- **AND** permite crear el nuevo registro de todos modos como ejemplar independiente

### Requirement: Foto del ejemplar

El sistema SHALL permitir al dueño adjuntar a un libro una foto del ejemplar real, distinta de la
portada obtenida de las fuentes externas.

El sistema SHALL aceptar únicamente imágenes JPEG, PNG o WebP de hasta 5 MB, y SHALL rechazar
cualquier otro tipo o tamaño con un mensaje explícito.

Cuando un libro tiene foto propia, el catálogo SHALL mostrar esa foto en lugar de la portada de la
fuente externa.

#### Scenario: Subida de una foto válida

- **WHEN** el dueño adjunta una imagen JPEG de 2 MB a un libro
- **THEN** el sistema la almacena, la asocia al libro y devuelve la URL con que se sirve

#### Scenario: Archivo de tipo no permitido

- **WHEN** el dueño intenta adjuntar un archivo PDF
- **THEN** el sistema rechaza la subida indicando los formatos aceptados
- **AND** el libro conserva la imagen que tuviera antes

#### Scenario: Archivo demasiado grande

- **WHEN** el dueño intenta adjuntar una imagen de más de 5 MB
- **THEN** el sistema rechaza la subida indicando el tamaño máximo permitido

#### Scenario: Reemplazo de la foto

- **WHEN** el dueño sube una foto a un libro que ya tenía una
- **THEN** el libro queda con la foto nueva
- **AND** la imagen anterior deja de estar accesible

### Requirement: Edición y baja de libros

El sistema SHALL permitir al dueño modificar cualquier campo de un libro existente y darlo de baja.

La baja SHALL ser lógica: el libro deja de aparecer en el catálogo público pero se conserva para la
trazabilidad de las reservas que lo incluyan.

Un libro que forma parte de una reserva en estado `pendiente` o `pagado` SHALL poder editarse pero
NO SHALL poder darse de baja; el sistema SHALL indicar qué reservas lo bloquean.

#### Scenario: Edición del precio

- **WHEN** el dueño cambia el precio de un libro disponible
- **THEN** el sistema guarda el nuevo precio y el catálogo lo refleja

#### Scenario: Baja de un libro libre

- **WHEN** el dueño da de baja un libro que no está en ninguna reserva activa
- **THEN** el libro deja de aparecer en el catálogo público
- **AND** sigue siendo consultable desde el backoffice

#### Scenario: Baja bloqueada por reserva activa

- **WHEN** el dueño intenta dar de baja un libro incluido en una reserva `pendiente`
- **THEN** el sistema rechaza la baja e indica el folio de la reserva que lo bloquea
