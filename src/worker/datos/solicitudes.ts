import type { Aviso, EstadoSolicitud, Solicitud } from "../../shared/solicitud";
import { normalizarTexto } from "../../shared/texto";
import { ahora, ErrorDominio, nuevoId } from "./comun";

interface FilaSolicitud {
	id: string;
	titulo: string | null;
	autor: string | null;
	telefono: string;
	estado: EstadoSolicitud;
	creado_en: string;
}

function aSolicitud(fila: FilaSolicitud): Solicitud {
	return {
		id: fila.id,
		titulo: fila.titulo,
		autor: fila.autor,
		telefono: fila.telefono,
		estado: fila.estado,
		creadoEn: fila.creado_en,
	};
}

export interface DatosSolicitud {
	titulo: string | null;
	autor: string | null;
	telefono: string;
}

/**
 * Registra lo que un visitante buscó y no encontró.
 *
 * Si ya tiene una solicitud **abierta** por lo mismo, se devuelve esa en vez de
 * crear otra: la spec pide confirmarle que su pedido ya está registrado, no
 * llenar la bandeja del dueño con repetidos. La comparación va sobre las columnas
 * normalizadas, así que «García Márquez» y «garcia marquez» son la misma.
 */
export async function crearSolicitud(
	db: D1Database,
	datos: DatosSolicitud,
): Promise<{ solicitud: Solicitud; yaExistia: boolean }> {
	const tituloNorm = datos.titulo ? normalizarTexto(datos.titulo) : null;
	const autorNorm = datos.autor ? normalizarTexto(datos.autor) : null;

	if (!tituloNorm && !autorNorm) {
		throw new ErrorDominio("Indica al menos el título o el autor del libro que buscas", 422, {
			titulo: "Indica al menos el título o el autor",
		});
	}

	// `IS` en vez de `=` porque cualquiera de los dos puede ser NULL, y en SQL
	// `NULL = NULL` no es verdadero.
	const existente = await db
		.prepare(
			`SELECT id, titulo, autor, telefono, estado, creado_en FROM solicitudes
			WHERE telefono = ? AND titulo_norm IS ? AND autor_norm IS ? AND estado = 'abierta'`,
		)
		.bind(datos.telefono, tituloNorm, autorNorm)
		.first<FilaSolicitud>();

	if (existente) {
		return { solicitud: aSolicitud(existente), yaExistia: true };
	}

	const id = nuevoId();
	const momento = ahora();

	await db
		.prepare(
			`INSERT INTO solicitudes (id, titulo, autor, titulo_norm, autor_norm, telefono, estado, creado_en)
			VALUES (?, ?, ?, ?, ?, ?, 'abierta', ?)`,
		)
		.bind(id, datos.titulo, datos.autor, tituloNorm, autorNorm, datos.telefono, momento)
		.run();

	return {
		solicitud: {
			id,
			titulo: datos.titulo,
			autor: datos.autor,
			telefono: datos.telefono,
			estado: "abierta",
			creadoEn: momento,
		},
		yaExistia: false,
	};
}

/**
 * Marca las solicitudes abiertas que coinciden con un libro recién ingresado.
 *
 * La coincidencia es por **contención cruzada**: el término que dejó el cliente
 * tiene que estar dentro del título o del autor del libro, sin importar en cuál
 * de los dos campos quedó guardado. El formulario público tiene una sola caja
 * ("libro o autor") porque el visitante no sabe ni le importa la distinción: si
 * escribe «bolaño» y llega *Los detectives salvajes* de Roberto Bolaño, eso es una
 * coincidencia aunque el término se haya guardado como título.
 *
 * Así «cien años» encuentra «Cien años de soledad», que es el escenario que pide
 * la spec, y no al revés.
 *
 * Devuelve cuántas coincidencias nuevas se registraron. **No lanza**: quien la
 * llama la usa después de dar de alta el libro, y la spec exige que un fallo aquí
 * no impida el alta.
 */
