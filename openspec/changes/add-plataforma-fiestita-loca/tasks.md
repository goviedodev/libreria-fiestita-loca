## 1. Infraestructura Cloudflare y andamiaje

- [x] 1.1 Crear la base D1 con `npx wrangler d1 create libreria-fiestita-loca` y agregar el binding `DB` a `wrangler.json`; verificar que `npx wrangler d1 info libreria-fiestita-loca` devuelve la base
- [x] 1.2 Crear el bucket con `npx wrangler r2 bucket create fiestita-loca-imagenes` y agregar el binding `IMAGENES` a `wrangler.json`; verificar con `npx wrangler r2 bucket list`
- [x] 1.3 Definir los secrets `ADMIN_TOKEN`, `SESSION_SECRET` y `WHATSAPP_NUMERO` con `wrangler secret put`, crear `.dev.vars` con los valores locales y agregarlo a `.gitignore`; verificar que `git status` no lista `.dev.vars`
- [x] 1.4 Regenerar los tipos con `npm run cf-typegen` y verificar que `Env` en `worker-configuration.d.ts` incluye `DB`, `IMAGENES` y los tres secrets
- [x] 1.5 Crear `src/shared/` e incluirlo en `tsconfig.app.json` y `tsconfig.worker.json`; verificar que `npm run build` compila con un tipo importado desde `src/shared` en ambos lados
- [x] 1.6 Instalar `zod` y las dependencias de enrutado del cliente; verificar que `npm run build` sigue verde
- [x] 1.7 Instalar y configurar Vitest con `@cloudflare/vitest-pool-workers` apuntando a la D1 local, agregar el script `test` y verificar que una prueba trivial pasa con `npm test`
- [x] 1.8 Reemplazar la demo del template (`App.tsx` con logos y el `GET /api/` de ejemplo) por el esqueleto de la aplicación con su enrutado; verificar que `npm run dev` levanta el nuevo esqueleto sin restos de la demo

## 2. Esquema de datos y capa de acceso

- [x] 2.1 Escribir la migración inicial con las tablas `libros`, `reservas`, `reserva_items`, `reserva_eventos`, `solicitudes` e `intentos_ingreso` según `design.md` §14; verificar con `wrangler d1 migrations apply --local` seguido de `wrangler d1 execute --local --command ".tables"`
- [x] 2.2 Agregar los índices sobre `libros(estado, creado_en)`, `libros(titulo_norm)`, `libros(autor_norm)`, `reservas(folio)` y `reservas(estado)`; verificar con `EXPLAIN QUERY PLAN` que la consulta del catálogo usa el índice
- [x] 2.3 Definir en `src/shared/` los tipos y esquemas Zod de libro, reserva, solicitud y sus estados; verificar con pruebas unitarias de los esquemas sobre entradas válidas e inválidas
- [x] 2.4 Implementar `src/worker/datos/libros.ts` con las operaciones de lectura y escritura de libros; verificar con pruebas contra la D1 efímera del pool de Workers
- [x] 2.5 Implementar `src/worker/datos/reservas.ts` con creación y cambio de estado usando `db.batch()`; verificar con pruebas que un fallo a mitad del batch no deja nada escrito
- [x] 2.6 Implementar el middleware de manejo de errores que traduce fallos de validación y de dominio a respuestas con formato uniforme; verificar que un cuerpo inválido devuelve el error de campo esperado

## 3. Acceso al backoffice (capacidad `acceso-backoffice`)

- [x] 3.1 Implementar la comparación en tiempo constante del token y la emisión de la cookie de sesión firmada con HMAC según `design.md` §10; verificar con pruebas que la cookie sale con `HttpOnly`, `Secure` y `SameSite=Strict`
- [x] 3.2 Implementar el middleware que valida firma y expiración de la sesión; verificar con pruebas que una cookie manipulada, vencida o ausente se rechaza como no autorizada
- [x] 3.3 Implementar el rate limiting de ingreso sobre `intentos_ingreso` (5 fallos / 15 minutos); verificar con una prueba que el sexto intento en la ventana se rechaza
- [x] 3.4 Montar la subaplicación `/api/admin/*` detrás del middleware de sesión y el endpoint de cierre de sesión; verificar con pruebas que toda ruta admin sin sesión responde no autorizada y que las rutas públicas siguen abiertas
- [x] 3.5 Verificar que ningún camino de error registra el token entregado, revisando los logs producidos por las pruebas de intento fallido
- [x] 3.6 Construir la pantalla de ingreso al backoffice y la protección de sus rutas en el cliente; verificar entrando con token correcto e incorrecto contra el Worker local

## 4. Inventario y enriquecimiento por ISBN (capacidad `inventario-libros`)

