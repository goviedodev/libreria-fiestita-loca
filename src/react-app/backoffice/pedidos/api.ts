import type { EstadoReserva, EventoReserva, Reserva, ResumenNegocio, ResumenReserva } from "../../../shared/reserva";
import { consulta, enviar, obtener } from "../../lib/api";

export interface DetallePedido {
	reserva: Reserva;
	historial: readonly EventoReserva[];
	/** Enlace de WhatsApp hacia el cliente, armado por el Worker. */
	contacto: string;
}

export interface FiltrosPedidos {
	estado?: string;
	busqueda?: string;
}

export const ETIQUETA_ESTADO: Record<EstadoReserva, string> = {
	pendiente: "Pendiente",
	pagado: "Pagada",
	entregado: "Entregada",
	cancelado: "Cancelada",
};

/** Qué puede hacerse desde cada estado, con el texto del botón que lo dispara. */
export const ACCIONES: Record<EstadoReserva, readonly { estado: EstadoReserva; etiqueta: string }[]> = {
	pendiente: [
		{ estado: "pagado", etiqueta: "Registrar pago" },
		{ estado: "cancelado", etiqueta: "Cancelar reserva" },
	],
	pagado: [
		{ estado: "entregado", etiqueta: "Marcar como entregada" },
		{ estado: "cancelado", etiqueta: "Cancelar reserva" },
	],
	entregado: [],
	cancelado: [],
};

export function listarPedidos(
	filtros: FiltrosPedidos,
	señal?: AbortSignal,
): Promise<{ reservas: readonly ResumenReserva[] }> {
	return obtener(`/api/admin/reservas${consulta({ ...filtros })}`, señal);
}

export function obtenerPedido(folio: string, señal?: AbortSignal): Promise<DetallePedido> {
	return obtener(`/api/admin/reservas/${encodeURIComponent(folio)}`, señal);
}

export function cambiarEstado(folio: string, estado: EstadoReserva): Promise<DetallePedido> {
	return enviar(`/api/admin/reservas/${encodeURIComponent(folio)}/estado`, { estado });
}

export function obtenerResumen(señal?: AbortSignal): Promise<ResumenNegocio> {
	return obtener("/api/admin/resumen", señal);
}
