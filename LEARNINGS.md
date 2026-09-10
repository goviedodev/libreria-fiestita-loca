# Aprendizajes

Hallazgos no obvios de este proyecto: cosas que costaron tiempo, que contradicen lo
que uno esperaría, o que solo se descubren al ejecutar. No es documentación del
código — para eso está `CLAUDE.md` y las specs en `openspec/`.

Cada entrada dice **qué pasó**, **por qué importa** y **cómo aplicarlo**.

---

## Cloudflare Workers

### El fallback de SPA no funciona solo cuando hay un Worker montado

**Qué pasó.** `wrangler.json` traía `assets.not_found_handling: "single-page-application"`
desde el template, así que dábamos por hecho que los enlaces profundos funcionaban.
No: `/`  respondía 200 y `/libro/123`, `/reserva` y `/admin` respondían **404**. Con
un Worker en `main`, lo que no coincide con un archivo estático llega al Worker, y
ahí Hono responde 404 antes de que el enrutador de assets aplique su fallback.

**Por qué importa.** Habría roto exactamente lo que la spec del catálogo exige: que
la ficha de cada libro tenga una URL propia compartible por WhatsApp. Y solo se nota
al abrir una URL directa, no navegando desde la portada — es el tipo de bug que
llega a producción.

**Cómo aplicarlo.** Declarar `"binding": "ASSETS"` en `assets` y servir el SPA desde
el `notFound` de Hono, distinguiendo la API para que sus 404 sigan siendo JSON:

```ts
app.notFound((c) => {
	if (c.req.path.startsWith("/api/")) {
		return c.json({ error: "Recurso no encontrado" }, 404);
	}
	return c.env.ASSETS.fetch(new Request(new URL("/", c.req.url), c.req.raw));
});
```

Verificar siempre con `curl` sobre una ruta profunda, no solo sobre `/`.

### `wrangler secret put` funciona antes del primer deploy

**Qué pasó.** Asumíamos que había que desplegar el Worker antes de poder cargarle
secrets. No: `wrangler secret put` crea el secret contra un Worker que todavía no
existe y responde `✨ Success!`.

**Cómo aplicarlo.** Los secrets se pueden dejar listos en el paso de infraestructura,
sin invertir el orden de las tareas para desplegar antes de tiempo.

### `d1 create` y `r2 bucket create` no editan `wrangler.json` en modo no interactivo

**Qué pasó.** Ambos comandos ofrecen agregar el binding por ti, pero sin TTY toman la
respuesta por defecto: **no**. El recurso queda creado y la configuración sin tocar.

**Cómo aplicarlo.** Agregar el bloque a `wrangler.json` a mano y correr
`npm run cf-typegen` después. El binding sugerido por wrangler usa el nombre del
recurso (`libreria_fiestita_loca`); aquí preferimos nombres cortos y estables (`DB`,
`IMAGENES`) porque son los que aparecen en todo el código.

### El `worker-configuration.d.ts` generado ensucia el lint

**Qué pasó.** `npm run lint` reportaba 2 avisos de `eslint-disable` inútiles dentro
del archivo que genera `wrangler types`.

**Cómo aplicarlo.** Está en `ignores` de `eslint.config.js`. Es un archivo generado:
no se edita ni se lintea.

---

## D1

### D1 aplica las claves foráneas, y eso permite atomicidad real

**Qué pasó.** SQLite trae `PRAGMA foreign_keys` **apagado** por defecto, así que
esperábamos tener que compensar a mano los conflictos de reserva. Se verificó antes
de escribir la capa de datos: en D1 está **encendido** y un INSERT huérfano falla con
`SQLITE_CONSTRAINT_FOREIGNKEY`.

**Por qué importa.** D1 no tiene transacciones interactivas (`BEGIN`/`COMMIT`), solo
`db.batch()`, que sí es atómico. Pero `batch()` no aborta porque un `UPDATE`
condicional afecte 0 filas: se necesita que **alguna sentencia lance** para que
revierta todo.