- [x] 4.1 Implementar la validación del dígito verificador de ISBN-10 e ISBN-13 y la normalización del ISBN; verificar con pruebas unitarias de casos válidos e inválidos conocidos
- [x] 4.2 Implementar `servicios/isbn.ts` consultando Google Books con respaldo en OpenLibrary, con validación Zod de las respuestas, `AbortSignal.timeout(5000)` y caché de 30 días con la Cache API; verificar con pruebas de las respuestas simuladas de ambas fuentes y del caso sin resultados
- [x] 4.3 Implementar la normalización sin tildes de título y autor y su escritura en las columnas `_norm`; verificar con pruebas que `Allendé`, `allende` y `ALLENDE` producen el mismo valor normalizado
- [x] 4.4 Implementar los endpoints de alta, edición, baja lógica y consulta de metadatos por ISBN bajo `/api/admin/libros`; verificar con pruebas los escenarios de la spec, incluida la baja bloqueada por reserva activa
- [x] 4.5 Implementar `servicios/fotos.ts`: descarga de la portada externa a R2 al crear el libro, subida de la foto del ejemplar con validación de tipo y tamaño por contenido, y reemplazo de la imagen anterior; verificar con pruebas de JPEG válido, PDF rechazado y archivo de más de 5 MB
- [x] 4.6 Implementar `GET /api/imagenes/:clave` sirviendo desde R2 con `Cache-Control: public, max-age=31536000, immutable`; verificar que la respuesta trae la cabecera y el tipo correctos
- [x] 4.7 Construir la pantalla de ingesta del backoffice con el campo de ISBN, el prellenado editable y los campos de precio y condición; verificar ingresando un libro real por ISBN contra el Worker local
- [x] 4.8 Agregar el escaneo con `BarcodeDetector` sobre la cámara, con caída limpia al campo manual donde la API no exista; verificar en un navegador con soporte y en uno sin soporte
- [x] 4.9 Construir el alta manual para libros sin ISBN y la edición y baja de libros existentes; verificar dando de alta un libro sin ISBN y editando su precio

## 5. Catálogo público (capacidad `catalogo-publico`)

- [x] 5.1 Implementar `GET /api/libros` con paginación de 24 por página, orden por fecha de ingreso descendente y exclusión de los dados de baja; verificar con pruebas de la paginación y del catálogo vacío
- [x] 5.2 Agregar a ese endpoint la búsqueda por texto sobre título, autor e ISBN usando las columnas normalizadas; verificar con pruebas de búsqueda por autor sin tildes y por título parcial
- [x] 5.3 Agregar los filtros por género, condición y disponibilidad, los tres órdenes y el total de resultados; verificar con pruebas de filtros combinados y de filtro sobre una búsqueda
- [x] 5.4 Implementar `GET /api/libros/:id` para la ficha, devolviendo no encontrado para un libro inexistente o dado de baja; verificar con pruebas de ambos casos
- [x] 5.5 Construir la vista de listado con imagen, título, autor, condición, precio y disponibilidad, y el marcador de posición cuando no hay imagen; verificar visualmente con libros con y sin imagen
- [x] 5.6 Conectar búsqueda, filtros y orden a los parámetros de la URL; verificar que copiar y reabrir la URL reproduce la misma consulta
- [x] 5.7 Construir la ficha de detalle con su acción de reservar según disponibilidad y la página de no encontrado; verificar abriendo un libro disponible, uno vendido y un id inexistente
- [x] 5.8 Agregar los metadatos de previsualización de la ficha para que al compartir la URL se vean título e imagen; verificar la respuesta del Worker para la ruta de una ficha

## 6. Reservas y handoff a WhatsApp (capacidad `reservas-whatsapp`)

- [x] 6.1 Implementar la generación del folio `FL-XXXXX` con alfabeto sin caracteres ambiguos y reintento ante colisión; verificar con pruebas del formato y del reintento con un `UNIQUE` forzado
- [x] 6.2 Implementar la validación del teléfono chileno en `src/shared/`; verificar con pruebas de números válidos e inválidos en sus distintos formatos de escritura
- [x] 6.3 Implementar `POST /api/reservas` con el `batch()` que crea reserva e items y bloquea los libros con `UPDATE ... WHERE estado = 'disponible'`, verificando `meta.changes`; verificar con pruebas de reserva exitosa, reserva vacía, teléfono inválido y conflicto por libro ya reservado
- [x] 6.4 Implementar `GET /api/reservas/:folio` para la consulta pública, ocultando el teléfono salvo sus últimos dígitos; verificar con pruebas de folio válido e inexistente
- [x] 6.5 Implementar la selección de libros en el cliente con persistencia en el navegador y recálculo del total; verificar agregando libros, recargando la página y quitando uno
- [x] 6.6 Implementar el armado del mensaje de WhatsApp con folio, libros, URL de cada ficha y total, correctamente codificado, usando el número configurado; verificar con pruebas del texto generado con tildes y saltos de línea
- [x] 6.7 Construir el formulario de reserva y el handoff a WhatsApp, dejando la reserva registrada aunque el cliente no envíe el mensaje; verificar creando una reserva y comprobando que aparece pendiente en la base
- [x] 6.8 Construir la vista pública de consulta por folio; verificar consultando un folio creado en el paso anterior

## 7. Backoffice de pedidos (capacidad `gestion-pedidos`)

