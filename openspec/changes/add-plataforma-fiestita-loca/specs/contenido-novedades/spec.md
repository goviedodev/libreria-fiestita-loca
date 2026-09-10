## Purpose

Le ahorra al dueño el trabajo de diseño: con el catálogo ya ordenado, arma solo las piezas y el
texto de las novedades de la semana para que las publique en Instagram.

## ADDED Requirements

### Requirement: Selección de novedades

El sistema SHALL mostrar al dueño los libros ingresados dentro de un rango de fechas, con los
últimos 7 días como valor predeterminado.

El dueño SHALL poder elegir cuáles de esos libros entran en la publicación y en qué orden.

El sistema SHALL excluir de la selección los libros dados de baja y los que ya están vendidos.

#### Scenario: Novedades de la semana

- **WHEN** el dueño abre la vista de novedades
- **THEN** ve los libros ingresados en los últimos 7 días, sin los vendidos ni los dados de baja

#### Scenario: Rango personalizado

- **WHEN** el dueño cambia el rango a los últimos 30 días
- **THEN** la selección se actualiza con los libros de ese período

#### Scenario: Semana sin ingresos

- **WHEN** no se ingresó ningún libro en el rango elegido
- **THEN** el sistema informa que no hay novedades para ese período

### Requirement: Generación de las piezas gráficas

El sistema SHALL generar, por cada libro seleccionado, una imagen en formato vertical de 1080×1920
píxeles apta para una historia de Instagram, con la imagen del libro, su título, su autor, su
precio y el nombre de la librería.

La generación SHALL ocurrir en el navegador del dueño, sin depender de un servicio externo de
diseño.

El sistema SHALL permitir descargar las imágenes generadas, ya sea una por una o todas juntas.

Cuando un libro no tiene imagen, la pieza SHALL generarse igual usando un fondo de respaldo con el
título y el autor.

#### Scenario: Generación de una tanda

- **WHEN** el dueño selecciona cinco libros y genera las piezas
- **THEN** el sistema produce cinco imágenes de 1080×1920 y permite descargarlas

#### Scenario: Libro sin imagen

- **WHEN** un libro seleccionado no tiene foto ni portada
- **THEN** su pieza se genera con el fondo de respaldo, el título y el autor legibles

#### Scenario: Descarga individual

- **WHEN** el dueño descarga una pieza concreta
- **THEN** el archivo se guarda con un nombre que identifica al libro

### Requirement: Texto de la publicación

El sistema SHALL generar un texto listo para copiar que liste los libros seleccionados con título,
autor y precio, e incluya la URL del catálogo.

El texto SHALL poder copiarse al portapapeles con una sola acción.

El dueño SHALL poder editar el texto generado antes de copiarlo.

#### Scenario: Copia del texto

- **WHEN** el dueño copia el texto generado
- **THEN** el portapapeles contiene la lista de libros con sus precios y la URL del catálogo

#### Scenario: Edición previa

- **WHEN** el dueño edita el texto antes de copiarlo
- **THEN** lo copiado es el texto editado y no el generado originalmente
