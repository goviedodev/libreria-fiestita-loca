import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAXIMO_FALLOS } from "../src/worker/datos/intentos";

const TOKEN = "token-de-prueba";

async function limpiarIntentos() {
	await env.DB.prepare("DELETE FROM intentos_ingreso").run();
}

function ingresar(token: string, ip = "203.0.113.10") {
	return SELF.fetch("https://libreria.test/api/auth/ingreso", {
		method: "POST",
		headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
		body: JSON.stringify({ token }),
	});
}

async function cookieDeSesion(): Promise<string> {
	const respuesta = await ingresar(TOKEN);
	const cabecera = respuesta.headers.get("Set-Cookie");
	if (!cabecera) throw new Error("El ingreso no devolvió cookie");
	return cabecera.split(";")[0];
}

beforeEach(limpiarIntentos);

describe("ingreso al backoffice", () => {
	it("acepta el token correcto y emite la cookie de sesión", async () => {
		const respuesta = await ingresar(TOKEN);
		expect(respuesta.status).toBe(200);
		const cookie = respuesta.headers.get("Set-Cookie") ?? "";
		expect(cookie).toContain("fl_sesion=");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("Secure");
		expect(cookie).toContain("SameSite=Strict");
	});

	it("rechaza un token incorrecto sin emitir sesión", async () => {
		const respuesta = await ingresar("token-equivocado");
		expect(respuesta.status).toBe(401);
		expect(respuesta.headers.get("Set-Cookie")).toBeNull();
	});

	it("da el mismo mensaje para token ausente y token incorrecto", async () => {
		const sinToken = await SELF.fetch("https://libreria.test/api/auth/ingreso", {
			method: "POST",
			headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.11" },
			body: JSON.stringify({ token: "" }),
		});
		const conTokenMalo = await ingresar("otro-token", "203.0.113.12");
		expect(await sinToken.json()).toEqual(await conTokenMalo.json());
	});

	it("cierra sesión invalidando la cookie", async () => {
		const respuesta = await SELF.fetch("https://libreria.test/api/auth/salida", { method: "POST" });
		expect(respuesta.headers.get("Set-Cookie")).toContain("Max-Age=0");
	});

	it("informa si la sesión está activa", async () => {
		const sinSesion = await SELF.fetch("https://libreria.test/api/auth/sesion");
		expect(await sinSesion.json()).toEqual({ activa: false });

		const cookie = await cookieDeSesion();
		const conSesion = await SELF.fetch("https://libreria.test/api/auth/sesion", {
			headers: { Cookie: cookie },
		});
		expect(await conSesion.json()).toEqual({ activa: true });
	});
});

describe("contención de intentos", () => {
	it("bloquea tras superar los fallos permitidos en la ventana", async () => {
		const ip = "198.51.100.7";
		for (let i = 0; i < MAXIMO_FALLOS; i++) {
			expect((await ingresar("malo", ip)).status).toBe(401);
		}
		const bloqueado = await ingresar("malo", ip);
		expect(bloqueado.status).toBe(429);
		expect((await bloqueado.json<{ error: string }>()).error).toContain("Espera");
	});

	it("bloquea incluso con el token correcto una vez superado el límite", async () => {
		const ip = "198.51.100.8";
		for (let i = 0; i < MAXIMO_FALLOS; i++) {
			await ingresar("malo", ip);
		}
		expect((await ingresar(TOKEN, ip)).status).toBe(429);
	});

	it("no afecta a otro origen", async () => {
		for (let i = 0; i < MAXIMO_FALLOS; i++) {
			await ingresar("malo", "198.51.100.9");
		}
		expect((await ingresar(TOKEN, "198.51.100.10")).status).toBe(200);
	});

	it("un ingreso exitoso limpia los fallos previos de ese origen", async () => {
		const ip = "198.51.100.11";
		await ingresar("malo", ip);
		await ingresar("malo", ip);
		await ingresar(TOKEN, ip);
		const fila = await env.DB.prepare("SELECT COUNT(*) AS total FROM intentos_ingreso").first<{
			total: number;
		}>();
		expect(fila?.total).toBe(0);
	});

	it("guarda el hash del origen y nunca el IP", async () => {
		await ingresar("malo", "198.51.100.12");
		const fila = await env.DB.prepare("SELECT ip_hash FROM intentos_ingreso LIMIT 1").first<{
			ip_hash: string;
		}>();
		expect(fila?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(fila?.ip_hash).not.toContain("198.51.100.12");
	});
});

describe("protección de /api/admin", () => {
	it("rechaza sin sesión", async () => {
		const respuesta = await SELF.fetch("https://libreria.test/api/admin/ping");
		expect(respuesta.status).toBe(401);
	});

	it("rechaza con una cookie manipulada", async () => {
		const respuesta = await SELF.fetch("https://libreria.test/api/admin/ping", {
			headers: { Cookie: "fl_sesion=9999999999999.firmaFalsa" },
		});
		expect(respuesta.status).toBe(401);
	});

	it("acepta con sesión válida", async () => {
		const cookie = await cookieDeSesion();
		const respuesta = await SELF.fetch("https://libreria.test/api/admin/ping", {
			headers: { Cookie: cookie },
		});
		expect(respuesta.status).toBe(200);
	});

	it("deja pasar las rutas públicas sin sesión", async () => {
		expect((await SELF.fetch("https://libreria.test/api/salud")).status).toBe(200);
	});
});

describe("registro de intentos fallidos", () => {
	it("no escribe el token entregado en los logs", async () => {
		const espia = vi.spyOn(console, "error").mockImplementation(() => {});
		const espiaLog = vi.spyOn(console, "log").mockImplementation(() => {});
		const espiaWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const secreto = "token-secretisimo-del-cliente";
		await ingresar(secreto, "198.51.100.13");

		const todo = [...espia.mock.calls, ...espiaLog.mock.calls, ...espiaWarn.mock.calls]
			.flat()
			.map(String)
			.join(" ");
		expect(todo).not.toContain(secreto);
		expect(todo).not.toContain(secreto.slice(0, 8));

		espia.mockRestore();
		espiaLog.mockRestore();
		espiaWarn.mockRestore();
	});
});
