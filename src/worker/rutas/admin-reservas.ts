import { Hono } from "hono";
import { z } from "zod";
import { ESTADOS_RESERVA } from "../../shared/reserva";
import { mensajeDeContacto } from "../../shared/whatsapp";
import { ErrorDominio } from "../datos/comun";
import {
	cambiarEstadoReserva,
	listarReservas,
	obtenerReserva,
	resumenNegocio,
} from "../datos/reservas";
import { leerJson } from "../middleware/errores";
import { normalizarFolio, PATRON_FOLIO } from "../servicios/folio";

export const rutasAdminReservas = new Hono<{ Bindings: Env }>();

const esquemaListado = z.object({
	estado: z.enum(ESTADOS_RESERVA).catch(undefined as never).optional(),
	busqueda: z.string().trim().max(120).optional(),
});

const esquemaCambio = z.object({ estado: z.enum(ESTADOS_RESERVA) });

rutasAdminReservas.get("/", async (c) => {
	const filtros = esquemaListado.parse(c.req.query());
	const reservas = await listarReservas(c.env.DB, filtros);
	return c.json({ reservas });
});

/** Busca la reserva o corta con 404, con el folio ya normalizado. */
async function exigirReserva(env: Env, folioCrudo: string) {
	const folio = normalizarFolio(folioCrudo);
	if (!PATRON_FOLIO.test(folio)) {
		throw new ErrorDominio("No encontramos esa reserva", 404);
	}

	const leida = await obtenerReserva(env.DB, folio);
	if (!leida) {
		throw new ErrorDominio("No encontramos esa reserva", 404);
	}
	return { folio, ...leida };
}

/**
 * Detalle completo de una reserva.
 *
 * A diferencia de la consulta pública, aquí el teléfono sale entero: el dueño lo
 * necesita para llamar o escribir. El enlace de contacto se arma en el servidor
 * junto al mensaje, para que el backoffice no tenga que replicar el formato.
 */
rutasAdminReservas.get("/:folio", async (c) => {
	const { reserva, historial } = await exigirReserva(c.env, c.req.param("folio"));

	return c.json({
		reserva,
		historial,
		contacto: `https://wa.me/${reserva.telefono}?text=${encodeURIComponent(mensajeDeContacto(reserva))}`,
	});
});

rutasAdminReservas.post("/:folio/estado", async (c) => {
	const { folio } = await exigirReserva(c.env, c.req.param("folio"));
	const { estado } = await leerJson(c, esquemaCambio);

	// La validación de la transición y el efecto sobre el stock viven en la capa de
	// datos, dentro del mismo batch: aquí solo se traduce a HTTP.
	await cambiarEstadoReserva(c.env.DB, folio, estado);

	const actualizada = await obtenerReserva(c.env.DB, folio);
	return c.json({ reserva: actualizada?.reserva, historial: actualizada?.historial });
});

export const rutaResumen = new Hono<{ Bindings: Env }>().get("/", async (c) =>
	c.json(await resumenNegocio(c.env.DB)),
);
