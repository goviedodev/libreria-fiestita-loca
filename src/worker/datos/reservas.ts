import type { LibroPublico } from "../../shared/libro";
import type {
	EstadoReserva,
	EventoReserva,
	ItemReserva,
	Reserva,
	ResumenNegocio,
	ResumenReserva,
} from "../../shared/reserva";
import { DIAS_PENDIENTE_ANTIGUA, ESTADOS_RESERVA, esEstadoFinal, esTransicionValida } from "../../shared/reserva";
import { ahora, ErrorDominio, nuevoId } from "./comun";

export interface DatosReserva {
	folio: string;
	nombre: string;
	telefono: string;
	nota: string | null;
	libroIds: readonly string[];
}

const marcadores = (cantidad: number) => Array(cantidad).fill("?").join(", ");

/**
 * Crea la reserva y bloquea sus libros en un único `batch()`, que en D1 es una
 * transacción atómica.
 *
 * La atomicidad ante conflicto se apoya en las claves foráneas, que D1 aplica: el
 * INSERT de la reserva sólo produce una fila si TODOS los libros pedidos siguen
 * disponibles. Si alguno ya no lo está, no se inserta reserva y el INSERT de los
 * items siguiente viola la FK, lo que aborta el batch completo. Así no queda una
 * reserva a medias ni un libro bloqueado por una reserva que no existe, sin
 * necesidad de compensar a mano.
 */
export async function crearReserva(db: D1Database, datos: DatosReserva): Promise<string> {
	const ids = [...new Set(datos.libroIds)];
	if (ids.length === 0) {
		throw new ErrorDominio("Elige al menos un libro", 422);
	}

	const id = nuevoId();
	const momento = ahora();
	const lista = marcadores(ids.length);

	try {
		await db.batch([
			db
				.prepare(
					`INSERT INTO reservas (id, folio, nombre, telefono, nota, estado, total, creado_en, actualizado_en)
					SELECT ?, ?, ?, ?, ?, 'pendiente',
						(SELECT COALESCE(SUM(precio), 0) FROM libros WHERE id IN (${lista}) AND estado = 'disponible'),
						?, ?
					WHERE (SELECT COUNT(*) FROM libros
						WHERE id IN (${lista}) AND estado = 'disponible' AND dado_de_baja = 0) = ?`,
				)
				.bind(id, datos.folio, datos.nombre, datos.telefono, datos.nota, ...ids, momento, momento, ...ids, ids.length),

			// Depende de la fila anterior por FK: si no se creó la reserva, esto aborta el batch.
			db
				.prepare(
					`INSERT INTO reserva_items (reserva_id, libro_id, precio)
					SELECT ?, id, precio FROM libros WHERE id IN (${lista})`,
				)
				.bind(id, ...ids),

			db
				.prepare(`UPDATE libros SET estado = 'reservado', actualizado_en = ? WHERE id IN (${lista})`)
				.bind(momento, ...ids),

			db
				.prepare("INSERT INTO reserva_eventos (reserva_id, estado, creado_en) VALUES (?, 'pendiente', ?)")
				.bind(id, momento),
		]);
	} catch (causa) {
		// Una violación de FK aquí significa exactamente una cosa: alguno de los
		// libros dejó de estar disponible entre que el cliente lo eligió y envió.
		if (esViolacionDeClaveForanea(causa)) {
			throw new ErrorDominio(await mensajeDeConflicto(db, ids), 409);
		}
		throw causa;
	}

	return id;
}

function esViolacionDeClaveForanea(causa: unknown): boolean {
	return causa instanceof Error && /FOREIGN KEY constraint failed/i.test(causa.message);
}

/** Nombra los libros que ya no estaban disponibles, para que el cliente sepa cuál quitar. */
async function mensajeDeConflicto(db: D1Database, ids: readonly string[]): Promise<string> {
	const { results } = await db
		.prepare(
			`SELECT titulo FROM libros
			WHERE id IN (${marcadores(ids.length)}) AND (estado <> 'disponible' OR dado_de_baja = 1)`,
		)
		.bind(...ids)
		.all<{ titulo: string }>();

	if (results.length === 0) {
		return "Alguno de los libros ya no está disponible";
	}
	const titulos = results.map((fila) => `«${fila.titulo}»`).join(", ");
	return results.length === 1
		? `${titulos} ya no está disponible`
		: `Estos libros ya no están disponibles: ${titulos}`;
}

export async function estadoDeReserva(db: D1Database, folio: string): Promise<{ id: string; estado: EstadoReserva } | null> {
	const fila = await db
		.prepare("SELECT id, estado FROM reservas WHERE folio = ?")
		.bind(folio)
		.first<{ id: string; estado: EstadoReserva }>();
	return fila ?? null;
}

/**
 * Cambia el estado de una reserva y arrastra el de sus libros en el mismo
 * `batch()`: la entrega los vende, la cancelación los libera.
 *
 * Al liberar se excluyen los libros que estén comprometidos en OTRA reserva
 * activa; de lo contrario cancelar una reserva pondría como disponible un
 * ejemplar que otro cliente ya tiene tomado.
 */
