import type { Pagina } from "../../shared/api";
import type { LibroPublico } from "../../shared/libro";
import { consulta, obtener } from "../lib/api";

export interface CatalogoRespuesta extends Pagina<LibroPublico> {
	generos: string[];
}

/**
 * Filtros del catálogo, con los mismos nombres que llevan en la URL.
 *
 * Que coincidan no es casualidad: la URL es el estado del catálogo, así que el
 * mismo objeto sirve para leerla, para pedirle al Worker y para volver a
 * escribirla (spec: una búsqueda tiene que poder compartirse por WhatsApp).
 */
export interface FiltrosCatalogo {
	q?: string;
	genero?: string;
	condicion?: string;
	disponibilidad?: string;
	orden?: string;
	pagina?: number;
}

export const ORDENES = [
	{ valor: "recientes", etiqueta: "Novedades primero" },
	{ valor: "precio-asc", etiqueta: "Precio: de menor a mayor" },
	{ valor: "precio-desc", etiqueta: "Precio: de mayor a menor" },
] as const;

export function leerFiltros(busquedaUrl: string): FiltrosCatalogo {
	const parametros = new URLSearchParams(busquedaUrl);
	const pagina = Number(parametros.get("pagina"));
	return {
		q: parametros.get("q") ?? undefined,
		genero: parametros.get("genero") ?? undefined,
		condicion: parametros.get("condicion") ?? undefined,
		disponibilidad: parametros.get("disponibilidad") ?? undefined,
		orden: parametros.get("orden") ?? undefined,
		pagina: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
	};
}

export function aQueryString(filtros: FiltrosCatalogo): string {
	return consulta({ ...filtros });
}

/** `true` si hay algo que limpiar, sin contar la paginación. */
export function hayFiltros(filtros: FiltrosCatalogo): boolean {
	return Boolean(filtros.q || filtros.genero || filtros.condicion || filtros.disponibilidad);
}

export function pedirCatalogo(
	filtros: FiltrosCatalogo,
	señal?: AbortSignal,
): Promise<CatalogoRespuesta> {
	return obtener<CatalogoRespuesta>(`/api/libros${aQueryString(filtros)}`, señal);
}

export function pedirLibro(id: string, señal?: AbortSignal): Promise<{ libro: LibroPublico }> {
	return obtener(`/api/libros/${id}`, señal);
}
