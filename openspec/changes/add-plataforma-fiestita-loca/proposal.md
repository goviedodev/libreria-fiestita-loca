## Why

Fiestita Loca es una librería de usados con años en Limache que hoy vende mandando fotos de sus
estanterías por Instagram y WhatsApp: cada consulta ("¿tienes tal libro?") obliga al dueño a
revisar físicamente el stock y responder a mano. En una librería de usados casi todo el inventario
es de copia única, así que sin un catálogo consultable no hay forma de escalar la atención ni de
saber qué está reservado, pagado o entregado.

Este cambio construye la base digital del negocio sobre el stack que ya tiene el proyecto
(React + Vite + Hono + Cloudflare Workers + D1), sin sacar al dueño de los canales donde ya está
su clientela: la web es el escaparate consultable y WhatsApp sigue siendo el cierre de la venta.

## What Changes

- **Catálogo público** con buscador por título/autor/ISBN y filtros por género, condición
  (nuevo/usado) y disponibilidad; ficha por libro con URL propia compartible.
- **Ingesta de inventario por ISBN**: el dueño escanea o escribe el ISBN desde el navegador del
  teléfono y el Worker consulta Google Books y OpenLibrary para prellenar título, autor, año,
  género, sinopsis y portada. El dueño solo confirma precio y condición.
- **Foto real del ejemplar**: en usados el estado importa, así que además de la portada de la API
  se puede subir una foto propia del ejemplar a un bucket R2.
- **Reserva vía WhatsApp**: el cliente arma una reserva de uno o varios libros y el sistema la
  persiste en D1 y abre WhatsApp con un mensaje prearmado que incluye el folio y los enlaces de
  cada libro. Sin pasarela de pagos.
- **Backoffice de pedidos**: panel para mover reservas entre `pendiente → pagado → entregado`
  (o `cancelado`), con el stock del libro reflejando el estado.
- **Acceso al backoffice** protegido por un token compartido guardado como secret del Worker.
- **Alertas de búsqueda (wishlist)**: si un cliente pide algo que no está en stock, queda
  registrado; cuando ingresa un libro que hace match por autor/título, el backoffice muestra el
  aviso con un enlace `wa.me` prearmado para que el dueño lo envíe con un clic.
- **Novedades para Instagram**: vista que arma las piezas 1080×1920 de los libros ingresados en la
  semana, con el texto listo para copiar, y las exporta como imágenes descargables.
- **Nueva infraestructura**: base de datos D1 con migraciones, bucket R2 para fotos, y secrets del
  Worker. El template de demo (`App.tsx` con logos, `GET /api/` devolviendo `{name}`) se reemplaza.

**BREAKING**: no aplica — el proyecto está en el estado inicial del template, sin consumidores.

## Capabilities

### New Capabilities

- `inventario-libros`: modelo del libro (ISBN, título, autor, género, condición, precio, estado de
  stock, portada, foto del ejemplar), ingesta por ISBN con enriquecimiento desde fuentes externas,
  alta manual para libros sin ISBN, edición y baja.
- `catalogo-publico`: navegación, búsqueda y filtrado del catálogo por parte de cualquier visitante,
  y ficha de detalle de un libro.
- `reservas-whatsapp`: armado de una reserva por parte del cliente, persistencia con folio y
  handoff a WhatsApp con mensaje prearmado.
- `gestion-pedidos`: backoffice de reservas — listado, cambio de estado, efecto sobre la
  disponibilidad del libro y trazabilidad de cobranzas.
- `acceso-backoffice`: autenticación por token compartido y protección de todos los endpoints y
  vistas de administración.
- `alertas-busqueda`: registro de libros buscados y no encontrados, y notificación al dueño cuando
  ingresa inventario que hace match.
- `contenido-novedades`: generación de las piezas gráficas y el texto de las novedades semanales
  para publicar en Instagram.

### Modified Capabilities

Ninguna — no existen specs previas en `openspec/specs/`.

## Impact

**Código**
- `src/worker/index.ts`: pasa de un único `GET /api/` a un router Hono con las rutas públicas
  (`/api/libros`, `/api/reservas`, `/api/busquedas`) y las de administración bajo `/api/admin/*`.
- `src/react-app/`: se reemplaza la demo del template por el catálogo público y el backoffice.
- Se agregan migraciones SQL de D1 y tipos compartidos entre cliente y worker.

**Infraestructura Cloudflare** (cuenta `gonzalo.oviedo.dev@gmail.com`)
- Nuevo binding D1 (`DB`) en `wrangler.json` + base creada con `wrangler d1 create`.
- Nuevo binding R2 (`FOTOS`) para las fotos de ejemplares.
- Secrets del Worker: `ADMIN_TOKEN` y el número de WhatsApp del negocio.
- `worker-configuration.d.ts` se regenera con `npm run cf-typegen` tras agregar los bindings.

**Dependencias externas**
- Google Books API y OpenLibrary (ambas gratuitas, sin API key para el uso previsto), consumidas
  desde el Worker y no desde el navegador.
- WhatsApp se integra por enlaces `wa.me`, **no** por la WhatsApp Business API: mantiene el costo
  operativo en cero y evita el proceso de aprobación de Meta. El envío de las alertas queda como
  una acción de un clic del dueño, no como un envío automático.

**Riesgos**
- El token compartido es más débil que un login con sesiones: si se filtra, expone la escritura del
  inventario. Se mitiga con cookie `HttpOnly`, rate limiting en el login y rotación por
  `wrangler secret put`. Migrar a sesiones por usuario queda como cambio futuro.
- Las APIs de metadatos no cubren libros antiguos o sin ISBN; por eso el alta manual es parte del
  alcance y no un extra.

**Fuera de alcance**
- Pasarela de pagos, despacho y cálculo de envíos.
- Publicación automática en Instagram (requiere la Graph API con cuenta business aprobada).
- Multi-tienda o múltiples usuarios administradores.
