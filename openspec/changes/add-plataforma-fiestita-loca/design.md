## Context

Ver `proposal.md — Why` para la motivación. Restricciones que condicionan el diseño:

- **Stack fijo**: React 19 + Vite + Hono sobre Cloudflare Workers, D1 como base de datos. No se
  incorporan frameworks alternativos ni backends adicionales. El `negocio.md` original sugería
  Vue o Flutter para algunas piezas; esas ideas se implementan aquí dentro del stack existente.
- **Punto de partida**: el repo está en el estado del template `vite-react-template`. `App.tsx` es
  la demo de logos y `src/worker/index.ts` expone un único `GET /api/`. No hay base de datos,
  bindings, router, ni framework de pruebas.
- **Cuenta Cloudflare**: `gonzalo.oviedo.dev@gmail.com` (account `0e7c015c…95c8`), autenticada por
  OAuth en `wrangler`. El plan de la cuenta determina los límites de D1 y R2.
- **Costo operativo objetivo: cero.** Es un negocio de barrio. Todo debe caber en los planes
  gratuitos y evitar servicios de pago o procesos de aprobación (Meta, pasarelas).
- **Un solo usuario administrador**, que trabaja desde el navegador de su teléfono. La ingesta
  ocurre de pie frente a la estantería, con una mano.
- **Inventario de copia única**: cada libro es un ejemplar, no un SKU con cantidad. Esto define
  todo el modelo de datos y la concurrencia de las reservas.

## Goals / Non-Goals

**Goals:**

- Un único Worker sirve el SPA y la API; un solo `wrangler deploy` despliega todo.
- Esquema de D1 versionado por migraciones desde el primer día.
- Ingesta de un libro en menos de 30 segundos y sin teclear datos bibliográficos.
- Consistencia entre el estado de una reserva y el de sus libros, sin estados intermedios visibles.
- Superficie de administración estrecha y verificada en el servidor en cada petición.

**Non-Goals:**

- Multi-tenant, multi-usuario o roles. Un solo dueño, un solo token.
- Escalar más allá del orden de magnitud de una librería de barrio (miles de libros, decenas de
  reservas por semana). Las decisiones optimizan simplicidad sobre escala.
- Búsqueda semántica, recomendaciones o embeddings.
- Modo offline o sincronización local.

## Decisions

### 1. Un Worker único sirve SPA y API

`wrangler.json` ya tiene `assets.not_found_handling: "single-page-application"`. El Worker atiende
`/api/*` y todo lo demás cae en el SPA. El `@cloudflare/vite-plugin` corre el mismo Worker en
desarrollo, así que dev y producción comparten comportamiento.

*Alternativa considerada*: Cloudflare Pages + Worker separado (lo que sugería el `negocio.md`). Se
descarta: son dos despliegues, dos orígenes y CORS entre ellos, sin ninguna ventaja aquí.

### 2. Estructura por dominio bajo `src/`

```
src/
├── shared/            # tipos y esquemas de validación compartidos cliente/worker
│   ├── libro.ts
│   ├── reserva.ts
│   └── validacion.ts
├── worker/
│   ├── index.ts       # composición del router Hono
│   ├── rutas/         # publicas.ts, admin-libros.ts, admin-reservas.ts, auth.ts, ...
│   ├── datos/         # acceso a D1, una función por operación
│   ├── servicios/     # isbn.ts (Google Books/OpenLibrary), fotos.ts (R2), folio.ts
│   └── middleware/    # sesion.ts, rate-limit.ts, errores.ts
└── react-app/
    ├── catalogo/      # listado, búsqueda, filtros, ficha
    ├── reserva/       # selección, formulario, handoff WhatsApp
    ├── backoffice/    # ingesta, pedidos, alertas, novedades
    └── ui/            # componentes compartidos
```

Los tipos viven en `src/shared/` y los importan ambos lados: un cambio de contrato rompe la
compilación en vez de romper en producción. Requiere agregar `src/shared` a `tsconfig.app.json` y
`tsconfig.worker.json`.

### 3. Validación con Zod en el borde

Toda entrada externa (cuerpos de petición, parámetros de consulta, respuestas de las APIs
bibliográficas) se valida con esquemas Zod definidos en `src/shared/`. El mismo esquema valida el
formulario en el cliente y la petición en el Worker.

*Alternativa considerada*: validación a mano. Se descarta: con siete capacidades y formularios en
ambos lados, la duplicación y el riesgo de divergencia superan el peso de la dependencia (Zod pesa
poco y hace *tree-shaking*).