**Cómo aplicarlo.** Encadenar por FK para forzar el abort. El INSERT de la reserva
solo produce fila si todos los libros siguen disponibles; el INSERT de los items
referencia esa reserva, así que si no se creó, viola la FK y tumba el batch entero:

```sql
INSERT INTO reservas (...) SELECT ?, ... WHERE (SELECT COUNT(*) FROM libros
  WHERE id IN (...) AND estado = 'disponible') = ?;
INSERT INTO reserva_items (reserva_id, ...) SELECT ?, id, precio FROM libros WHERE id IN (...);
```

Sin trucos de compensación y sin ventana de inconsistencia. Ver
`src/worker/datos/reservas.ts` y su prueba de conflicto concurrente.

### `\p{Diacritic}` también le quita la virgulilla a la eñe

**Qué pasó.** Se escribió una prueba afirmando que `normalizarTexto("Cien años de soledad")`
conservaba la eñe. Falla: devuelve `cien anos de soledad`. `normalize("NFD")` descompone
`ñ` en `n` + combining tilde, y `\p{Diacritic}` se lleva la tilde junto con las demás.

**Por qué importa.** Se lee como un bug y la tentación es "arreglarlo" excluyendo la eñe.
No hay que hacerlo: el término de búsqueda pasa por la misma función, así que buscar
`años` y buscar `anos` encuentran lo mismo, y quien escribe desde un teclado sin eñe
también da con el libro. Excluirla rompería ese último caso.

**Cómo aplicarlo.** La normalización es para *buscar*, no para *mostrar*. El título que se
muestra sale siempre de la columna original (`titulo`), nunca de `titulo_norm`. Hay una
prueba en `test/texto.test.ts` que fija este comportamiento para que nadie lo "corrija".

### No hay `unaccent` ni collation insensible a tildes

**Qué pasó.** Buscar `garcia marquez` no encontraba "García Márquez". SQLite en D1 no
trae `unaccent`, y `COLLATE NOCASE` solo cubre mayúsculas de ASCII.

**Cómo aplicarlo.** Guardar columnas normalizadas al escribir (`titulo_norm`,
`autor_norm`) con `normalizarTexto()` de `src/shared/texto.ts`, y normalizar también
el término de búsqueda. Al editar un campo hay que **recalcular su columna
normalizada** en el mismo UPDATE — es el error fácil de cometer.

---

## R2 e imágenes

### La clave con hash de contenido deduplica sola, y eso se nota al probar

**Qué pasó.** Al verificar el reemplazo de la foto se subió como "foto del ejemplar" el
mismo JPEG que ya se había traído como portada. La respuesta devolvió **la misma clave**
que ya tenía el libro, lo que al principio pareció que la subida no había hecho nada.

**Por qué importa.** La clave es `sha256(bytes)`, así que bytes idénticos son la misma
clave por diseño: dos ejemplares del mismo título comparten un solo objeto en el bucket.
La consecuencia práctica es que **no se puede borrar la imagen anterior sin más** al
reemplazarla; hay que comprobar que ninguna otra fila la referencie.

**Cómo aplicarlo.** Ver `eliminarImagenSiHuerfana()` en `src/worker/servicios/fotos.ts`.
Y al escribir pruebas de reemplazo, usar bytes distintos (`jpegDePrueba(10)` vs
`jpegDePrueba(20)`), o la prueba pasa sin comprobar nada.

### El tipo se valida por los bytes, no por el `Content-Type`

**Qué pasó.** El `Content-Type` de un `multipart` lo pone quien sube el archivo. Un PDF
enviado como `type: "image/jpeg"` pasa cualquier validación basada en el encabezado.

**Cómo aplicarlo.** `tipoPorContenido()` mira la firma real: `FF D8 FF` para JPEG, los 8
bytes de PNG, y `RIFF`…`WEBP` para WebP. Hay una prueba que sube justamente un PDF con el
`Content-Type` mentido.

### Importar una constante de `shared/` puede arrastrar zod entero al cliente

