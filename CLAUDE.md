# Librería Fiestita Loca

Catálogo web y backoffice de una librería de usados en Limache, sobre Cloudflare Workers:
React + Vite en el cliente, Hono en el Worker, D1 para los datos y R2 para las imágenes.

Las siete capacidades están implementadas: catálogo público, reservas con handoff a
WhatsApp, inventario con ingesta por ISBN, acceso al backoffice, gestión de pedidos,
alertas de búsqueda y generación de piezas para Instagram. Ver `README.md` para el
detalle funcional y la puesta en marcha.

**Cada libro es un ejemplar único**, no un SKU con cantidad: el estado (`disponible` /
`reservado` / `vendido`) vive en la fila del libro y no hay columna de stock.

## Stack

| Capa | Tecnología |
|------|-----------|
| UI | React 19.2 + TypeScript 5.9 |
| Build / dev | Vite 7 (`@cloudflare/vite-plugin`) |
| API | Hono 4.11 corriendo en el Worker |
| Runtime / deploy | Cloudflare Workers (`wrangler` 4.127) |
| Lint | ESLint 9 (flat config) + typescript-eslint |

## Comandos

```bash
npm install          # instalar dependencias
npm run dev          # dev server con HMR -> http://localhost:5173
npm run lint         # eslint .
npm run build        # tsc -b && vite build
npm run check        # tsc && vite build && wrangler deploy --dry-run  (gate previo a commit)
npm run preview      # build + preview local
npm run deploy       # wrangler deploy (producción)
npm run cf-typegen   # regenera worker-configuration.d.ts desde wrangler.json
npx wrangler tail    # logs en vivo del worker desplegado
```

`npm run check` es la verificación completa: úsalo antes de dar por terminado un cambio.

## Estructura

```
src/
├── shared/             # tipos y validación compartidos cliente/Worker
│   ├── *.ts            #   tipos y constantes puras (sin Zod)
│   └── *-esquemas.ts   #   esquemas Zod, solo los importa el Worker
├── react-app/          # cliente React (tsconfig.app.json)
│   ├── catalogo/       #   listado, filtros, ficha
│   ├── reserva/        #   selección, formulario, consulta por folio
│   ├── backoffice/     #   ingesta, inventario, pedidos, avisos, novedades
│   ├── lib/            #   cliente HTTP y <Recurso> para cargar datos
│   └── ui/             #   marco común de las vistas públicas
└── worker/
    ├── index.ts        # app Hono, entrypoint del Worker (main en wrangler.json)
    ├── rutas/          #   endpoints públicos y de /api/admin
    ├── datos/          #   acceso a D1, una función por operación
    ├── servicios/      #   ISBN, fotos, folio, sesión, previsualización
    └── middleware/     #   sesión y manejo de errores

migrations/             # migraciones de D1, aplicadas en orden por nombre
test/                   # pruebas del Worker; test/cliente/ las del navegador
openspec/               # especificaciones y cambios (flujo spec-driven)
wrangler.json           # config del Worker: bindings, assets, compat date
worker-configuration.d.ts  # GENERADO por `npm run cf-typegen` — no editar a mano
```

- Las rutas de API viven bajo `/api/` en el worker Hono; todo lo demás cae en el SPA
  (`not_found_handling: "single-page-application"`).
- Los bindings del Worker se tipan vía `Env` en `worker-configuration.d.ts`. Si agregas un
  binding (D1, KV, R2…) edita `wrangler.json` y luego corre `npm run cf-typegen`.
- Bindings actuales: `DB` (D1), `IMAGENES` (R2), `ASSETS`. Secrets: `ADMIN_TOKEN`,
  `SESSION_SECRET`, `WHATSAPP_NUMERO` — ver `README.md` para cargarlos.

## Convenciones de código

- **Indentación con tabs**, comillas dobles, punto y coma. Mantén el estilo del archivo que edites.
- TypeScript en modo `strict`, con `noUnusedLocals` y `noUnusedParameters`: no dejes imports ni
  parámetros muertos, el build falla.
- Inmutabilidad: crea objetos nuevos en vez de mutar (estado de React, respuestas de API).
- Archivos pequeños y por feature/dominio, no por tipo. 200–400 líneas típico, 800 máximo.
- Valida toda entrada externa en el borde del worker antes de usarla.
- **Los esquemas Zod van en `*-esquemas.ts`, separados de los tipos.** Importar una
  constante desde un módulo que trae Zod arrastra la librería entera al bundle del
  visitante; ya pasó una vez y costó 23 KB gzip.
- Las pruebas del cliente van en `test/cliente/` (entorno `happy-dom`); las del Worker
  en `test/` (dentro de workerd, con D1 real y efímera).
- Nunca hardcodear secretos: usa `wrangler secret` / variables de entorno y bindings tipados.

## Aprendizajes

`LEARNINGS.md` recoge los hallazgos no obvios del proyecto: trampas de D1, del
enrutado de assets del Worker, del pool de pruebas de Cloudflare y de React 19.
**Léelo antes de pelear con una de esas capas** — varias de esas entradas existen
porque el comportamiento real contradice lo que la documentación sugiere. Cuando algo
te cueste más de lo razonable descubrirlo, agrégalo ahí.

## Flujo de trabajo (OpenSpec)

Este proyecto usa OpenSpec (`schema: spec-driven`). Para cualquier cambio no trivial:

1. `/opsx:propose "idea"` — crear la propuesta y specs del cambio
2. `/opsx:apply` — implementar contra la spec
3. `/opsx:archive` — archivar el cambio una vez desplegado

El contexto del proyecto para OpenSpec se configura en `openspec/config.yaml`.

## Git

Conventional commits: `<tipo>: <descripción>` con tipos `feat, fix, refactor, docs, test, chore, perf, ci`.