### 4. Consistencia sin transacciones interactivas: `db.batch()` + UPDATE condicional

D1 no ofrece `BEGIN/COMMIT` interactivo, pero `db.batch()` ejecuta un arreglo de sentencias como
una única transacción atómica. Todas las operaciones que tocan varias filas —crear una reserva,
cambiar su estado, cancelarla— se expresan como un `batch()`.

Para la concurrencia entre dos clientes que reservan el mismo ejemplar, el bloqueo se hace con un
UPDATE condicional y se verifica el efecto:

```sql
UPDATE libros SET estado = 'reservado' WHERE id = ? AND estado = 'disponible'
```

Si `meta.changes` no es el número de libros esperado, el batch completo se descarta y la reserva se
rechaza con el aviso de "ese libro ya no está disponible". Esto satisface el escenario de conflicto
de `reservas-whatsapp` sin bloqueos ni reintentos.

*Alternativa considerada*: un Durable Object como serializador de reservas. Se descarta por
complejidad desproporcionada al volumen esperado.

### 5. Estado del libro como columna, no derivado por consulta

`libros.estado` (`disponible` / `reservado` / `vendido`) es una columna denormalizada que el mismo
`batch()` mantiene sincronizada con el estado de las reservas. El catálogo público es la ruta más
leída; leer el estado directo evita un `JOIN` con reservas en cada consulta.

*Alternativa considerada*: derivar el estado de las reservas activas. Es la opción normalizada pero
paga el `JOIN` en la lectura caliente, y la atomicidad del `batch()` ya garantiza que la columna no
se desincronice.

### 6. Búsqueda sin tildes con columnas normalizadas

SQLite en D1 no trae `unaccent` ni `COLLATE` insensible a diacríticos. Al escribir un libro se
guardan además `titulo_norm` y `autor_norm`, calculadas con
`str.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()`. La búsqueda normaliza el
término de la misma forma y consulta con `LIKE '%term%'` sobre esas columnas, indexadas.

*Alternativa considerada*: FTS5, disponible en D1. Se descarta por ahora: exige tabla virtual y
*triggers* de sincronización, y `LIKE` sobre un índice rinde de sobra en el orden de los miles de
filas. Si el catálogo crece, migrar a FTS5 es un cambio posterior contenido en la capa `datos/`.

### 7. Enriquecimiento por ISBN: Google Books primero, OpenLibrary de respaldo

La consulta corre en el Worker, nunca en el navegador: evita CORS, no expone las fuentes y permite
cachear. Se consulta Google Books (`/books/v1/volumes?q=isbn:…`) y, si no hay resultado, OpenLibrary
(`/api/books?bibkeys=ISBN:…`). Cada respuesta se valida con Zod antes de usarse: son datos externos.

Las respuestas se cachean con la **Cache API** del Worker con TTL de 30 días, con la URL de consulta
normalizada como clave. Ambas peticiones llevan `AbortSignal.timeout(5000)`; si las dos fallan o
expiran, la respuesta indica que el enriquecimiento no está disponible y el cliente conserva lo que
el dueño ya escribió, según pide la spec.

El dígito verificador del ISBN se valida en el Worker **antes** de salir a la red.

### 8. Escáner de código de barras: `BarcodeDetector` nativa con respaldo manual

El escaneo usa la API `BarcodeDetector` del navegador (disponible en Chrome Android, el caso de uso
real) sobre un `<video>` con `getUserMedia`. Donde no exista, la interfaz cae al campo de ISBN
manual sin bloquear nada. El campo manual siempre está disponible.

*Alternativa considerada*: una app Flutter aparte, como proponía el `negocio.md`. Se descarta:
saldría del stack, exigiría publicación en la tienda y otro ciclo de despliegue. El navegador ya da
acceso a la cámara.
*Alternativa considerada*: `zxing-wasm` como polyfill. Se deja anotado para después si hace falta;
no se carga por defecto para no pagar el WASM en cada visita.

### 9. Imágenes: todas en R2, incluidas las portadas externas

Al crear un libro, si la fuente bibliográfica devolvió una URL de portada, el Worker **descarga esa
imagen y la guarda en R2** en vez de guardar la URL. Esto resuelve tres cosas a la vez:

1. La portada no desaparece si la fuente cambia o borra la imagen.
2. No se hace *hotlinking* a un tercero desde el catálogo.
3. **Habilita la generación de las piezas de Instagram**: `canvas.toBlob()` falla sobre un canvas
   contaminado por una imagen de otro origen. Sirviendo todas las imágenes desde el propio dominio,
   el problema desaparece.

