import { Hono } from "hono";
import { z } from "zod";
import { CONDICIONES } from "../../shared/libro";
import { esquemaAltaLibro, esquemaEdicionLibro } from "../../shared/libro-esquemas";
import { isbnNormalizadoONulo, normalizarIsbn } from "../../shared/isbn";
import { ErrorDominio } from "../datos/comun";
import {
	actualizarLibro,
	clavesDeImagen,
	contarPorIsbn,
	crearLibro,
	darDeBajaLibro,
	fijarImagen,
	generosDisponibles,
	listarLibros,
	obtenerLibro,
	reservasQueBloquean,
} from "../datos/libros";
import { leerJson } from "../middleware/errores";
import { buscarPorIsbn } from "../servicios/isbn";
import { eliminarImagenSiHuerfana, guardarFotoDeEjemplar, guardarPortadaExterna } from "../servicios/fotos";
import { detectarCoincidencias } from "../datos/solicitudes";

export const rutasAdminLibros = new Hono<{ Bindings: Env }>();

const esquemaListado = z.object({
	busqueda: z.string().optional(),
	genero: z.string().optional(),
	condicion: z.enum(CONDICIONES).optional(),
	orden: z.enum(["recientes", "precio-asc", "precio-desc"]).optional(),
	pagina: z.coerce.number().int().positive().optional(),
	// El backoffice ve todo el inventario, incluidos los dados de baja.
	incluirDadosDeBaja: z.stringbool().optional(),
});

rutasAdminLibros.get("/", async (c) => {
	const filtros = esquemaListado.parse(c.req.query());
	const pagina = await listarLibros(c.env.DB, {
		...filtros,
		incluirDadosDeBaja: filtros.incluirDadosDeBaja ?? true,
	});
	return c.json({ ...pagina, generos: await generosDisponibles(c.env.DB) });
});

/**
 * Metadatos de un ISBN, para prellenar el formulario de ingesta.
 *
 * La consulta a las fuentes corre aquí y no en el navegador: evita CORS, no expone
 * las fuentes y permite cachear (design.md §7). Va antes de `/:id` por claridad;
 * no hay ambigüedad porque tiene dos segmentos.
 */
rutasAdminLibros.get("/isbn/:isbn", async (c) => {
	const isbn = normalizarIsbn(c.req.param("isbn"));
	const resultado = await buscarPorIsbn(isbn);

	// Se avisa del ejemplar repetido, pero no se bloquea: la librería puede tener
	// dos copias del mismo título en condiciones y precios distintos.
	const ejemplares = await contarPorIsbn(c.env.DB, isbn);

	return c.json({ ...resultado, ejemplares });
});

rutasAdminLibros.get("/:id", async (c) => {
	const libro = await obtenerLibro(c.env.DB, c.req.param("id"), true);
	if (!libro) {
		throw new ErrorDominio("No encontramos ese libro", 404);
	}
	return c.json({ libro, bloqueadoPor: await reservasQueBloquean(c.env.DB, libro.id) });
});

rutasAdminLibros.post("/", async (c) => {
	const datos = await leerJson(c, esquemaAltaLibro);

	// Un ISBN mal tecleado no invalida el alta —el libro puede no tener ISBN— pero
	// tampoco se guarda basura: si no valida, la columna queda nula.
	const isbn = isbnNormalizadoONulo(datos.isbn);

	// La portada se trae ahora, no se referencia: si la fuente la borra mañana, el
	// catálogo la conserva. Un fallo aquí deja el libro sin imagen, no sin crear.
	const imagenClave = datos.portadaUrl
		? await guardarPortadaExterna(c.env.IMAGENES, datos.portadaUrl)
		: null;

	const libro = await crearLibro(c.env.DB, { ...datos, isbn, imagenClave });

	// La detección corre DESPUÉS del alta y fuera del camino de la respuesta: la
	// spec exige que el libro quede registrado aunque esto falle, y el dueño no
	// tiene por qué esperar a que se crucen las solicitudes para ver su libro
	// creado. `detectarCoincidencias` además no lanza.
	c.executionCtx.waitUntil(detectarCoincidencias(c.env.DB, libro.id));

	return c.json({ libro }, 201);
});

rutasAdminLibros.patch("/:id", async (c) => {
	const id = c.req.param("id");
	const cambios = await leerJson(c, esquemaEdicionLibro);

	const actual = await obtenerLibro(c.env.DB, id, true);
	if (!actual) {
		throw new ErrorDominio("No encontramos ese libro", 404);
	}

	const normalizados =
		cambios.isbn === undefined ? cambios : { ...cambios, isbn: isbnNormalizadoONulo(cambios.isbn) };

	const libro = await actualizarLibro(c.env.DB, id, normalizados);
	return c.json({ libro });
});

rutasAdminLibros.delete("/:id", async (c) => {
	await darDeBajaLibro(c.env.DB, c.req.param("id"));
	return c.json({ ok: true });
});

/**
 * Sube la foto del ejemplar real.
 *
 * Reemplaza la que hubiera: la anterior se borra solo si ningún otro libro la
 * comparte, porque la clave es el hash del contenido.
 */
rutasAdminLibros.post("/:id/foto", async (c) => {
	const id = c.req.param("id");

	const libro = await obtenerLibro(c.env.DB, id, true);
	if (!libro) {
		throw new ErrorDominio("No encontramos ese libro", 404);
	}

	let formulario: FormData;
	try {
		formulario = await c.req.formData();
	} catch {
		throw new ErrorDominio("No se recibió ninguna imagen", 400, { foto: "No se recibió ninguna imagen" });
	}

	const archivo = formulario.get("foto");
	if (!(archivo instanceof File)) {
		throw new ErrorDominio("No se recibió ninguna imagen", 422, { foto: "No se recibió ninguna imagen" });
	}

	// Se valida antes de tocar la base: si el archivo se rechaza, el libro conserva
	// intacta la imagen que ya tenía.
	const { clave } = await guardarFotoDeEjemplar(c.env.IMAGENES, archivo);

	const anteriores = await clavesDeImagen(c.env.DB, id);
	await fijarImagen(c.env.DB, id, "foto_clave", clave);

	if (anteriores.foto && anteriores.foto !== clave) {
		c.executionCtx.waitUntil(eliminarImagenSiHuerfana(c.env.IMAGENES, c.env.DB, anteriores.foto));
	}

	const actualizado = await obtenerLibro(c.env.DB, id, true);
	return c.json({ libro: actualizado });
});