export async function cambiarEstadoReserva(
	db: D1Database,
	folio: string,
	nuevoEstado: EstadoReserva,
): Promise<void> {
	const reserva = await estadoDeReserva(db, folio);
	if (!reserva) {
		throw new ErrorDominio("No encontramos esa reserva", 404);
	}

	if (esEstadoFinal(reserva.estado)) {
		throw new ErrorDominio(
			`La reserva ya está ${reserva.estado} y no admite más cambios`,
			409,
		);
	}

	if (!esTransicionValida(reserva.estado, nuevoEstado)) {
		throw new ErrorDominio(mensajeTransicion(reserva.estado, nuevoEstado), 409);
	}

	const momento = ahora();
	const sentencias: D1PreparedStatement[] = [
		db
			.prepare("UPDATE reservas SET estado = ?, actualizado_en = ? WHERE id = ?")
			.bind(nuevoEstado, momento, reserva.id),
		db
			.prepare("INSERT INTO reserva_eventos (reserva_id, estado, creado_en) VALUES (?, ?, ?)")
			.bind(reserva.id, nuevoEstado, momento),
	];

	if (nuevoEstado === "entregado") {
		sentencias.push(
			db
				.prepare(
					`UPDATE libros SET estado = 'vendido', actualizado_en = ?
					WHERE id IN (SELECT libro_id FROM reserva_items WHERE reserva_id = ?)`,
				)
				.bind(momento, reserva.id),
		);
	}

	if (nuevoEstado === "cancelado") {
		sentencias.push(
			db
				.prepare(
					`UPDATE libros SET estado = 'disponible', actualizado_en = ?
					WHERE id IN (SELECT libro_id FROM reserva_items WHERE reserva_id = ?)
					AND id NOT IN (
						SELECT i.libro_id FROM reserva_items i
						JOIN reservas r ON r.id = i.reserva_id
						WHERE r.id <> ? AND r.estado IN ('pendiente', 'pagado')
					)`,
				)
				.bind(momento, reserva.id, reserva.id),
		);
	}

	await db.batch(sentencias);
}

function mensajeTransicion(desde: EstadoReserva, hacia: EstadoReserva): string {
	if (desde === "pendiente" && hacia === "entregado") {
		return "Antes de entregar hay que registrar el pago";
	}
	return `No se puede pasar una reserva de ${desde} a ${hacia}`;
}


interface FilaReserva {
	id: string;
	folio: string;
	nombre: string;
	telefono: string;
	nota: string | null;
	estado: EstadoReserva;
	total: number;
	creado_en: string;
}

interface FilaItem {
	precio: number;
	libro_id: string;
	isbn: string | null;
	titulo: string;
	autor: string;
	editorial: string | null;
	anio: number | null;
	genero: string | null;
	sinopsis: string | null;
	condicion: LibroPublico["condicion"];
	precio_actual: number;
	estado: LibroPublico["estado"];
	imagen_clave: string | null;
	foto_clave: string | null;
	creado_en: string;
}

function aItem(fila: FilaItem): ItemReserva {
	const clave = fila.foto_clave ?? fila.imagen_clave;
	return {
		// El precio del libro que se devuelve es el **congelado** en la reserva, no
		// el actual: si el dueño subió el precio después, el cliente no puede ver un
		// número distinto al que aceptó.
		precio: fila.precio,
		libro: {
			id: fila.libro_id,
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
			imagenUrl: clave ? `/api/imagenes/${clave}` : null,
			creadoEn: fila.creado_en,
		},
	};
}

/**
 * Lee una reserva completa por su folio, con sus items y su historial.
 *
 * El teléfono sale tal cual: quien llame decide si lo enmascara (consulta
 * pública) o lo muestra entero (backoffice del dueño).
 */
export async function obtenerReserva(
	db: D1Database,
	folio: string,
): Promise<{ reserva: Reserva; historial: readonly EventoReserva[] } | null> {
	const cabecera = await db
		.prepare("SELECT id, folio, nombre, telefono, nota, estado, total, creado_en FROM reservas WHERE folio = ?")
		.bind(folio)
		.first<FilaReserva>();

	if (!cabecera) return null;

	const [items, eventos] = await db.batch([
		db
			.prepare(
				`SELECT i.precio, l.id AS libro_id, l.isbn, l.titulo, l.autor, l.editorial, l.anio,
					l.genero, l.sinopsis, l.condicion, l.precio AS precio_actual, l.estado,
					l.imagen_clave, l.foto_clave, l.creado_en
				FROM reserva_items i JOIN libros l ON l.id = i.libro_id
				WHERE i.reserva_id = ?
				ORDER BY l.titulo`,
			)
			.bind(cabecera.id),
		db
			.prepare("SELECT estado, creado_en FROM reserva_eventos WHERE reserva_id = ? ORDER BY id")
			.bind(cabecera.id),
	]);

	return {
		reserva: {
			folio: cabecera.folio,
			nombre: cabecera.nombre,
			telefono: cabecera.telefono,
			nota: cabecera.nota,
			estado: cabecera.estado,
			total: cabecera.total,
			items: (items.results as unknown as FilaItem[]).map(aItem),
			creadoEn: cabecera.creado_en,
		},
		historial: (eventos.results as unknown as { estado: EstadoReserva; creado_en: string }[]).map(
			(fila) => ({ estado: fila.estado, creadoEn: fila.creado_en }),
		),
	};
}


