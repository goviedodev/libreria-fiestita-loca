-- Esquema inicial de Librería Fiestita Loca.
--
-- Cada fila de `libros` es un ejemplar, no un SKU con cantidad: la librería es de
-- usados y casi todo su inventario es de copia única. Por eso el estado vive en el
-- libro y no hay columna de stock.

CREATE TABLE libros (
	id             TEXT    PRIMARY KEY,
	isbn           TEXT,
	titulo         TEXT    NOT NULL,
	autor          TEXT    NOT NULL,
	-- Copias sin tildes y en minúsculas: SQLite no trae unaccent, así que la
	-- búsqueda insensible a diacríticos se resuelve con estas columnas.
	titulo_norm    TEXT    NOT NULL,
	autor_norm     TEXT    NOT NULL,
	editorial      TEXT,
	anio           INTEGER,
	genero         TEXT,
	sinopsis       TEXT,
	condicion      TEXT    NOT NULL CHECK (condicion IN ('nuevo', 'usado')),
	-- Pesos chilenos, sin decimales.
	precio         INTEGER NOT NULL CHECK (precio > 0),
	estado         TEXT    NOT NULL DEFAULT 'disponible'
	                       CHECK (estado IN ('disponible', 'reservado', 'vendido')),
	-- Claves en R2. `imagen_clave` es la portada traída de la fuente bibliográfica;
	-- `foto_clave` es la foto del ejemplar real y tiene prioridad al mostrarse.
	imagen_clave   TEXT,
	foto_clave     TEXT,
	dado_de_baja   INTEGER NOT NULL DEFAULT 0 CHECK (dado_de_baja IN (0, 1)),
	creado_en      TEXT    NOT NULL,
	actualizado_en TEXT    NOT NULL
);

CREATE TABLE reservas (
	id             TEXT    PRIMARY KEY,
	folio          TEXT    NOT NULL UNIQUE,
	nombre         TEXT    NOT NULL,
	telefono       TEXT    NOT NULL,
	nota           TEXT,
	estado         TEXT    NOT NULL DEFAULT 'pendiente'
	                       CHECK (estado IN ('pendiente', 'pagado', 'entregado', 'cancelado')),
	total          INTEGER NOT NULL CHECK (total >= 0),
	creado_en      TEXT    NOT NULL,
	actualizado_en TEXT    NOT NULL
);

-- El precio queda congelado al momento de reservar: si el dueño cambia el precio
-- del libro después, el histórico de la reserva no se altera.
CREATE TABLE reserva_items (
	reserva_id TEXT    NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
	libro_id   TEXT    NOT NULL REFERENCES libros(id),
	precio     INTEGER NOT NULL CHECK (precio > 0),
	PRIMARY KEY (reserva_id, libro_id)
);

CREATE TABLE reserva_eventos (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	reserva_id TEXT NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
	estado     TEXT NOT NULL,
	creado_en  TEXT NOT NULL
);

-- Wishlist: lo que un cliente buscó y no encontró.
CREATE TABLE solicitudes (
	id          TEXT PRIMARY KEY,
	titulo      TEXT,
	autor       TEXT,
	titulo_norm TEXT,
	autor_norm  TEXT,
	telefono    TEXT NOT NULL,
	estado      TEXT NOT NULL DEFAULT 'abierta'
	                 CHECK (estado IN ('abierta', 'avisada', 'cerrada')),
	creado_en   TEXT NOT NULL,
	CHECK (titulo IS NOT NULL OR autor IS NOT NULL)
);

-- Una solicitud puede coincidir con varios libros y un libro con varias
-- solicitudes, así que la relación es propia y no una columna en `solicitudes`.
CREATE TABLE solicitud_coincidencias (
	solicitud_id TEXT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
	libro_id     TEXT NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
	creado_en    TEXT NOT NULL,
	PRIMARY KEY (solicitud_id, libro_id)
);

-- Ventana de contención de fuerza bruta del ingreso al backoffice. Se guarda el
-- hash del IP, nunca el IP.
CREATE TABLE intentos_ingreso (
	id        INTEGER PRIMARY KEY AUTOINCREMENT,
	ip_hash   TEXT NOT NULL,
	creado_en TEXT NOT NULL
);
