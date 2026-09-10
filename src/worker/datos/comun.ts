/** Marca de tiempo en ISO 8601 UTC: ordenable lexicográficamente en SQLite. */
export function ahora(): string {
	return new Date().toISOString();
}

export function nuevoId(): string {
	return crypto.randomUUID();
}

/** Error de dominio: lo traduce a una respuesta HTTP el middleware de errores. */
export class ErrorDominio extends Error {
	constructor(
		mensaje: string,
		readonly estado: 400 | 401 | 404 | 409 | 422 | 429 | 503 = 400,
		readonly campos?: Record<string, string>,
	) {
		super(mensaje);
		this.name = "ErrorDominio";
	}
}
