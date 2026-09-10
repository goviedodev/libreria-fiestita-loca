import type { Condicion, EstadoLibro, Libro } from "../../shared/libro";
import type { AltaLibro, EdicionLibro } from "../../shared/libro-esquemas";
import type { Pagina } from "../../shared/api";
import { normalizarTexto } from "../../shared/texto";
import { ahora, ErrorDominio, nuevoId } from "./comun";

interface FilaLibro {
	id: string;
	isbn: string | null;
	titulo: string;
	autor: string;
	editorial: string | null;
	anio: number | null;
	genero: string | null;
	sinopsis: string | null;
	condicion: Condicion;
	precio: number;
	estado: EstadoLibro;
	imagen_clave: string | null;
	foto_clave: string | null;
	dado_de_baja: number;
	creado_en: string;
}

const COLUMNAS = `id, isbn, titulo, autor, editorial, anio, genero, sinopsis,
	condicion, precio, estado, imagen_clave, foto_clave, dado_de_baja, creado_en`;

/**
 * La foto del ejemplar manda sobre la portada de la fuente externa: en usados el
 * estado del libro real importa más que la portada de catálogo.
 */
function urlImagen(fila: FilaLibro): string | null {
	const clave = fila.foto_clave ?? fila.imagen_clave;
	return clave ? `/api/imagenes/${clave}` : null;
}

function aLibro(fila: FilaLibro): Libro {
	return {
		id: fila.id,
		isbn: fila.isbn,
		titulo: fila.titulo,
		autor: fila.autor,
		editorial: fila.editorial,
		anio: fila.anio,
		genero: fila.genero,
		sinopsis: fila.sinopsis,
		condicion: fila.condicion,
		precio: fila.precio,
		estado: fila.estado,
		imagenUrl: urlImagen(fila),
		dadoDeBaja: fila.dado_de_baja === 1,
		creadoEn: fila.creado_en,
	};
}

export interface FiltrosCatalogo {
	busqueda?: string;
	genero?: string;
	condicion?: Condicion;
	/** `true` deja solo los disponibles; omitido muestra todos. */
	soloDisponibles?: boolean;
	orden?: "recientes" | "precio-asc" | "precio-desc";
	pagina?: number;
	porPagina?: number;
	/** El backoffice necesita ver también los dados de baja. */
	incluirDadosDeBaja?: boolean;
}

const POR_PAGINA_PREDETERMINADO = 24;
const POR_PAGINA_MAXIMO = 60;

const ORDENES = {
	recientes: "creado_en DESC, id DESC",
	"precio-asc": "precio ASC, id DESC",
	"precio-desc": "precio DESC, id DESC",
} as const;

/** Arma el WHERE compartido por el conteo y la página de resultados. */
function condiciones(filtros: FiltrosCatalogo): { sql: string; valores: unknown[] } {
	const partes: string[] = [];
	const valores: unknown[] = [];

	if (!filtros.incluirDadosDeBaja) {
		partes.push("dado_de_baja = 0");
	}
	if (filtros.soloDisponibles) {
		partes.push("estado = 'disponible'");
	}
	if (filtros.condicion) {
		partes.push("condicion = ?");
		valores.push(filtros.condicion);
	}
	if (filtros.genero) {
		partes.push("genero = ?");
		valores.push(filtros.genero);
	}

	const busqueda = filtros.busqueda ? normalizarTexto(filtros.busqueda) : "";
	if (busqueda) {
		// El ISBN lleva su propio patrón: `normalizarTexto` quita tildes y mayúsculas
		// pero no guiones, y el ISBN se guarda sin ellos. Buscar `978-0-306-40615-7`
		// con el patrón de texto no encontraría nunca `9780306406157`.
		const patron = `%${busqueda}%`;
		const patronIsbn = `%${busqueda.replace(/[\s-]/g, "")}%`;
		partes.push(
			"(titulo_norm LIKE ? OR autor_norm LIKE ? OR REPLACE(REPLACE(COALESCE(isbn, ''), '-', ''), ' ', '') LIKE ?)",
		);
		valores.push(patron, patron, patronIsbn);
	}

	return {
		sql: partes.length > 0 ? `WHERE ${partes.join(" AND ")}` : "",
		valores,
	};
}

