import type { ErrorApi } from "../../shared/api";

/** Error de la API con su estado y, si vino, el detalle por campo del formulario. */
export class ErrorRespuesta extends Error {
	constructor(
		mensaje: string,
		readonly estado: number,
		readonly campos?: Record<string, string>,
	) {
		super(mensaje);
		this.name = "ErrorRespuesta";
	}
}

async function procesar<T>(respuesta: Response): Promise<T> {
	if (respuesta.ok) {
		return respuesta.status === 204 ? (undefined as T) : ((await respuesta.json()) as T);
	}

	let cuerpo: ErrorApi = { error: "No pudimos completar la operación" };
	try {
		cuerpo = (await respuesta.json()) as ErrorApi;
	} catch {
		// Una respuesta de error sin JSON deja el mensaje genérico de arriba.
	}
	throw new ErrorRespuesta(cuerpo.error, respuesta.status, cuerpo.campos);
}

export async function obtener<T>(ruta: string, señal?: AbortSignal): Promise<T> {
	return procesar<T>(await fetch(ruta, { signal: señal }));
}

export async function enviar<T>(ruta: string, cuerpo: unknown, metodo = "POST"): Promise<T> {
	const respuesta = await fetch(ruta, {
		method: metodo,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(cuerpo),
	});
	return procesar<T>(respuesta);
}

/**
 * Envía un formulario multipart (la foto del ejemplar).
 *
 * No se fija `Content-Type` a propósito: el navegador tiene que ponerlo con el
 * `boundary` que él genera.
 */
export async function enviarArchivo<T>(ruta: string, formulario: FormData): Promise<T> {
	return procesar<T>(await fetch(ruta, { method: "POST", body: formulario }));
}

/** Construye una query string omitiendo los parámetros vacíos. */
export function consulta(parametros: Record<string, string | number | undefined>): string {
	const partes = new URLSearchParams();
	for (const [clave, valor] of Object.entries(parametros)) {
		if (valor !== undefined && valor !== "") partes.set(clave, String(valor));
	}
	const texto = partes.toString();
	return texto ? `?${texto}` : "";
}
