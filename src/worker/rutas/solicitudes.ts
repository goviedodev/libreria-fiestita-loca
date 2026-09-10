import { Hono } from "hono";
import { esquemaCrearSolicitud } from "../../shared/solicitud-esquemas";
import { crearSolicitud } from "../datos/solicitudes";
import { leerJson } from "../middleware/errores";

export const rutasSolicitudes = new Hono<{ Bindings: Env }>();

/**
 * Registra una búsqueda sin resultados.
 *
 * La respuesta no distingue en el código de estado si la solicitud ya existía:
 * para el visitante el resultado es el mismo —su pedido quedó anotado— y el
 * campo `yaExistia` deja que la interfaz ajuste el mensaje.
 */
rutasSolicitudes.post("/", async (c) => {
	const datos = await leerJson(c, esquemaCrearSolicitud);

	const { solicitud, yaExistia } = await crearSolicitud(c.env.DB, {
		titulo: datos.titulo,
		autor: datos.autor,
		telefono: datos.telefono,
	});

	// El teléfono no vuelve al cliente: no aporta nada y es dato personal.
	return c.json(
		{ registrada: true, yaExistia, solicitud: { titulo: solicitud.titulo, autor: solicitud.autor } },
		yaExistia ? 200 : 201,
	);
});
