import type { Condicion } from "../../../shared/libro";

/**
 * Estado del formulario de un libro.
 *
 * Todo se maneja como texto: es lo que da un `<input>`, y la conversión ocurre en
 * un solo lugar al enviar. Vive aparte del componente para que su archivo exporte
 * solo componentes, que es lo que necesita el fast refresh de Vite.
 */
export interface CamposLibro {
	isbn: string;
	titulo: string;
	autor: string;
	editorial: string;
	anio: string;
	genero: string;
	sinopsis: string;
	condicion: Condicion;
	precio: string;
}

export const CAMPOS_VACIOS: CamposLibro = {
	isbn: "",
	titulo: "",
	autor: "",
	editorial: "",
	anio: "",
	genero: "",
	sinopsis: "",
	condicion: "usado",
	precio: "",
};

/** Convierte los campos del formulario al cuerpo que espera la API. */
export function aCuerpo(campos: CamposLibro) {
	const opcional = (valor: string) => (valor.trim() ? valor.trim() : null);
	return {
		isbn: opcional(campos.isbn),
		titulo: campos.titulo.trim(),
		autor: campos.autor.trim(),
		editorial: opcional(campos.editorial),
		anio: campos.anio.trim() ? Number(campos.anio) : null,
		genero: opcional(campos.genero),
		sinopsis: opcional(campos.sinopsis),
		condicion: campos.condicion,
		// El precio se manda tal como se escribió para que el error venga del mismo
		// esquema Zod que valida el servidor, y no de una conversión silenciosa que
		// convierta "abc" en NaN sin explicar nada.
		precio: campos.precio.trim() === "" ? null : Number(campos.precio),
	};
}
