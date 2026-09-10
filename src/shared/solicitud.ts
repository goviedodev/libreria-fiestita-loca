export const ESTADOS_SOLICITUD = ["abierta", "avisada", "cerrada"] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export interface Solicitud {
	id: string;
	titulo: string | null;
	autor: string | null;
	telefono: string;
	estado: EstadoSolicitud;
	creadoEn: string;
}

/** Una solicitud con los libros que ya le coincidieron, para el backoffice. */
export interface Aviso {
	solicitud: Solicitud;
	coincidencias: readonly {
		libroId: string;
		titulo: string;
		autor: string;
		imagenUrl: string | null;
		estado: string;
		creadoEn: string;
	}[];
}
