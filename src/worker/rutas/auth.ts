import { Hono } from "hono";
import { z } from "zod";
import { ErrorDominio } from "../datos/comun";
import { estaBloqueado, hashDeOrigen, limpiarFallos, purgarAntiguos, registrarFallo } from "../datos/intentos";
import { leerJson } from "../middleware/errores";
import {
	cabeceraCookie,
	cabeceraCookieVencida,
	coincideEnTiempoConstante,
	emitirSesion,
	leerCookieSesion,
	sesionEsValida,
} from "../servicios/sesion";

const esquemaIngreso = z.object({ token: z.string() });

/** Un solo mensaje para todos los fallos: no revela en qué punto falló. */
const CREDENCIAL_INVALIDA = "El token no es válido";

export const rutasAuth = new Hono<{ Bindings: Env }>();

rutasAuth.post("/ingreso", async (c) => {
	const { token } = await leerJson(c, esquemaIngreso);

	const ip = c.req.header("CF-Connecting-IP") ?? "desconocido";
	const ipHash = await hashDeOrigen(ip, c.env.SESSION_SECRET);

	if (await estaBloqueado(c.env.DB, ipHash)) {
		throw new ErrorDominio("Demasiados intentos. Espera unos minutos antes de reintentar.", 429);
	}

	if (!(await coincideEnTiempoConstante(token, c.env.ADMIN_TOKEN))) {
		// Nunca se registra el token entregado, ni completo ni parcial.
		await registrarFallo(c.env.DB, ipHash);
		throw new ErrorDominio(CREDENCIAL_INVALIDA, 401);
	}

	await limpiarFallos(c.env.DB, ipHash);
	c.executionCtx.waitUntil(purgarAntiguos(c.env.DB));

	c.header("Set-Cookie", cabeceraCookie(await emitirSesion(c.env.SESSION_SECRET)));
	return c.json({ ok: true });
});

rutasAuth.post("/salida", (c) => {
	c.header("Set-Cookie", cabeceraCookieVencida());
	return c.json({ ok: true });
});

/** Permite al cliente saber si ya tiene sesión, sin exponer nada más. */
rutasAuth.get("/sesion", async (c) => {
	const cookie = leerCookieSesion(c.req.header("Cookie"));
	return c.json({ activa: await sesionEsValida(cookie, c.env.SESSION_SECRET) });
});