Las imágenes se sirven por `GET /api/imagenes/:clave` con `Cache-Control: public, max-age=31536000,
immutable` y clave con *hash* de contenido. La subida de la foto del ejemplar valida tipo y tamaño
por el contenido del archivo, no solo por el `Content-Type` declarado.

*Alternativa considerada*: bucket R2 con dominio público. Se descarta: exige configurar un dominio
adicional y quita el control de validación y cabeceras.

### 10. Sesión: cookie firmada con HMAC, sin tabla de sesiones

Al ingresar el token correcto, el Worker emite una cookie `HttpOnly`, `Secure`, `SameSite=Strict`
cuyo valor es `expiracion.firma`, con la firma HMAC-SHA256 calculada con Web Crypto sobre un
secreto del Worker. La verificación es una comprobación de firma y expiración: sin lecturas a D1 en
cada petición.

La comparación del token de ingreso se hace en tiempo constante (comparación de los *digest*
SHA-256 de ambos valores, no `===` sobre las cadenas).

*Alternativa considerada*: tabla `sesiones` en D1. Da revocación individual, pero con un único
usuario la revocación es rotar el secreto con `wrangler secret put`, que invalida todo al instante.
Se prefiere no pagar una lectura a D1 por petición.

*Riesgo asumido y decidido por el usuario*: un token compartido es más débil que un login con
usuarios. Ver Risks.

### 11. Rate limiting del ingreso en D1

La contención de fuerza bruta (5 fallos / 15 minutos) se lleva en una tabla `intentos_ingreso` con
el *hash* del IP de origen (`CF-Connecting-IP`) y una ventana temporal. Solo se escribe en los
fallos, así que el costo es despreciable. Se guarda el *hash* del IP, no el IP.

*Alternativa considerada*: un Durable Object o el Rate Limiting binding. Se descarta por ser una
pieza de infraestructura adicional para un endpoint que recibe unos pocos ingresos al mes.

### 12. Folio de reserva legible por teléfono

Formato `FL-XXXXX` con alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (sin `0`/`O`, `1`/`I`), generado
con `crypto.getRandomValues`. Unicidad garantizada por `UNIQUE` en la columna, con hasta 3
reintentos ante colisión. Son ~33 millones de combinaciones: de sobra, y se dicta por teléfono sin
ambigüedad.

### 13. Precios como enteros CLP

El peso chileno no tiene decimales. `precio` es `INTEGER`; nunca `REAL` ni cadena. El formateo a
`$12.990` ocurre solo en la presentación con `Intl.NumberFormat("es-CL")`.

### 14. Esquema de D1

Siete tablas, con migraciones en `migrations/` gestionadas por `wrangler d1 migrations`:

| Tabla | Rol |
|-------|-----|
| `libros` | el ejemplar: datos bibliográficos, condición, precio, estado, claves de imagen, columnas `_norm`, `creado_en` |
| `reservas` | folio, nombre, teléfono, nota, estado, `creado_en` |
| `reserva_items` | libro ↔ reserva, con el precio congelado al momento de reservar |
| `reserva_eventos` | historial de transiciones de estado con su fecha |
| `solicitudes` | wishlist: título/autor buscado, teléfono, estado |
| `solicitud_coincidencias` | relación solicitud ↔ libro: la spec admite varios libros por solicitud y varias solicitudes por libro, así que no cabe como columna en `solicitudes` |
| `intentos_ingreso` | ventana de rate limiting del backoffice |

`reserva_items` guarda el precio del momento: si el dueño cambia el precio de un libro después, el
histórico de la reserva no se altera. Índices sobre `libros(estado, creado_en)`,
`libros(titulo_norm)`, `libros(autor_norm)`, `reservas(folio)` y `reservas(estado)`.

### 15. Pruebas con Vitest y `@cloudflare/vitest-pool-workers`

El proyecto no tiene framework de pruebas. Se agrega Vitest con el *pool* de Workers, que corre las
pruebas dentro de `workerd` con una D1 real y efímera: las migraciones, los `batch()` y la
concurrencia de reservas se prueban de verdad, no contra un simulacro. Las utilidades puras
(normalización, validación de ISBN, folio, transiciones de estado) se prueban como unidades.

### 16. WhatsApp por enlaces `wa.me`, no por la Business API

