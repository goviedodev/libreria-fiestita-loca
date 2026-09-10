import { Hono } from "hono";
import { z } from "zod";
import { DIAS_NOVEDADES, listarNovedades } from "../datos/libros";

export const rutasAdminNovedades = new Hono<{ Bindings: Env }>();

/**
 * El rango llega como fechas `YYYY-MM-DD` desde un `<input type="date">`.
 *
 * Un rango inválido no rompe la vista: cae al valor por omisión, que es lo que el
 * dueño quería ver el 95% de las veces.
 */
const esquemaRango = z.object({
	desde: z.iso.date().optional().catch(undefined),
	hasta: z.iso.date().optional().catch(undefined),
});

function haceDias(dias: number): string {
	return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

rutasAdminNovedades.get("/", async (c) => {
	const rango = esquemaRango.parse(c.req.query());

	const desde = rango.desde ?? haceDias(DIAS_NOVEDADES);
	const hasta = rango.hasta ?? new Date().toISOString().slice(0, 10);

	// `creado_en` es un ISO completo, así que el límite superior tiene que cubrir
	// todo el día: comparar contra `2026-09-09` dejaría fuera lo ingresado hoy.
	const libros = await listarNovedades(c.env.DB, `${desde}T00:00:00.000Z`, `${hasta}T23:59:59.999Z`);

	return c.json({ libros, desde, hasta });
});
