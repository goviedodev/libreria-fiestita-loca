import { Hono } from "hono";
import { z } from "zod";
import { ESTADOS_SOLICITUD } from "../../shared/solicitud";
import { esquemaCambioEstadoSolicitud } from "../../shared/solicitud-esquemas";
import { mensajeDeAviso } from "../../shared/whatsapp";
import { ErrorDominio } from "../datos/comun";
import { cambiarEstadoSolicitud, listarAvisos, obtenerSolicitud } from "../datos/solicitudes";
import { leerJson } from "../middleware/errores";

export const rutasAdminAlertas = new Hono<{ Bindings: Env }>();

const esquemaListado = z.object({
	estado: z.enum(ESTADOS_SOLICITUD).catch(undefined as never).optional(),
});

/**
 * Avisos pendientes.
 *
 * El enlace de WhatsApp de cada coincidencia se arma aquí, ya con el mensaje
 * dentro: el backoffice solo lo abre cuando el dueño hace clic. Nada se envía
 * solo.
 */
rutasAdminAlertas.get("/", async (c) => {
	const { estado } = esquemaListado.parse(c.req.query());
	const avisos = await listarAvisos(c.env.DB, estado ?? "abierta");
	const origen = new URL(c.req.url).origin;

	return c.json({
		avisos: avisos.map((aviso) => ({
			...aviso,
			coincidencias: aviso.coincidencias.map((coincidencia) => ({
				...coincidencia,
				aviso: `https://wa.me/${aviso.solicitud.telefono}?text=${encodeURIComponent(
					mensajeDeAviso(
						aviso.solicitud,
						{ titulo: coincidencia.titulo, autor: coincidencia.autor, id: coincidencia.libroId },
						origen,
					),
				)}`,
			})),
		})),
	});
});

rutasAdminAlertas.post("/:id/estado", async (c) => {
	const id = c.req.param("id");
	const { estado } = await leerJson(c, esquemaCambioEstadoSolicitud);

	if (!(await obtenerSolicitud(c.env.DB, id))) {
		throw new ErrorDominio("No encontramos esa solicitud", 404);
	}

	return c.json({ solicitud: await cambiarEstadoSolicitud(c.env.DB, id, estado) });
});
