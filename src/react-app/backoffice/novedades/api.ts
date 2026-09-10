import type { Libro } from "../../../shared/libro";
import { consulta, obtener } from "../../lib/api";

export interface Novedades {
	libros: readonly Libro[];
	desde: string;
	hasta: string;
}

export function listarNovedades(
	rango: { desde?: string; hasta?: string },
	señal?: AbortSignal,
): Promise<Novedades> {
	return obtener(`/api/admin/novedades${consulta({ ...rango })}`, señal);
}
