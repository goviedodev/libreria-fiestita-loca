import type { LibroPublico } from "./libro";

export const ESTADOS_RESERVA = ["pendiente", "pagado", "entregado", "cancelado"] as const;
export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

/**
 * Transiciones permitidas. `entregado` y `cancelado` son finales: no tienen
 * salida, y por eso su lista está vacía en vez de ausente.
 */
export const TRANSICIONES: Readonly<Record<EstadoReserva, readonly EstadoReserva[]>> = Object.freeze({
	pendiente: ["pagado", "cancelado"],
	pagado: ["entregado", "cancelado"],
	entregado: [],
	cancelado: [],
});

export function esTransicionValida(desde: EstadoReserva, hacia: EstadoReserva): boolean {
	return TRANSICIONES[desde].includes(hacia);
}

export function esEstadoFinal(estado: EstadoReserva): boolean {
	return TRANSICIONES[estado].length === 0;
}

export interface ItemReserva {
	libro: LibroPublico;
	/** Precio congelado al momento de reservar, no el precio actual del libro. */
	precio: number;
}

export interface Reserva {
	folio: string;
	nombre: string;
	telefono: string;
	nota: string | null;
	estado: EstadoReserva;
	total: number;
	items: readonly ItemReserva[];
	creadoEn: string;
}

export interface EventoReserva {
	estado: EstadoReserva;
	creadoEn: string;
}

/** Fila del listado de pedidos del backoffice: sin los libros, que ahí no caben. */
export interface ResumenReserva {
	folio: string;
	nombre: string;
	telefono: string;
	estado: EstadoReserva;
	total: number;
	libros: number;
	creadoEn: string;
	/**
	 * Pendiente con más de 7 días. Se calcula en el servidor para que el listado no
	 * dependa del reloj del navegador del dueño.
	 */
	antigua: boolean;
}

/** Días tras los cuales una reserva pendiente pide atención (spec de gestion-pedidos). */
export const DIAS_PENDIENTE_ANTIGUA = 7;

export interface ResumenNegocio {
	libros: { disponibles: number; reservados: number; vendidos: number };
	reservas: Record<EstadoReserva, number>;
	/** Suma de las reservas pendientes y pagadas: lo que falta cobrar o entregar. */
	pendienteDeCobro: number;
}