export async function listarLibros(db: D1Database, filtros: FiltrosCatalogo = {}): Promise<Pagina<Libro>> {
	const porPagina = Math.min(filtros.porPagina ?? POR_PAGINA_PREDETERMINADO, POR_PAGINA_MAXIMO);
	const pagina = Math.max(filtros.pagina ?? 1, 1);
	const { sql, valores } = condiciones(filtros);
	const orden = ORDENES[filtros.orden ?? "recientes"];

	const [conteo, resultados] = await db.batch<FilaLibro | { total: number }>([
		db.prepare(`SELECT COUNT(*) AS total FROM libros ${sql}`).bind(...valores),
		db
			.prepare(`SELECT ${COLUMNAS} FROM libros ${sql} ORDER BY ${orden} LIMIT ? OFFSET ?`)
			.bind(...valores, porPagina, (pagina - 1) * porPagina),
	]);

	return {
		items: (resultados.results as FilaLibro[]).map(aLibro),
		total: (conteo.results[0] as { total: number }).total,
		pagina,
		porPagina,
	};
}

export async function obtenerLibro(db: D1Database, id: string, incluirDadoDeBaja = false): Promise<Libro | null> {
	const filtro = incluirDadoDeBaja ? "" : " AND dado_de_baja = 0";
	const fila = await db
		.prepare(`SELECT ${COLUMNAS} FROM libros WHERE id = ?${filtro}`)
		.bind(id)
		.first<FilaLibro>();
	return fila ? aLibro(fila) : null;
}

/** Cuántos libros con este ISBN ya existen: la ingesta avisa antes de duplicar. */
export async function contarPorIsbn(db: D1Database, isbn: string): Promise<number> {
	const fila = await db
		.prepare("SELECT COUNT(*) AS total FROM libros WHERE isbn = ? AND dado_de_baja = 0")
		.bind(isbn)
		.first<{ total: number }>();
	return fila?.total ?? 0;
}

export interface DatosCreacion extends AltaLibro {
	/** Clave en R2 de la portada ya descargada, si la hubo. */
	imagenClave?: string | null;
}

export async function crearLibro(db: D1Database, datos: DatosCreacion): Promise<Libro> {
	const id = nuevoId();
	const momento = ahora();

	await db
		.prepare(
			`INSERT INTO libros (id, isbn, titulo, autor, titulo_norm, autor_norm, editorial, anio,
				genero, sinopsis, condicion, precio, estado, imagen_clave, foto_clave, dado_de_baja,
				creado_en, actualizado_en)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disponible', ?, NULL, 0, ?, ?)`,
		)
		.bind(
			id,
			datos.isbn,
			datos.titulo,
			datos.autor,
			normalizarTexto(datos.titulo),
			normalizarTexto(datos.autor),
			datos.editorial,
			datos.anio,
			datos.genero,
			datos.sinopsis,
			datos.condicion,
			datos.precio,
			datos.imagenClave ?? null,
			momento,
			momento,
		)
		.run();

	const creado = await obtenerLibro(db, id);
	if (!creado) {
		throw new Error("El libro recién creado no pudo leerse");
	}
	return creado;
}

const CAMPOS_EDITABLES = {
	isbn: "isbn",
	titulo: "titulo",
	autor: "autor",
	editorial: "editorial",
	anio: "anio",
	genero: "genero",
	sinopsis: "sinopsis",
	condicion: "condicion",
	precio: "precio",
} as const;