**Qué pasó.** Al conectar el catálogo público, el bundle del visitante saltó de
**64 a 91 KB gzip**. La causa fue una línea inocente:

```ts
import { CONDICIONES } from "../../shared/libro";   // ["nuevo", "usado"]
```

`shared/libro.ts` mezclaba los tipos con los esquemas Zod. Importar un array de dos
strings arrastraba la librería completa.

**Por qué importa.** Los *tipos* se borran al compilar, así que `import type` es
gratis. Una **constante** no: obliga a cargar el módulo entero y todo lo que ese
módulo importe. Es fácil de pasar por alto porque el import se ve idéntico.

**Cómo aplicarlo.** Separar los módulos compartidos en dos: `libro.ts` con tipos y
constantes puras, `libro-esquemas.ts` con la validación. El Worker importa ambos; el
cliente solo el primero. Resultado: **91 → 67.6 KB gzip**, y el chunk del backoffice
bajó de 30 a 6.3 KB. Al agregar `reserva.ts` y `solicitud.ts` al cliente, hacer el
mismo corte antes de importarlos.


---

## Herramientas de prueba

### `@cloudflare/vitest-pool-workers` 0.22 cambió la API y el peer de Vitest

**Qué pasó.** Dos tropiezos seguidos:

1. `npm install -D vitest` instaló **Vitest 5**, pero el pool declara
   `peerDependencies: { vitest: "^4.1.0" }`. npm no lo impidió.
2. Toda la documentación conocida usa `defineWorkersConfig` desde
   `@cloudflare/vitest-pool-workers/config`. En 0.22 **ese subpath no existe**: el
   error real es `Missing "./config" specifier`. La API ahora es un plugin de Vite
   llamado `cloudflareTest`, exportado desde la raíz del paquete.

**Cómo aplicarlo.** Fijar `vitest@^4.1.0` y configurar así:

```ts
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.json" }, miniflare: { bindings: { ... } } })],
	test: { setupFiles: ["./test/setup.ts"] },
});
```

Cuando un paquete de Cloudflare no se comporta como dice la documentación, leer
`node_modules/<paquete>/package.json` → `exports` y el `.d.ts` del bundle. Es más
rápido y corresponde a la versión instalada.

### Los bindings de Miniflare ganan sobre `.dev.vars` en las pruebas