Todo el contacto con clientes —reserva, aviso de coincidencia— se hace abriendo `wa.me` con el
mensaje ya codificado. No hay envío automático: siempre lo dispara una persona. Mantiene el costo
en cero y evita el proceso de aprobación de Meta. El número del negocio es un secreto del Worker,
expuesto al cliente en tiempo de ejecución por un endpoint de configuración pública.

## Risks / Trade-offs

- **Token compartido como única barrera del backoffice** → Es la opción elegida explícitamente. Se
  mitiga con cookie `HttpOnly` (el token no queda en `localStorage`), rate limiting, comparación en
  tiempo constante, y rotación con `wrangler secret put`. La ruta de salida es la decisión 10:
  cambiar el emisor de la cookie por un login con usuarios no toca ninguna otra capa.

- **La columna `libros.estado` puede desincronizarse si alguna operación escapa del `batch()`** →
  Toda escritura del estado pasa por la capa `datos/`, ninguna ruta arma SQL suelto. Las pruebas de
  transición cubren los cuatro cambios de estado y verifican el efecto sobre los libros.

- **Google Books y OpenLibrary no cubren libros antiguos, chilenos o sin ISBN** → Es el caso normal
  en usados, no la excepción. Por eso el alta manual es un requisito de primera clase y no un
  respaldo. El enriquecimiento acelera el caso fácil; nunca es obligatorio.

- **`BarcodeDetector` no existe en iOS Safari ni en Firefox** → El campo manual siempre está a la
  vista. El escaneo es una aceleración, no la única vía. Si el dueño usa iPhone, la ingesta sigue
  funcionando escribiendo el ISBN.

- **Almacenar todas las portadas en R2 aumenta el uso de almacenamiento** → A ~100 KB por imagen,
  10.000 libros son ~1 GB, dentro del plan gratuito. El beneficio (canvas sin contaminar,
  permanencia, sin *hotlinking*) lo compensa.

- **`LIKE '%term%'` no usa índice por el comodín inicial** → Con miles de filas el escaneo de tabla
  en D1 es imperceptible. El límite se documenta y FTS5 queda como la migración prevista, contenida
  en `datos/`.

- **El rate limiting por *hash* de IP castiga a usuarios tras NAT compartido** → Afecta solo al
  endpoint de ingreso del backoffice, que usa una persona. Sin impacto en el catálogo público.

- **Se agregan dos dependencias al cliente (Zod, router)** → Ver `rules/web/performance.md`: el
  presupuesto de una página de catálogo es < 150 KB gzip. Se verifica el tamaño del *bundle* al
  cerrar el cambio; el backoffice se carga con `import()` dinámico para no pesar sobre el visitante
  que solo mira el catálogo.

## Migration Plan

No hay datos previos ni usuarios: el despliegue es una instalación limpia.

1. `npx wrangler d1 create libreria-fiestita-loca` y agregar el binding `DB` a `wrangler.json`.
2. `npx wrangler r2 bucket create fiestita-loca-imagenes` y agregar el binding `IMAGENES`.
3. `npm run cf-typegen` para regenerar `worker-configuration.d.ts` con los bindings tipados.
4. `npx wrangler secret put ADMIN_TOKEN`, `SESSION_SECRET` y `WHATSAPP_NUMERO`.
   Para desarrollo local, los mismos valores en `.dev.vars`, que debe quedar en `.gitignore`.
5. `npx wrangler d1 migrations apply libreria-fiestita-loca --local` y luego `--remote`.
6. `npm run check` y `npm run deploy`.
7. Carga inicial: el dueño ingresa sus primeros libros por ISBN. No hay importación masiva en este
   cambio.

**Rollback**: `npx wrangler rollback` revierte el Worker. Las migraciones de D1 son aditivas en este
cambio (solo `CREATE TABLE`), así que un rollback del código no deja el esquema inconsistente.

## Open Questions

- **Nombre de dominio**. Mientras tanto sirve el subdominio `*.workers.dev`. Elegir y conectar un
  dominio propio no cambia specs, arquitectura ni tareas: es configuración de despliegue.
- **Lista de géneros**. Se parte con texto libre sugerido por la fuente bibliográfica. Si la
  dispersión hace inservible el filtro, normalizar a un catálogo cerrado es un ajuste posterior.
- **Retención de reservas abandonadas**. Se destacan a los 7 días (spec `gestion-pedidos`), pero no
  se liberan solas. Si se acumulan, agregar una expiración automática es un cambio aparte.