export async function actualizarLibro(db: D1Database, id: string, cambios: EdicionLibro): Promise<Libro> {
	const actual = await obtenerLibro(db, id, true);
	if (!actual) {
		throw new ErrorDominio("No encontramos ese libro", 404);
	}

	const asignaciones: string[] = [];
	const valores: unknown[] = [];

	for (const [campo, columna] of Object.entries(CAMPOS_EDITABLES)) {
		const valor = cambios[campo as keyof typeof CAMPOS_EDITABLES];
		if (valor === undefined) continue;
		asignaciones.push(`${columna} = ?`);
		valores.push(valor);
	}

	// Las columnas normalizadas se recalculan junto al campo del que derivan.
	if (cambios.titulo !== undefined) {
		asignaciones.push("titulo_norm = ?");
		valores.push(normalizarTexto(cambios.titulo));
	}
	if (cambios.autor !== undefined) {
		asignaciones.push("autor_norm = ?");
		valores.push(normalizarTexto(cambios.autor));
	}

	if (asignaciones.length === 0) {
		return actual;
	}

	asignaciones.push("actualizado_en = ?");
	valores.push(ahora(), id);

	await db.prepare(`UPDATE libros SET ${asignaciones.join(", ")} WHERE id = ?`).bind(...valores).run();

	const actualizado = await obtenerLibro(db, id, true);
	return actualizado ?? actual;
}

export async function fijarImagen(
	db: D1Database,
	id: string,
	campo: "imagen_clave" | "foto_clave",
	clave: string | null,
): Promise<void> {
	await db
		.prepare(`UPDATE libros SET ${campo} = ?, actualizado_en = ? WHERE id = ?`)
		.bind(clave, ahora(), id)
		.run();
}

export async function clavesDeImagen(db: D1Database, id: string): Promise<{ imagen: string | null; foto: string | null }> {
	const fila = await db
		.prepare("SELECT imagen_clave, foto_clave FROM libros WHERE id = ?")
		.bind(id)
		.first<{ imagen_clave: string | null; foto_clave: string | null }>();
	return { imagen: fila?.imagen_clave ?? null, foto: fila?.foto_clave ?? null };
}

/** Folios de las reservas activas que incluyen este libro y bloquean su baja. */
export async function reservasQueBloquean(db: D1Database, libroId: string): Promise<string[]> {
	const { results } = await db
		.prepare(
			`SELECT r.folio FROM reserva_items i
			JOIN reservas r ON r.id = i.reserva_id
			WHERE i.libro_id = ? AND r.estado IN ('pendiente', 'pagado')
			ORDER BY r.creado_en`,
		)
		.bind(libroId)
		.all<{ folio: string }>();
	return results.map((fila) => fila.folio);
}

export async function darDeBajaLibro(db: D1Database, id: string): Promise<void> {
	const libro = await obtenerLibro(db, id, true);
	if (!libro) {
		throw new ErrorDominio("No encontramos ese libro", 404);
	}

	const bloqueos = await reservasQueBloquean(db, id);
	if (bloqueos.length > 0) {
		throw new ErrorDominio(
			`No se puede dar de baja: el libro está en la reserva ${bloqueos.join(", ")}`,
			409,
		);
	}

	await db
		.prepare("UPDATE libros SET dado_de_baja = 1, actualizado_en = ? WHERE id = ?")
		.bind(ahora(), id)
		.run();
}

/** Géneros presentes en el catálogo publicado, para armar el filtro. */
export async function generosDisponibles(db: D1Database): Promise<string[]> {
	const { results } = await db
		.prepare(
			`SELECT DISTINCT genero FROM libros
			WHERE genero IS NOT NULL AND genero <> '' AND dado_de_baja = 0
			ORDER BY genero`,
		)
		.all<{ genero: string }>();
	return results.map((fila) => fila.genero);
}


/** Días que abarca la vista de novedades cuando el dueño no elige un rango. */
export const DIAS_NOVEDADES = 7;

/**
 * Libros ingresados dentro de un rango, para armar las piezas de Instagram.
 *
 * Se excluyen los vendidos y los dados de baja: publicar un ejemplar que ya no
 * está lleva clientes a una ficha muerta. Los reservados sí salen — todavía
 * pueden liberarse, y muestran que el catálogo se mueve.
 */
export async function listarNovedades(
	db: D1Database,
	desde: string,
	hasta: string,
): Promise<readonly Libro[]> {
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNAS} FROM libros
			WHERE dado_de_baja = 0 AND estado <> 'vendido'
				AND creado_en >= ? AND creado_en <= ?
			ORDER BY creado_en DESC, id DESC`,
		)
		.bind(desde, hasta)
		.all<FilaLibro>();

	return results.map(aLibro);
}