- [x] 7.1 Implementar la máquina de transiciones de estado con las cuatro transiciones permitidas y los dos estados finales; verificar con pruebas unitarias de cada transición permitida y de las rechazadas
- [x] 7.2 Implementar el cambio de estado como `batch()` que actualiza reserva, registra el evento y ajusta el estado de los libros (entrega vende, cancelación libera); verificar con pruebas de los efectos sobre el stock y de la atomicidad ante fallo
- [x] 7.3 Implementar `GET /api/admin/reservas` con filtro por estado, búsqueda por folio, nombre o teléfono, orden por fecha y la marca de pendientes con más de 7 días; verificar con pruebas de cada filtro
- [x] 7.4 Implementar `GET /api/admin/reservas/:folio` con datos del cliente, items con precio congelado, total e historial de estados; verificar con una prueba del detalle completo
- [x] 7.5 Implementar `GET /api/admin/resumen` con totales de inventario, reservas por estado y monto pendiente de cobro; verificar con pruebas del resumen poblado y del negocio sin movimientos
- [x] 7.6 Construir el listado de pedidos con sus filtros, búsqueda y el destacado de pendientes antiguos; verificar contra datos de prueba en la D1 local
- [x] 7.7 Construir el detalle de la reserva con las acciones de cambio de estado y el enlace de contacto por WhatsApp; verificar recorriendo el ciclo pendiente → pagado → entregado y comprobando el stock resultante
- [x] 7.8 Construir la vista de resumen del negocio; verificar que los totales coinciden con los datos de prueba

## 8. Alertas de búsqueda (capacidad `alertas-busqueda`)

- [x] 8.1 Implementar `POST /api/solicitudes` con la exigencia de título o autor más teléfono válido y la deduplicación de solicitudes abiertas iguales; verificar con pruebas de alta, datos insuficientes y solicitud repetida
- [x] 8.2 Implementar la detección de coincidencias por autor o título normalizados al dar de alta un libro, sin bloquear el alta si falla; verificar con pruebas de coincidencia por autor, por título parcial, sin coincidencias y con la detección fallando
- [x] 8.3 Implementar `GET /api/admin/alertas` y el cambio de estado de una solicitud a `avisada` o `cerrada`; verificar con pruebas de listado y de cierre
- [x] 8.4 Implementar el armado del mensaje de aviso con el libro y la URL de su ficha; verificar con una prueba del texto generado
- [x] 8.5 Conectar el registro de la solicitud a la búsqueda sin resultados del catálogo público; verificar buscando un término inexistente y dejando el teléfono
- [x] 8.6 Construir la vista de avisos pendientes del backoffice con el enlace de WhatsApp y las acciones de marcar avisada o cerrada; verificar que no se envía ningún mensaje sin acción del dueño

## 9. Novedades para Instagram (capacidad `contenido-novedades`)

- [x] 9.1 Implementar `GET /api/admin/novedades` por rango de fechas con 7 días por defecto, excluyendo vendidos y dados de baja; verificar con pruebas del rango por defecto, un rango personalizado y un período sin ingresos
- [x] 9.2 Implementar la generación en canvas de la pieza 1080×1920 con imagen, título, autor, precio y nombre de la librería, y el fondo de respaldo para libros sin imagen; verificar que `toBlob` no falla, lo que confirma que las imágenes servidas desde R2 no contaminan el canvas
- [x] 9.3 Implementar la descarga individual y en tanda de las piezas con nombres de archivo que identifiquen al libro; verificar descargando una pieza y un conjunto
- [x] 9.4 Implementar la generación del texto de la publicación, editable y copiable al portapapeles; verificar copiando el texto original y uno editado
- [x] 9.5 Construir la vista de novedades con la selección y el orden de los libros; verificar generando una tanda de cinco libros de prueba

## 10. Cierre y despliegue

- [x] 10.1 Revisar el tamaño del bundle del catálogo contra el presupuesto de 150 KB gzip y cargar el backoffice con `import()` dinámico; verificar con la salida de `vite build`
- [x] 10.2 Verificar la accesibilidad y el comportamiento responsivo del catálogo y de la ingesta en 320, 768 y 1440 px; verificar en el navegador contra el Worker local
- [x] 10.3 Ejecutar la suite completa y confirmar cobertura de al menos 80%; verificar con `npm test` y el reporte de cobertura
- [x] 10.4 Ejecutar `npm run lint` y `npm run check` y dejar ambos en verde
- [x] 10.5 Aplicar las migraciones en remoto con `wrangler d1 migrations apply libreria-fiestita-loca --remote` y verificar las tablas creadas
- [ ] 10.6 Desplegar con `npm run deploy` y verificar en la URL pública: catálogo visible, ingesta de un libro por ISBN, reserva con handoff a WhatsApp y cambio de estado hasta entregado
- [x] 10.7 Actualizar `README.md` y `CLAUDE.md` con los bindings, secrets y comandos de migración del proyecto; verificar que un lector puede levantar el proyecto desde cero siguiendo esas instrucciones
