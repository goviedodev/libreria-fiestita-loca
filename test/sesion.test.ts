import { describe, expect, it } from "vitest";
import {
	cabeceraCookie,
	cabeceraCookieVencida,
	coincideEnTiempoConstante,
	emitirSesion,
	leerCookieSesion,
	sesionEsValida,
	VIGENCIA_MS,
} from "../src/worker/servicios/sesion";

const SECRETO = "secreto-de-prueba";

describe("coincideEnTiempoConstante", () => {
	it("acepta valores iguales", async () => {
		expect(await coincideEnTiempoConstante("abc123", "abc123")).toBe(true);
	});

	it("rechaza valores distintos", async () => {
		expect(await coincideEnTiempoConstante("abc123", "abc124")).toBe(false);
	});

	it("rechaza una cadena vacía frente a un secreto", async () => {
		expect(await coincideEnTiempoConstante("", SECRETO)).toBe(false);
	});

	it("rechaza un prefijo del secreto", async () => {
		expect(await coincideEnTiempoConstante("secreto", SECRETO)).toBe(false);
	});
});

describe("emitirSesion y sesionEsValida", () => {
	it("valida una sesión recién emitida", async () => {
		const valor = await emitirSesion(SECRETO);
		expect(await sesionEsValida(valor, SECRETO)).toBe(true);
	});

	it("rechaza una sesión vencida", async () => {
		const hace31Dias = Date.now() - 31 * 24 * 60 * 60 * 1000;
		const valor = await emitirSesion(SECRETO, hace31Dias);
		expect(await sesionEsValida(valor, SECRETO)).toBe(false);
	});

	it("acepta la sesión justo antes de vencer y la rechaza justo después", async () => {
		const emitida = Date.now();
		const valor = await emitirSesion(SECRETO, emitida);
		expect(await sesionEsValida(valor, SECRETO, emitida + VIGENCIA_MS - 1000)).toBe(true);
		expect(await sesionEsValida(valor, SECRETO, emitida + VIGENCIA_MS + 1000)).toBe(false);
	});

	it("rechaza una firma manipulada", async () => {
		const valor = await emitirSesion(SECRETO);
		const [expiracion] = valor.split(".");
		expect(await sesionEsValida(`${expiracion}.firmaInventada`, SECRETO)).toBe(false);
	});

	it("rechaza una expiración estirada con la firma original", async () => {
		const valor = await emitirSesion(SECRETO);
		const firma = valor.slice(valor.lastIndexOf(".") + 1);
		const futuro = Date.now() + 10 * VIGENCIA_MS;
		expect(await sesionEsValida(`${futuro}.${firma}`, SECRETO)).toBe(false);
	});

	it("rechaza una sesión firmada con otro secreto", async () => {
		const valor = await emitirSesion("otro-secreto");
		expect(await sesionEsValida(valor, SECRETO)).toBe(false);
	});

	it("rechaza una cookie ausente o mal formada", async () => {
		expect(await sesionEsValida(undefined, SECRETO)).toBe(false);
		expect(await sesionEsValida("", SECRETO)).toBe(false);
		expect(await sesionEsValida("sin-punto", SECRETO)).toBe(false);
		expect(await sesionEsValida(".solo-firma", SECRETO)).toBe(false);
	});
});

describe("cabeceras de cookie", () => {
	it("emite la cookie con HttpOnly, Secure y SameSite=Strict", () => {
		const cabecera = cabeceraCookie("valor");
		expect(cabecera).toContain("HttpOnly");
		expect(cabecera).toContain("Secure");
		expect(cabecera).toContain("SameSite=Strict");
		expect(cabecera).toContain("Path=/");
		expect(cabecera).toContain(`Max-Age=${Math.floor(VIGENCIA_MS / 1000)}`);
	});

	it("la cookie de cierre expira de inmediato y conserva los atributos", () => {
		const cabecera = cabeceraCookieVencida();
		expect(cabecera).toContain("Max-Age=0");
		expect(cabecera).toContain("HttpOnly");
	});

	it("lee la cookie entre otras del navegador", () => {
		expect(leerCookieSesion("otra=1; fl_sesion=abc.def; tercera=2")).toBe("abc.def");
		expect(leerCookieSesion("otra=1")).toBeUndefined();
		expect(leerCookieSesion(undefined)).toBeUndefined();
	});
});
