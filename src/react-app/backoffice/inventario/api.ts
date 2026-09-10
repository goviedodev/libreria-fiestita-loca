import type { Pagina } from "../../../shared/api";
import type { Libro } from "../../../shared/libro";
import { consulta, enviar, enviarArchivo, obtener } from "../../lib/api";

/** Metadatos que devuelve la búsqueda por ISBN, ya listos para prellenar. */
export interface MetadatosIsbn {
	isbn: string;
	titulo: string | null;
	autor: string | null;
	anio: number | null;
	editorial: string | null;
	genero: string | null;
	sinopsis: string | null;
	portadaUrl: string | null;
	fuente: "google-books" | "openlibrary";
}

export type ConsultaIsbn = { ejemplares: number } & (
	| { encontrado: true; metadatos: MetadatosIsbn }
	| { encontrado: false; isbn: string }
);

export const NOMBRE_FUENTE: Record<MetadatosIsbn["fuente"], string> = {
	"google-books": "Google Books",
	openlibrary: "OpenLibrary",
};

export interface ListadoInventario extends Pagina<Libro> {
	generos: string[];
}

export interface FiltrosInventario {
	busqueda?: string;
	genero?: string;
	condicion?: string;
	pagina?: number;
}

export function buscarIsbn(isbn: string, señal?: AbortSignal): Promise<ConsultaIsbn> {
	return obtener<ConsultaIsbn>(`/api/admin/libros/isbn/${encodeURIComponent(isbn)}`, señal);
}

export function listarInventario(
	filtros: FiltrosInventario,
	señal?: AbortSignal,
): Promise<ListadoInventario> {
	return obtener<ListadoInventario>(`/api/admin/libros${consulta({ ...filtros })}`, señal);
}

export function obtenerDelInventario(
	id: string,
	señal?: AbortSignal,
): Promise<{ libro: Libro; bloqueadoPor: string[] }> {
	return obtener(`/api/admin/libros/${id}`, señal);
}

export function crearLibro(datos: unknown): Promise<{ libro: Libro }> {
	return enviar("/api/admin/libros", datos);
}

export function editarLibro(id: string, cambios: unknown): Promise<{ libro: Libro }> {
	return enviar(`/api/admin/libros/${id}`, cambios, "PATCH");
}

export function darDeBaja(id: string): Promise<{ ok: true }> {
	return enviar(`/api/admin/libros/${id}`, undefined, "DELETE");
}

export function subirFoto(id: string, archivo: File): Promise<{ libro: Libro }> {
	const formulario = new FormData();
	formulario.append("foto", archivo);
	return enviarArchivo(`/api/admin/libros/${id}/foto`, formulario);
}