export async function detectarCoincidencias(db: D1Database, libroId: string): Promise<number> {
	try {
		const libro = await db
			.prepare("SELECT titulo_norm, autor_norm FROM libros WHERE id = ? AND dado_de_baja = 0")
			.bind(libroId)
			.first<{ titulo_norm: string; autor_norm: string }>();

		if (!libro) return 0;

		// `INSERT OR IGNORE` deja que la clave primaria compuesta absorba el caso de
		// una coincidencia que ya estaba registrada, sin consultar antes.
		const resultado = await db
			.prepare(
				`INSERT OR IGNORE INTO solicitud_coincidencias (solicitud_id, libro_id, creado_en)
				SELECT s.id, ?, ?
				FROM solicitudes s
				WHERE s.estado = 'abierta'
					AND (
						(s.titulo_norm IS NOT NULL AND s.titulo_norm <> ''
							AND (? LIKE '%' || s.titulo_norm || '%' OR ? LIKE '%' || s.titulo_norm || '%'))
						OR (s.autor_norm IS NOT NULL AND s.autor_norm <> ''
							AND (? LIKE '%' || s.autor_norm || '%' OR ? LIKE '%' || s.autor_norm || '%'))
					)`,
			)
			.bind(
				libroId,
				ahora(),
				libro.titulo_norm,
				libro.autor_norm,
				libro.titulo_norm,
				libro.autor_norm,
			)
			.run();

		return resultado.meta.changes ?? 0;
	} catch (causa) {
		// El libro ya está dado de alta cuando se llega aquí: perder una coincidencia
		// es un aviso que no se manda, no una venta que se pierde.
		console.warn("Falló la detección de coincidencias para", libroId, causa);
		return 0;
	}
}

interface FilaCoincidencia {
	solicitud_id: string;
	libro_id: string;
	titulo: string;
	autor: string;
	imagen_clave: string | null;
	foto_clave: string | null;
	estado: string;
	creado_en: string;
}

/**
 * Avisos del backoffice: solicitudes con sus coincidencias.
 *
 * Por omisión trae solo las `abierta`, que son las que piden acción. El dueño
 * puede pedir el resto para revisar lo ya avisado.
 */
export async function listarAvisos(
	db: D1Database,
	estado?: EstadoSolicitud,
): Promise<readonly Aviso[]> {
	const filtro = estado ? "WHERE estado = ?" : "";
	const valores = estado ? [estado] : [];

	const solicitudes = await db
		.prepare(
			`SELECT id, titulo, autor, telefono, estado, creado_en FROM solicitudes
			${filtro} ORDER BY creado_en DESC`,
		)
		.bind(...valores)
		.all<FilaSolicitud>();

	if (solicitudes.results.length === 0) return [];

	const ids = solicitudes.results.map((f) => f.id);
	const marcadores = ids.map(() => "?").join(", ");

	const coincidencias = await db
		.prepare(
			`SELECT c.solicitud_id, c.libro_id, c.creado_en, l.titulo, l.autor, l.estado,
				l.imagen_clave, l.foto_clave
			FROM solicitud_coincidencias c
			JOIN libros l ON l.id = c.libro_id
			WHERE c.solicitud_id IN (${marcadores}) AND l.dado_de_baja = 0
			ORDER BY c.creado_en DESC`,
		)
		.bind(...ids)
		.all<FilaCoincidencia>();

	const porSolicitud = new Map<string, Aviso["coincidencias"][number][]>();
	for (const fila of coincidencias.results) {
		const clave = fila.foto_clave ?? fila.imagen_clave;
		const lista = porSolicitud.get(fila.solicitud_id) ?? [];
		lista.push({
			libroId: fila.libro_id,
			titulo: fila.titulo,
			autor: fila.autor,
			imagenUrl: clave ? `/api/imagenes/${clave}` : null,
			estado: fila.estado,
			creadoEn: fila.creado_en,
		});
		porSolicitud.set(fila.solicitud_id, lista);
	}

	return solicitudes.results.map((fila) => ({
		solicitud: aSolicitud(fila),
		coincidencias: porSolicitud.get(fila.id) ?? [],
	}));
}

export async function obtenerSolicitud(db: D1Database, id: string): Promise<Solicitud | null> {
	const fila = await db
		.prepare("SELECT id, titulo, autor, telefono, estado, creado_en FROM solicitudes WHERE id = ?")
		.bind(id)
		.first<FilaSolicitud>();
	return fila ? aSolicitud(fila) : null;
}

/**
 * Cambia el estado de una solicitud.
 *
 * `cerrada` es terminal en el sentido que importa: una solicitud cerrada deja de
 * mirarse en la detección de coincidencias, así que no vuelve a generar avisos.
 */
export async function cambiarEstadoSolicitud(
	db: D1Database,
	id: string,
	estado: EstadoSolicitud,
): Promise<Solicitud> {
	const actual = await obtenerSolicitud(db, id);
	if (!actual) {
		throw new ErrorDominio("No encontramos esa solicitud", 404);
	}

	await db.prepare("UPDATE solicitudes SET estado = ? WHERE id = ?").bind(estado, id).run();
	return { ...actual, estado };
}
