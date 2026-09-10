-- Índices de las rutas calientes.

-- Catálogo público: filtra por publicado/estado y ordena por fecha de ingreso.
CREATE INDEX idx_libros_catalogo ON libros (dado_de_baja, creado_en DESC);
CREATE INDEX idx_libros_estado ON libros (estado);

-- Búsqueda por texto sobre las columnas normalizadas.
CREATE INDEX idx_libros_titulo_norm ON libros (titulo_norm);
CREATE INDEX idx_libros_autor_norm ON libros (autor_norm);

-- Filtro por género del catálogo.
CREATE INDEX idx_libros_genero ON libros (genero);

-- Consulta de una reserva por folio y listado por estado en el backoffice.
CREATE INDEX idx_reservas_estado ON reservas (estado, creado_en DESC);

-- Recorrido de una reserva hacia sus libros y de un libro hacia sus reservas
-- activas (la baja de un libro necesita saber si alguna lo bloquea).
CREATE INDEX idx_reserva_items_libro ON reserva_items (libro_id);
CREATE INDEX idx_reserva_eventos_reserva ON reserva_eventos (reserva_id, creado_en);

-- Detección de coincidencias sobre las solicitudes abiertas.
CREATE INDEX idx_solicitudes_estado ON solicitudes (estado);
CREATE INDEX idx_solicitud_coincidencias_solicitud ON solicitud_coincidencias (solicitud_id);

-- Ventana de rate limiting.
CREATE INDEX idx_intentos_ingreso_ventana ON intentos_ingreso (ip_hash, creado_en);
