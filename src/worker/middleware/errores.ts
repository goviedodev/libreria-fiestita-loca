import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { ErrorApi } from "../../shared/api";
import { ErrorDominio } from "../datos/comun";

/** Convierte los issues de Zod en un mapa campo → mensaje para el formulario. */
function camposDeZod(error: ZodError): Record<string, string> {
	const campos: Record<string, string> = {};
	for (const issue of error.issues) {
		const campo = issue.path.join(".") || "_";
		// Se conserva el primer mensaje de cada campo: es el más específico.
		if (!(campo in campos)) {
			campos[campo] = issue.message;
		}
	}
	return campos;
}

/**
 * Traduce cualquier fallo a la envoltura uniforme de la API.
 *
 * Los errores inesperados salen con un mensaje genérico: el detalle va al log del
 * servidor, nunca al cliente.
 */
export const manejarErrores: ErrorHandler<{ Bindings: Env }> = (error, c) => {
	if (error instanceof ZodError) {
		return respuesta(c, 422, { error: "Revisa los datos ingresados", campos: camposDeZod(error) });
	}

	if (error instanceof ErrorDominio) {
		return respuesta(c, error.estado, { error: error.message, campos: error.campos });
	}

	if (error instanceof HTTPException) {
		return respuesta(c, error.status, { error: error.message });
	}

	console.error("Error no controlado:", error);
	return respuesta(c, 500, { error: "Algo salió mal. Inténtalo de nuevo en un momento." });
};

function respuesta(c: Context, estado: number, cuerpo: ErrorApi) {
	const limpio: ErrorApi = cuerpo.campos ? cuerpo : { error: cuerpo.error };
	return c.json(limpio, estado as 400);
}

/** Valida un cuerpo JSON con un esquema, dejando que el handler traduzca el fallo. */
export async function leerJson<T>(c: Context, esquema: { parse: (dato: unknown) => T }): Promise<T> {
	let crudo: unknown;
	try {
		crudo = await c.req.json();
	} catch {
		throw new ErrorDominio("El cuerpo de la petición no es JSON válido", 400);
	}
	return esquema.parse(crudo);
}
