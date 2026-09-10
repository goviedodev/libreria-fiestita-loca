import type { LibroPublico } from "../../shared/libro";
import type { EventoReserva, Reserva } from "../../shared/reserva";
import { enviar, obtener } from "../lib/api";

export interface ReservaCreada {
	reserva: Reserva;
	/** Enlace de `wa.me` ya armado por el Worker, con el número del negocio. */
	whatsapp: string;
}

export interface ConsultaReserva {
	reserva: Reserva;
	historial: readonly EventoReserva[];
}

export interface DatosReserva {
	nombre: string;
	telefono: string;
	nota: string | null;
	libroIds: readonly string[];
}

export function crearReserva(datos: DatosReserva): Promise<ReservaCreada> {
	return enviar<ReservaCreada>("/api/reservas", datos);
}

export function consultarFolio(folio: string, señal?: AbortSignal): Promise<ConsultaReserva> {
	return obtener<ConsultaReserva>(`/api/reservas/${encodeURIComponent(folio)}`, señal);
}

/**
 * Relee del servidor los libros de la selección.
 *
 * Se piden de a uno: son pocos (30 como máximo) y así un libro que desapareció
 * no tumba la consulta de los demás. Los que ya no existen vuelven como `null` y
 * la vista los muestra como retirados.
 */
export async function releerSeleccion(
	ids: readonly string[],
): Promise<readonly (LibroPublico | null)[]> {
	return Promise.all(
		ids.map((id) =>
			obtener<{ libro: LibroPublico }>(`/api/libros/${id}`)
				.then((datos) => datos.libro)
				.catch(() => null),
		),
	);
}