export interface FiltrosPedidos {
	estado?: EstadoReserva;
	/** Busca en folio, nombre y teléfono a la vez. */
	busqueda?: string;
}

interface FilaResumen {
	folio: string;
	nombre: string;
	telefono: string;
	estado: EstadoReserva;
	total: number;
	libros: number;
	creado_en: string;
}

/** Momento a partir del cual una pendiente deja de considerarse reciente. */
function corteDeAntiguedad(): string {
	const corte = new Date(Date.now() - DIAS_PENDIENTE_ANTIGUA * 24 * 60 * 60 * 1000);
	return corte.toISOString();
}

/**
 * Listado de pedidos del backoffice, de la más reciente a la más antigua.
 *
 * La búsqueda cubre folio, nombre y teléfono en una sola caja: el dueño busca con
 * lo que tenga a mano, sin elegir antes por qué campo.
 */
export async function listarReservas(
	db: D1Database,
	filtros: FiltrosPedidos = {},
): Promise<readonly ResumenReserva[]> {
	const partes: string[] = [];
	const valores: unknown[] = [];

	if (filtros.estado) {
		partes.push("r.estado = ?");
		valores.push(filtros.estado);
	}

	const busqueda = filtros.busqueda?.trim();
	if (busqueda) {
		const patron = `%${busqueda.toLowerCase()}%`;
		const digitos = busqueda.replace(/\D/g, "");

		// El teléfono se guarda canónico (`569…`), así que el término se compara sin
		// signos ni espacios: buscar "1234 5678" tiene que encontrar 56912345678. Es
		// el mismo tropiezo que hubo con el ISBN en el catálogo.
		//
		// Un término sin dígitos daría el patrón `%%`, que casa con cualquier
		// teléfono; en ese caso se manda un valor que ningún teléfono contiene.
		const patronTelefono = digitos ? `%${digitos}%` : "\u0000";

		partes.push("(UPPER(r.folio) LIKE UPPER(?) OR LOWER(r.nombre) LIKE ? OR r.telefono LIKE ?)");
		valores.push(patron, patron, patronTelefono);
	}

	const donde = partes.length > 0 ? `WHERE ${partes.join(" AND ")}` : "";

	const { results } = await db
		.prepare(
			`SELECT r.folio, r.nombre, r.telefono, r.estado, r.total, r.creado_en,
				(SELECT COUNT(*) FROM reserva_items i WHERE i.reserva_id = r.id) AS libros
			FROM reservas r
			${donde}
			ORDER BY r.creado_en DESC, r.folio DESC`,
		)
		.bind(...valores)
		.all<FilaResumen>();

	const corte = corteDeAntiguedad();

	return results.map((fila) => ({
		folio: fila.folio,
		nombre: fila.nombre,
		telefono: fila.telefono,
		estado: fila.estado,
		total: fila.total,
		libros: fila.libros,
		creadoEn: fila.creado_en,
		antigua: fila.estado === "pendiente" && fila.creado_en < corte,
	}));
}

/**
 * Totales del negocio.
 *
 * Todo en un `batch()`: son consultas independientes y así el resumen sale de una
 * sola ida a la base en vez de cuatro.
 */
export async function resumenNegocio(db: D1Database): Promise<ResumenNegocio> {
	const [libros, reservas, pendiente] = await db.batch([
		db.prepare(
			`SELECT estado, COUNT(*) AS n FROM libros WHERE dado_de_baja = 0 GROUP BY estado`,
		),
		db.prepare("SELECT estado, COUNT(*) AS n FROM reservas GROUP BY estado"),
		db.prepare(
			"SELECT COALESCE(SUM(total), 0) AS monto FROM reservas WHERE estado IN ('pendiente', 'pagado')",
		),
	]);

	const porEstadoLibro = new Map(
		(libros.results as { estado: string; n: number }[]).map((f) => [f.estado, f.n]),
	);
	const porEstadoReserva = new Map(
		(reservas.results as { estado: EstadoReserva; n: number }[]).map((f) => [f.estado, f.n]),
	);

	// Los estados sin filas no aparecen en un GROUP BY: se rellenan con cero para
	// que el negocio sin movimientos muestre ceros y no huecos.
	const conteoReservas = Object.fromEntries(
		ESTADOS_RESERVA.map((estado) => [estado, porEstadoReserva.get(estado) ?? 0]),
	) as Record<EstadoReserva, number>;

	return {
		libros: {
			disponibles: porEstadoLibro.get("disponible") ?? 0,
			reservados: porEstadoLibro.get("reservado") ?? 0,
			vendidos: porEstadoLibro.get("vendido") ?? 0,
		},
		reservas: conteoReservas,
		pendienteDeCobro: (pendiente.results[0] as { monto: number } | undefined)?.monto ?? 0,
	};
}
