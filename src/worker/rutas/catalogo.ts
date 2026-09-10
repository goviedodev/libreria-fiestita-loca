import { Hono } from "hono";
import { z } from "zod";
import { CONDICIONES, type Libro, type LibroPublico } from "../../shared/libro";
import { ErrorDominio } from "../datos/comun";
import { generosDisponibles, listarLibros, obtenerLibro } from "../datos/libros";

export const rutasCatalogo = new Hono<{ Bindings: Env }>();

/**
 * El visitante no tiene por qué saber qué libros se dieron de baja: es una
 * decisión interna del negocio. Se recorta antes de salir del Worker.
 */
function aPublico(libro: Libro): LibroPublico {
	// Se enumeran los campos en vez de descartar `dadoDeBaja` con un rest: si algún
	// día se agrega una columna interna al tipo, esto no la deja escapar sola.
	return {
		id: libro.id,
		isbn: libro.isbn,
		titulo: libro.titulo,
		autor: libro.autor,
		editorial: libro.editorial,
		anio: libro.anio,
		genero: libro.genero,
		sinopsis: libro.sinopsis,
		condicion: libro.condicion,
		precio: libro.precio,
		estado: libro.estado,
		imagenUrl: libro.imagenUrl,
		creadoEn: libro.creadoEn,
	};
}

const ORDENES = ["recientes", "precio-asc", "precio-desc"] as const;

/**
 * Los parámetros vienen de la URL, que el visitante puede editar a mano o recibir
 * de un enlace compartido. Un valor desconocido se descarta en vez de romper la
 * página: la spec pide que la URL sea compartible, y un enlace viejo con un
 * género que ya no existe tiene que seguir abriendo el catálogo.
 */
const esquemaConsulta = z.object({
	q: z.string().trim().max(120).optional(),
	genero: z.string().trim().max(120).optional(),
	condicion: z.enum(CONDICIONES).catch(undefined as never).optional(),
	disponibilidad: z.literal("disponible").catch(undefined as never).optional(),
	orden: z.enum(ORDENES).catch("recientes").optional(),
	pagina: z.coerce.number().int().positive().max(10000).catch(1).optional(),
});

rutasCatalogo.get("/", async (c) => {
	const filtros = esquemaConsulta.parse(c.req.query());

	const pagina = await listarLibros(c.env.DB, {
		busqueda: filtros.q,
		genero: filtros.genero,
		condicion: filtros.condicion,
		soloDisponibles: filtros.disponibilidad === "disponible",
		orden: filtros.orden,
		pagina: filtros.pagina,
		// El catálogo público nunca muestra los dados de baja.
		incluirDadosDeBaja: false,
	});

	return c.json({
		...pagina,
		items: pagina.items.map(aPublico),
		generos: await generosDisponibles(c.env.DB),
	});
});

rutasCatalogo.get("/:id", async (c) => {
	const libro = await obtenerLibro(c.env.DB, c.req.param("id"));
	if (!libro) {
		// Un libro dado de baja y uno inexistente responden igual: para el visitante
		// son lo mismo, y distinguirlos filtraría información del inventario.
		throw new ErrorDominio("No encontramos ese libro", 404);
	}
	return c.json({ libro: aPublico(libro) });
});
