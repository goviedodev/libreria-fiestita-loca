import type { EstadoSolicitud, Solicitud } from "../../../shared/solicitud";
import { consulta, enviar, obtener } from "../../lib/api";

export interface CoincidenciaConAviso {
	libroId: string;
	titulo: string;
	autor: string;
	imagenUrl: string | null;
	estado: string;
	creadoEn: string;
	/** Enlace de WhatsApp ya armado por el Worker, con el mensaje dentro. */
	aviso: string;
}

export interface AvisoPendiente {
	solicitud: Solicitud;
	coincidencias: readonly CoincidenciaConAviso[];
}

export function listarAvisos(
	estado: EstadoSolicitud,
	señal?: AbortSignal,
): Promise<{ avisos: readonly AvisoPendiente[] }> {
	return obtener(`/api/admin/alertas${consulta({ estado })}`, señal);
}

export function cambiarEstadoSolicitud(
	id: string,
	estado: EstadoSolicitud,
): Promise<{ solicitud: Solicitud }> {
	return enviar(`/api/admin/alertas/${encodeURIComponent(id)}/estado`, { estado });
}
