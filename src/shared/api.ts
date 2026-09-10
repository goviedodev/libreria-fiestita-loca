/** Envoltura uniforme de los errores de la API. */
export interface ErrorApi {
	error: string;
	/** Errores por campo, cuando el fallo viene de la validación de un formulario. */
	campos?: Record<string, string>;
}

export interface Pagina<T> {
	items: readonly T[];
	total: number;
	pagina: number;
	porPagina: number;
}
