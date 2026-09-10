# Librería Fiestita Loca

Catálogo web y backoffice de una librería de usados en Limache. Corre entero sobre
Cloudflare Workers: React + Vite en el cliente, Hono en el Worker, D1 para los datos y
R2 para las imágenes.

## Qué hace

**Para quien visita** — un catálogo público con búsqueda, filtros y ficha por libro; una
selección que sobrevive a las recargas; y una reserva que termina abriendo WhatsApp con
el pedido ya escrito. Si lo que busca no está, deja su teléfono y le avisamos cuando
llegue.

**Para quien atiende** — ingesta de libros escaneando el código de barras o por ISBN,
con los datos bibliográficos traídos de Google Books u OpenLibrary; gestión de pedidos
con sus estados; los avisos pendientes de las búsquedas sin resultado; y la generación
de las piezas de Instagram de las novedades de la semana.

Cada libro es un ejemplar único, no un SKU con cantidad: es una librería de usados y
casi todo su inventario es de copia única.

## Puesta en marcha

```bash
npm install
cp .dev.vars.example .dev.vars     # y edita los valores
./run.sh                           # instala, migra y levanta en localhost:5173
```

`run.sh` deja el entorno listo antes de arrancar: dependencias, secrets locales y
migraciones de D1. También acepta `./run.sh --check` (lint + tsc + build + dry-run, sin
servidor) y `./run.sh --fresh` (reinstala y ofrece resetear la D1 local).

Si prefieres hacerlo a mano:

```bash
npx wrangler d1 migrations apply libreria-fiestita-loca --local
npm run dev
```

El backoffice está en `/admin` y pide el `ADMIN_TOKEN` de tu `.dev.vars`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo con HMR en `localhost:5173` |
| `npm test` | suite completa (Worker + cliente) |
| `npm run test:cov` | suite con reporte de cobertura (umbral: 80%) |
| `npm run lint` | ESLint |
| `npm run build` | `tsc -b && vite build` |
| `npm run check` | **gate previo a commit**: tsc + build + `wrangler deploy --dry-run` |
| `npm run deploy` | despliegue a producción |
| `npm run cf-typegen` | regenera `worker-configuration.d.ts` desde `wrangler.json` |
| `npx wrangler tail` | logs en vivo del Worker desplegado |

## Infraestructura

### Bindings

Declarados en `wrangler.json` y tipados en `worker-configuration.d.ts` (generado):

| Binding | Recurso | Para qué |
|---|---|---|
| `DB` | D1 `libreria-fiestita-loca` | libros, reservas, solicitudes |
| `IMAGENES` | R2 `fiestita-loca-imagenes` | portadas y fotos de los ejemplares |
| `ASSETS` | assets estáticos | el SPA compilado |

Si agregas un binding, edita `wrangler.json` y corre `npm run cf-typegen` después.

### Secrets

Los tres son obligatorios. En local van en `.dev.vars` (que no se versiona); en
producción se cargan uno por uno:

```bash
npx wrangler secret put ADMIN_TOKEN        # acceso al backoffice
npx wrangler secret put SESSION_SECRET     # firma de la cookie de sesión
npx wrangler secret put WHATSAPP_NUMERO    # número del negocio, ej. 56912345678
```

Rotar `SESSION_SECRET` invalida todas las sesiones abiertas al instante: es la forma de
revocar el acceso si el token se filtra.

### Migraciones

```bash
npx wrangler d1 migrations apply libreria-fiestita-loca --local     # desarrollo
npx wrangler d1 migrations apply libreria-fiestita-loca --remote    # producción
npx wrangler d1 execute libreria-fiestita-loca --remote --command ".tables"
```

Las migraciones viven en `migrations/` y se aplican en orden por nombre. Las pruebas las
leen desde ahí y las aplican sobre una D1 efímera, así que una migración nueva se
ejercita sola en la suite.

## Estructura

```
src/
├── shared/          tipos y validación compartidos entre cliente y Worker
├── worker/
│   ├── index.ts     composición del router Hono
│   ├── rutas/       endpoints públicos y de /api/admin
│   ├── datos/       acceso a D1, una función por operación
│   ├── servicios/   ISBN, fotos, folio, sesión, previsualización
│   └── middleware/  sesión y manejo de errores
└── react-app/
    ├── catalogo/    listado, filtros, ficha
    ├── reserva/     selección, formulario, consulta por folio
    ├── backoffice/  ingesta, inventario, pedidos, avisos, novedades
    ├── lib/         cliente HTTP y carga de datos
    └── ui/          marco común de las vistas públicas
```

Los tipos viven en `src/shared/` y los importan ambos lados: un cambio de contrato rompe
la compilación en vez de romper en producción. Los esquemas de validación están en
archivos `*-esquemas.ts` aparte, para que el bundle del catálogo no cargue Zod.

## Documentación

- **`docs/manual-usuario.html`** — cómo se usa el sistema, de cara a quien atiende la
  librería: catálogo, reservas y las seis secciones del backoffice. Se abre con doble clic.
- **`docs/manual-tecnico.html`** — cómo está armado y por qué: arquitectura, modelo de
  datos, superficie de API, decisiones no obvias y las trampas de cada runtime.
- **`CLAUDE.md`** — convenciones de código y flujo de trabajo.
- **`LEARNINGS.md`** — hallazgos no obvios: trampas de D1, del enrutado de assets, del
  pool de pruebas y de React 19. Vale la pena leerlo antes de pelear con una de esas
  capas.
- **`openspec/`** — las especificaciones de cada capacidad y el historial de cambios.
