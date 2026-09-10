## Purpose

Es el escaparate del negocio: permite que cualquier persona consulte desde el navegador qué libros
hay disponibles hoy en la librería, sin tener que preguntar por WhatsApp ni esperar respuesta.

## ADDED Requirements

### Requirement: Listado del catálogo

El sistema SHALL mostrar a cualquier visitante, sin autenticación, los libros que estén dados de
alta y no dados de baja.

El listado SHALL estar paginado, con un máximo de 24 libros por página, y SHALL ordenarse por
fecha de ingreso descendente de forma predeterminada, de modo que las novedades aparezcan primero.

Cada libro del listado SHALL mostrar imagen (foto del ejemplar si existe, si no la portada
externa, si no un marcador de posición), título, autor, condición, precio y disponibilidad.

Los libros ya vendidos SHALL seguir siendo visibles marcados como no disponibles, salvo que el
visitante filtre por disponibilidad.

#### Scenario: Visitante abre el catálogo

- **WHEN** un visitante entra a la página del catálogo
- **THEN** ve la primera página de libros ordenados del más reciente al más antiguo

#### Scenario: Libro sin ninguna imagen

- **WHEN** un libro no tiene foto propia ni portada de fuente externa
- **THEN** el listado muestra un marcador de posición en su lugar y el resto de los datos igual

#### Scenario: Catálogo vacío

- **WHEN** no hay ningún libro dado de alta
- **THEN** el sistema muestra un mensaje indicando que aún no hay libros publicados

#### Scenario: Libro dado de baja

- **WHEN** el dueño da de baja un libro
- **THEN** ese libro deja de aparecer en el listado público

### Requirement: Búsqueda de libros

El sistema SHALL permitir buscar libros por texto libre, haciendo coincidir el término contra
título, autor e ISBN.

La búsqueda SHALL ignorar mayúsculas, minúsculas y tildes, de modo que `allende`, `Allende` y
`Allendé` devuelvan los mismos resultados.

La búsqueda SHALL admitir coincidencias parciales de palabra.

El término de búsqueda SHALL quedar reflejado en la URL, para que un resultado de búsqueda pueda
compartirse por WhatsApp o Instagram.

#### Scenario: Búsqueda por autor sin tildes

- **WHEN** un visitante busca `garcia marquez`
- **THEN** el sistema devuelve los libros cuyo autor es "García Márquez"

#### Scenario: Búsqueda parcial por título

- **WHEN** un visitante busca `cien años`
- **THEN** el sistema devuelve los libros cuyo título contiene esa secuencia

#### Scenario: Búsqueda sin resultados

- **WHEN** un visitante busca un término que no coincide con ningún libro
- **THEN** el sistema informa que no hay resultados
- **AND** ofrece registrar la búsqueda para que le avisen si llega ese libro

#### Scenario: Búsqueda compartible

- **WHEN** un visitante busca un término y copia la URL
- **THEN** al abrir esa URL se muestra la misma búsqueda ya aplicada

### Requirement: Filtros del catálogo

El sistema SHALL permitir filtrar el catálogo por género, por condición (`nuevo` / `usado`) y por
disponibilidad, y ordenarlo por precio ascendente, precio descendente o fecha de ingreso.

Los filtros SHALL poder combinarse entre sí y con la búsqueda por texto, y SHALL reflejarse en la
URL igual que la búsqueda.

El sistema SHALL indicar cuántos resultados arroja la combinación de filtros aplicada.

#### Scenario: Filtro combinado

- **WHEN** un visitante filtra por género `Novela`, condición `usado` y disponibilidad `disponible`
- **THEN** el sistema muestra solo los libros que cumplen las tres condiciones y la cantidad total

#### Scenario: Filtro sobre una búsqueda

- **WHEN** un visitante busca `borges` y luego filtra por condición `usado`
- **THEN** el sistema muestra solo los libros usados que coinciden con `borges`

#### Scenario: Limpiar filtros

- **WHEN** un visitante limpia los filtros aplicados
- **THEN** el sistema vuelve a mostrar el catálogo completo y la URL deja de contener los filtros

### Requirement: Ficha de un libro

El sistema SHALL exponer cada libro en una URL propia y estable que muestre imagen, título, autor,
editorial, año, género, condición, sinopsis, precio y disponibilidad.

La ficha SHALL ofrecer la acción de reservar cuando el libro está disponible, y SHALL indicarlo
como no disponible en caso contrario.

La ficha SHALL incluir metadatos para que al compartir su URL en WhatsApp o Instagram se
previsualicen el título y la imagen del libro.

#### Scenario: Ficha de un libro disponible

- **WHEN** un visitante abre la ficha de un libro disponible
- **THEN** ve todos sus datos y la acción de reservar habilitada

#### Scenario: Ficha de un libro ya vendido

- **WHEN** un visitante abre la ficha de un libro vendido
- **THEN** ve sus datos con la marca de no disponible y sin acción de reservar

#### Scenario: URL de un libro inexistente

- **WHEN** un visitante abre la URL de un libro que no existe o fue dado de baja
- **THEN** el sistema muestra una página de no encontrado con un enlace de vuelta al catálogo

#### Scenario: Compartir la ficha

- **WHEN** alguien pega la URL de una ficha en WhatsApp
- **THEN** la previsualización muestra el título y la imagen del libro
