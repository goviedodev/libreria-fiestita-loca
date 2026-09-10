import { Hono, type Context } from "hono";
import { manejarErrores } from "./middleware/errores";
import { requiereSesion } from "./middleware/sesion";
import { rutasAdminLibros } from "./rutas/admin-libros";
import { rutaResumen, rutasAdminReservas } from "./rutas/admin-reservas";
import { rutasAuth } from "./rutas/auth";
import { rutasCatalogo } from "./rutas/catalogo";
import { rutasImagenes } from "./rutas/imagenes";
import { rutasReservas } from "./rutas/reservas";
import { rutasSolicitudes } from "./rutas/solicitudes";
import { rutasAdminAlertas } from "./rutas/admin-alertas";
import { rutasAdminNovedades } from "./rutas/admin-novedades";
import { obtenerLibro } from "./datos/libros";
import { inyectarPrevisualizacion } from "./servicios/previsualizacion";

const app = new Hono<{ Bindings: Env }>();

app.onError(manejarErrores);

app.get("/api/salud", (c) => c.json({ ok: true }));

// Ingreso y cierre de sesión son públicos por necesidad, así que viven fuera de
// /api/admin. Todo lo que cuelga de /api/admin exige sesión, sin excepciones.
app.route("/api/auth", rutasAuth);

// Las imágenes son públicas: las muestra el catálogo a cualquier visitante.
app.route("/api/imagenes", rutasImagenes);

// El catálogo es el escaparate del negocio: abierto, sin sesión.
app.route("/api/libros", rutasCatalogo);

// Reservar y consultar el folio no exigen cuenta: el cliente solo deja su nombre
// y su teléfono.
app.route("/api/reservas", rutasReservas);

// Dejar anotado un libro que no está tampoco exige cuenta.
app.route("/api/solicitudes", rutasSolicitudes);

const admin = new Hono<{ Bindings: Env }>();
admin.use("*", requiereSesion);

// Comprobación viva de que el middleware protege el prefijo completo.
admin.get("/ping", (c) => c.json({ ok: true }));

admin.route("/libros", rutasAdminLibros);
admin.route("/reservas", rutasAdminReservas);
admin.route("/resumen", rutaResumen);
admin.route("/alertas", rutasAdminAlertas);
admin.route("/novedades", rutasAdminNovedades);

app.route("/api/admin", admin);

/**
 * Sirve el documento del SPA, con los metadatos del libro cuando la ruta es una
 * ficha.
 *
 * Con un Worker montado, el enrutador de assets no aplica por su cuenta el
 * fallback de SPA: todo lo que no sea un archivo estático llega hasta aquí. Sin
 * esto, cada enlace profundo respondería 404.
 */
async function servirSpa(c: Context<{ Bindings: Env }>): Promise<Response> {
	const url = new URL(c.req.url);
	const documento = await c.env.ASSETS.fetch(new Request(new URL("/", url), c.req.raw));

	const ficha = url.pathname.match(/^\/libro\/([^/]+)\/?$/);
	if (!ficha || !documento.ok) return documento;

	// Que la previsualización falle no puede dejar sin página al visitante: si algo
	// sale mal, se entrega el documento tal cual y el SPA se encarga igual.
	try {
		const libro = await obtenerLibro(c.env.DB, decodeURIComponent(ficha[1]));
		if (!libro) return documento;

		const html = inyectarPrevisualizacion(await documento.text(), libro, url.origin);
		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				// Corta pero no nula: si el dueño cambia el precio, la próxima vez que
				// alguien comparta el enlace ya sale el nuevo.
				"Cache-Control": "public, max-age=300",
			},
		});
	} catch (causa) {
		console.warn("No se pudo armar la previsualización de la ficha:", causa);
		return documento;
	}
}

app.notFound((c) => {
	if (c.req.path.startsWith("/api/")) {
		return c.json({ error: "Recurso no encontrado" }, 404);
	}
	return servirSpa(c);
});

export default app;
