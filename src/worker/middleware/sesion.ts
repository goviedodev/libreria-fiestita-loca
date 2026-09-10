import type { MiddlewareHandler } from "hono";
import { ErrorDominio } from "../datos/comun";
import { leerCookieSesion, sesionEsValida } from "../servicios/sesion";

/**
 * Exige una sesión válida.
 *
 * Se verifica en el servidor en cada petición: ocultar la interfaz de
 * administración en el cliente no es control de acceso.
 */
export const requiereSesion: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	const cookie = leerCookieSesion(c.req.header("Cookie"));
	if (!(await sesionEsValida(cookie, c.env.SESSION_SECRET))) {
		// El mismo mensaje para cookie ausente, mal formada o vencida: distinguirlos
		// le diría a quien sondea en qué punto está.
		throw new ErrorDominio("Necesitas iniciar sesión", 401);
	}
	await next();
};