**Qué pasó.** `.dev.vars` se carga igual durante `npm test` (sale el mensaje "Using
secrets defined in .dev.vars"), lo que hacía dudar de qué valor veían las pruebas.

**Cómo aplicarlo.** Lo que se declara en `miniflare.bindings` del `vitest.config.ts`
tiene prioridad. Las pruebas usan `token-de-prueba` y `secreto-de-prueba`, no los de
`.dev.vars`, y hay una prueba que lo afirma para que no se rompa en silencio.

### La Cache API persiste entre pruebas del mismo archivo

**Qué pasó.** Las pruebas del enriquecimiento por ISBN se contaminaban entre sí: la
segunda que usaba el mismo ISBN no llamaba a `fetch` y las aserciones sobre el simulacro
fallaban sin motivo aparente.

**Por qué importa.** `caches.default` vive en el isolate, no en el caso de prueba.
`vi.restoreAllMocks()` no la toca.

**Cómo aplicarlo.** Dar a cada prueba su propio ISBN válido (hay una lista de constantes
al inicio de `test/isbn-servicio.test.ts`). De paso, eso permitió escribir una prueba que
*afirma* que el segundo llamado no sale a la red, en vez de sufrirlo.

---

## React 19

### `setState` dentro de `useEffect` es **error** de lint, no aviso

**Qué pasó.** El patrón clásico de "consultar al montar y guardar el resultado en
estado" hizo fallar `npm run lint` con
`react-hooks/set-state-in-effect: Calling setState synchronously within an effect can
trigger cascading renders`. Es un error, así que rompe el gate.

**Cómo aplicarlo.** Para datos que se piden una vez, crear la promesa fuera del render
y consumirla con `use()`. **Ojo con dónde se crea la promesa** — ver la entrada
siguiente, que corrige la primera versión de este consejo.

### Crear la promesa en el mismo componente que la consume con `use()` es un bucle infinito

**Qué pasó.** Este patrón, que parecía la solución al problema anterior, dejaba el
backoffice clavado en "Cargando…" para siempre:

```tsx
// MAL: la promesa se crea en el componente que suspende
const [promesa] = useState(() => obtener("/api/auth/sesion"));
const inicial = use(promesa);
```

El navegador mostró **más de mil peticiones a `/api/auth/sesion`**. La lógica se veía
correcta y compilaba, y la suite de pruebas del Worker no lo detecta: es un fallo que
solo existe en el cliente.

**Por qué importa.** Cuando `use()` suspende, React **descarta el render a medio hacer
y su estado**. En el reintento, el inicializador de `useState` vuelve a correr, crea
*otra* promesa y suspende otra vez. Nunca converge.

**Cómo aplicarlo.** La promesa se crea en un componente que **no** suspende, y se
consume en un hijo que sí, montado dentro de su propio `<Suspense>`. Está encapsulado
en `src/react-app/lib/Recurso.tsx`:

```tsx
<Recurso pedir={() => obtener("/api/auth/sesion")} respaldo={<p>Cargando…</p>}>
	{(sesion) => <Raiz inicial={sesion.activa} />}
</Recurso>
```

Y la lección de proceso: **una pantalla no está verificada hasta abrirla en un
navegador**. `tsc`, `eslint` y 165 pruebas del Worker estaban en verde con este bug
dentro.

### Una función inline en las dependencias de un efecto recrea el efecto en cada render

**Qué pasó.** El escáner de códigos de barras releía el mismo código sin parar: 104
mutaciones de DOM por segundo. El efecto que monta el `setInterval` dependía de
`alDetectar`, que el padre pasa como arrow inline:

```tsx
<EscanerIsbn alDetectar={(codigo) => void buscar(codigo)} />   // identidad nueva cada render
```

Cada render → nueva identidad → el efecto se limpia y se vuelve a montar → la variable
local `vigente` (la marca de "ya leí un código") se reinicia → vuelve a leer → `buscar`
hace `setState` → nuevo render. Ciclo cerrado.

**Cómo aplicarlo.** Guardar el callback en una ref que se sincroniza en un efecto sin
dependencias, y dejar que el efecto de trabajo dependa solo del estado que de verdad lo
gobierna:

```tsx
const alDetectarRef = useRef(alDetectar);
useEffect(() => { alDetectarRef.current = alDetectar; });
// ... dentro del intervalo: alDetectarRef.current(isbn)
useEffect(() => { /* monta el intervalo */ }, [estado, detener]);   // sin alDetectar
```

Para medirlo sin adivinar, un `MutationObserver` de un segundo dice si la pantalla está
quieta o hirviendo:

```js
new MutationObserver(m => n += m.length).observe(document.body,
	{ subtree: true, childList: true, attributes: true, characterData: true });
```

### Un `<br>` oculto por CSS pega las palabras que separaba

**Qué pasó.** El título del catálogo llevaba un salto manual y una media query que lo
escondía en pantallas angostas:

```jsx
<h1>Libros que ya<br />vivieron algo</h1>
```

A 320 px se leía **«Libros que yavivieron algo»**. JSX descarta el salto de línea y la
indentación que rodean al `<br />`, así que al ocultarlo no queda ningún espacio entre
las dos partes.

**Cómo aplicarlo.** No quebrar títulos con `<br>`. Un texto plano más `text-wrap:
balance` y un `max-width` en `ch` reparte las líneas solo, y en cualquier ancho:

```css
.catalogo__titulo { max-width: 14ch; text-wrap: balance; }
```


### El estado que sobrevive a una acción tiene que vivir por encima de lo que la acción destruye

**Qué pasó.** Al confirmar una reserva, el cliente veía **«Tu reserva está vacía»** en
lugar de su folio y del enlace a WhatsApp. La reserva **sí** se había creado en la
base, con su folio y sus libros bloqueados: lo que se perdía era la única pantalla
donde el cliente podía leer ese folio y abrir WhatsApp.

La estructura era esta:

```tsx
function Reserva() {
	const seleccion = useSeleccion();
	if (seleccion.length === 0) return <SinLibros />;   // ← decide qué se monta
	return <Formulario />;                              // ← aquí vivía `creada`
}
```

Al crear la reserva, `Formulario` llamaba a `vaciar()`. Eso deja la selección en
cero, `Reserva` vuelve a renderizar, entra por la rama `<SinLibros />` y **desmonta
el propio formulario**, con la confirmación adentro.

**Por qué importa.** No es un fallo visible en las pruebas del Worker: la API
respondía 201 con el folio correcto y hay una prueba que lo afirma. El daño estaba
entero del lado del cliente, en el paso que cierra la venta.

**Cómo aplicarlo.** La confirmación se subió a `Reserva` y se comprueba **antes** que
la selección, así el vaciado ya no puede borrarla:

```tsx
if (creada) return <Confirmacion creada={creada} />;   // gana siempre
if (seleccion.length === 0) return <SinLibros />;
```

La regla general: si una acción destruye la condición que mantiene montado a un
componente, el resultado de esa acción no puede guardarse dentro de él. Y al revisar
un flujo, seguirlo **hasta la última pantalla**: el `201` del servidor no prueba que
el usuario haya visto nada.


### `min-width: auto` es el valor por omisión de un flex item, y desborda en el teléfono

**Qué pasó.** A 320 px el buscador de pedidos empujaba el botón «Buscar» fuera de la
pantalla: la página medía 377 px de ancho contra 320 de viewport.

```css
.ped__filtros { display: flex; }
.ped__filtros input { flex: 1; }   /* no baja de su ancho intrínseco */
```

`flex: 1` fija `flex-basis: 0`, pero **no** toca `min-width`, que en un flex item vale
`auto`: el input se niega a encogerse por debajo de su contenido mínimo y el hermano
se sale.

**Cómo aplicarlo.** `min-width: 0` en el item que debe ceder. Lo mismo vale para grid
items. Y para encontrarlo sin adivinar, preguntarle al propio DOM quién se pasa:

```js
[...document.querySelectorAll("main *")]
	.filter(e => e.getBoundingClientRect().right > window.innerWidth)
	.map(e => ({ sel: e.className, right: e.getBoundingClientRect().right }))
```

Un `scrollWidth > clientWidth` dice *que* hay desborde; esto dice **quién** lo causa.

### La captura de página completa duplica las barras fijas

**Qué pasó.** El screenshot del listado de pedidos mostraba la cabecera del backoffice
dos veces y una página de 2053 px. Parecía que el componente se renderizaba doble.

**Cómo aplicarlo.** No lo era: `document.querySelectorAll(".bo__cabecera").length`
devolvió **1**. La captura de página completa redimensiona el viewport a la altura del
documento y cose los fragmentos, así que un elemento `position: sticky` aparece en cada
tramo. Antes de perseguir un bug de render que solo se ve en una imagen, confirmarlo
contra el DOM.


### Si el formulario tiene una caja, la consulta no puede tener dos columnas

**Qué pasó.** El aviso de «avísame cuando llegue» tiene **una** caja rotulada «libro
o autor», porque el visitante no distingue ni le interesa distinguir. El cliente
manda ese texto siempre como `titulo`. Pero la detección de coincidencias comparaba
campo contra campo homónimo:

```sql
libro.titulo_norm LIKE '%' || s.titulo_norm || '%'
OR libro.autor_norm LIKE '%' || s.autor_norm || '%'
```

Alguien buscó «bolaño», se ingresó *Los detectives salvajes* de **Roberto Bolaño**, y
la detección devolvió **0 coincidencias**: el término estaba guardado como título y el
apellido vive en el campo autor del libro. Las pruebas pasaban porque cada una sembraba
la solicitud con el campo "correcto" —algo que la interfaz real nunca hace.

**Por qué importa.** Es la capacidad entera fallando en silencio: nadie recibe un aviso
y no hay error en ningún log. Se descubrió recorriendo el flujo completo en el
navegador, no en la suite.

**Cómo aplicarlo.** El término del visitante se cruza contra **ambos** campos del
libro:

```sql
(s.titulo_norm <> '' AND (libro.titulo_norm LIKE '%'||s.titulo_norm||'%'
                       OR libro.autor_norm  LIKE '%'||s.titulo_norm||'%'))
OR (s.autor_norm <> '' AND (...lo mismo...))
```

Y la lección de proceso: cuando la interfaz colapsa dos campos en uno, **sembrar las
pruebas como lo hace la interfaz**, no como el esquema permitiría. Una prueba que
rellena los datos con más precisión que el formulario real no está probando el sistema
real.


### La decisión de guardar las portadas en R2 era, en realidad, sobre el canvas

**Qué pasó.** Al generar las piezas de Instagram, `canvas.toBlob()` devolvió un PNG de
1.1 MB con la portada dentro, sin lanzar. Se probó a propósito con el único libro que
tenía imagen **traída de una fuente externa**, porque ese es el caso que fallaría.

**Por qué importa.** Un canvas que dibuja una imagen de otro origen queda *tainted*, y
`toBlob()` lanza `SecurityError`: la capacidad entera se caería, y solo se notaría al
final del grupo 9. La decisión del grupo 4 —descargar la portada de Google Books a R2
en vez de guardar su URL— fue lo que evitó eso, cuatro grupos antes de que se notara.

**Cómo aplicarlo.** Cuando una decisión de infraestructura se toma "por si acaso",
dejar anotado **qué se rompería sin ella** y verificarlo explícitamente cuando llegue
el momento. La prueba que vale aquí no es "toBlob funciona", sino "toBlob funciona
sobre la pieza que lleva una portada de origen externo". Y en el canvas, poner
`crossOrigin = "anonymous"` aunque hoy sea mismo origen: es lo que mantiene la
propiedad si mañana las imágenes se mueven a un subdominio.

### Las descargas múltiples van en serie, no en paralelo

**Qué pasó.** La descarga en tanda de varias piezas necesita disparar varios
`<a download>` seguidos. Hacerlo en un bucle sin pausa deja pasar solo la primera en
varios navegadores, que tratan el resto como descargas no solicitadas.

**Cómo aplicarlo.** En serie, con `await` entre una y otra y una pausa de ~400 ms. Se
prefirió eso a sumar una librería de ZIP al bundle por una función que se usa una vez
por semana. Y revocar el object URL con retraso: `URL.revokeObjectURL()` inmediato
cancela la descarga que acaba de empezar.


---

## Proceso

### Planificar y aplicar son fases separadas en OpenSpec

**Qué pasó.** Después de `/opsx:propose` la aplicación seguía siendo el template de
Cloudflare, lo que se leyó como que no se había hecho nada. `propose` genera solo los
artefactos de planificación y se detiene ahí por diseño; el código lo escribe
`/opsx:apply`.

**Cómo aplicarlo.** Al terminar una propuesta, decir explícitamente que no se tocó
código y cuál es el comando que sí lo hace. Un resumen detallado de decisiones
técnicas se lee como trabajo implementado si no se aclara.

### Los artefactos se corrigen cuando la implementación los contradice

**Qué pasó.** `design.md` §14 decía "seis tablas", pero la spec de `alertas-busqueda`
exige que una solicitud coincida con varios libros y un libro con varias solicitudes.
Eso no cabe como columna: hizo falta `solicitud_coincidencias`.

**Cómo aplicarlo.** El artefacto se actualiza en el momento, no al final. Un design
que miente sobre el esquema es peor que no tenerlo, porque se sigue citando.
