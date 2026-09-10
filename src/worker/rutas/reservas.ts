import { Hono } from "hono";
import { esquemaCrearReserva } from "../../shared/reserva-esquemas";
import type { Reserva } from "../../shared/reserva";
import { telefonoEnmascarado } from "../../shared/telefono";
import { enlaceWhatsapp, mensajeDeReserva } from "../../shared/whatsapp";
import { ErrorDominio } from "../datos/comun";
import { crearReserva, obtenerReserva } from "../datos/reservas";
import { leerJson } from "../middleware/errores";
import { conFolioUnico, normalizarFolio, PATRON_FOLIO } from "../servicios/folio";

export const rutasReservas = new Hono<{ Bindings: Env }>();

/**
 * Recorta la reserva a lo que puede ver cualquiera que tenga el folio.
 *
 * El folio se dicta por teléfono y viaja por WhatsApp, así que hay que asumir que
 * puede llegar a manos ajenas: el nombre se conserva porque el cliente necesita
 * reconocer su reserva, pero del teléfono solo salen los últimos dígitos.
 */
function aReservaPublica(reserva: Reserva): Reserva {
	return { ...reserva, telefono: telefonoEnmascarado(reserva.telefono) };
}

rutasReservas.post("/", async (c) => {
	const datos = await leerJson(c, esquemaCrearReserva);

	// El folio se genera aquí y se reintenta ante colisión; el conflicto por un
	// libro ya reservado sube tal cual desde la capa de datos.
	const folio = await conFolioUnico(async (candidato) => {
		await crearReserva(c.env.DB, {
			folio: candidato,
			nombre: datos.nombre,
			telefono: datos.telefono,
			nota: datos.nota,
			libroIds: datos.libroIds,
		});
		return candidato;
	});

	const leida = await obtenerReserva(c.env.DB, folio);
	if (!leida) {
		throw new Error("La reserva recién creada no pudo leerse");
	}

	// El enlace se arma en el servidor porque el número del negocio es un secreto
	// del Worker: mandarlo al cliente para que él componga la URL lo publicaría.
	const mensaje = mensajeDeReserva(leida.reserva, new URL(c.req.url).origin);

	return c.json(
		{
			reserva: aReservaPublica(leida.reserva),
			whatsapp: enlaceWhatsapp(c.env.WHATSAPP_NUMERO, mensaje),
		},
		201,
	);
});

rutasReservas.get("/:folio", async (c) => {
	const folio = normalizarFolio(c.req.param("folio"));

	// Un folio mal formado no llega a consultar la base: es un tanteo, no un error
	// del cliente que tiene su folio a la vista.
	if (!PATRON_FOLIO.test(folio)) {
		throw new ErrorDominio("No encontramos esa reserva", 404);
	}

	const leida = await obtenerReserva(c.env.DB, folio);
	if (!leida) {
		// Mismo mensaje que el folio mal formado: distinguirlos permitiría descubrir
		// qué folios existen probando uno por uno.
		throw new ErrorDominio("No encontramos esa reserva", 404);
	}

	return c.json({ reserva: aReservaPublica(leida.reserva), historial: leida.historial });
});
