import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Libro } from "../src/shared/libro";
import { crearLibro } from "../src/worker/datos/libros";

const BASE = "https://libreria.test";
let cookie = "";

async function iniciarSesion(): Promise<string> {
	const respuesta = await SELF.fetch(`${BASE}/api/auth/ingreso`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.44" },
		body: JSON.stringify({ token: "token-de-prueba" }),
	});
	return (respuesta.headers.get("Set-Cookie") ?? "").split(";")[0];
}

function comoAdmin(ruta: string) {
	return SELF.fetch(`${BASE}${ruta}`, { headers: { Cookie: cookie } });
}

async function novedades(consulta = ""): Promise<{ libros: Libro[]; desde: string; hasta: string }> {
	const respuesta = await comoAdmin(`/api/admin/novedades${consulta}`);
	expect(respuesta.status).toBe(200);
	return (await respuesta.json()) as { libros: Libro[]; desde: string; hasta: string };
}

async function sembrar(titulo: string, haceDias = 0) {
	const libro = await crearLibro(env.DB, {
		isbn: null,
		titulo,
		autor: "Autor de Prueba",
		editorial: null,
		anio: null,
		genero: null,
		sinopsis: null,
		condicion: "usado",
		precio: 9000,
		portadaUrl: null,
	});

	if (haceDias > 0) {
		const fecha = new Date(Date.now() - haceDias * 24 * 60 * 60 * 1000).toISOString();
		await env.DB.prepare("UPDATE libros SET creado_en = ? WHERE id = ?").bind(fecha, libro.id).run();
	}
	return libro;
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM reserva_items"),
		env.DB.prepare("DELETE FROM reservas"),
		env.DB.prepare("DELETE FROM solicitud_coincidencias"),
		env.DB.prepare("DELETE FROM libros"),
	]);
	cookie = await iniciarSesion();
});

describe("novedades", () => {
	it("exige sesión", async () => {
		const respuesta = await SELF.fetch(`${BASE}/api/admin/novedades`);
		expect(respuesta.status).toBe(401);
	});

	it("trae los últimos 7 días por omisión", async () => {
		await sembrar("De hoy");
		await sembrar("De hace 3 días", 3);
		await sembrar("De hace 20 días", 20);

		const datos = await novedades();
		expect(datos.libros.map((l) => l.titulo)).toEqual(["De hoy", "De hace 3 días"]);
	});

	it("incluye lo ingresado hoy, aunque el rango termine hoy", async () => {
		await sembrar("Recién ingresado");
		const datos = await novedades();
		expect(datos.libros).toHaveLength(1);
	});

	it("respeta un rango personalizado", async () => {
		await sembrar("De hace 20 días", 20);

		const porOmision = await novedades();
		expect(porOmision.libros).toHaveLength(0);

		const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		const ampliado = await novedades(`?desde=${desde}`);
		expect(ampliado.libros).toHaveLength(1);
	});

	it("ordena del más reciente al más antiguo", async () => {
		await sembrar("Antiguo", 5);
		await sembrar("Medio", 2);
		await sembrar("Nuevo");

		const datos = await novedades();
		expect(datos.libros.map((l) => l.titulo)).toEqual(["Nuevo", "Medio", "Antiguo"]);
	});

	it("excluye los vendidos", async () => {
		const vendido = await sembrar("Vendido");
		await sembrar("Disponible");
		await env.DB.prepare("UPDATE libros SET estado = 'vendido' WHERE id = ?").bind(vendido.id).run();

		const datos = await novedades();
		expect(datos.libros.map((l) => l.titulo)).toEqual(["Disponible"]);
	});

	it("excluye los dados de baja", async () => {
		const baja = await sembrar("Retirado");
		await sembrar("Publicado");
		await env.DB.prepare("UPDATE libros SET dado_de_baja = 1 WHERE id = ?").bind(baja.id).run();

		const datos = await novedades();
		expect(datos.libros.map((l) => l.titulo)).toEqual(["Publicado"]);
	});

	it("incluye los reservados: todavía pueden liberarse", async () => {
		const reservado = await sembrar("Reservado");
		await env.DB.prepare("UPDATE libros SET estado = 'reservado' WHERE id = ?")
			.bind(reservado.id)
			.run();

		const datos = await novedades();
		expect(datos.libros).toHaveLength(1);
	});

	it("informa un período vacío sin error", async () => {
		const datos = await novedades();
		expect(datos.libros).toEqual([]);
		expect(datos.desde).toBeTruthy();
		expect(datos.hasta).toBeTruthy();
	});

	it("cae al rango por omisión si las fechas son inválidas", async () => {
		await sembrar("De hoy");
		const datos = await novedades("?desde=noesunafecha&hasta=tampoco");
		expect(datos.libros).toHaveLength(1);
	});

	it("devuelve el rango aplicado para que la vista lo muestre", async () => {
		const datos = await novedades("?desde=2026-01-01&hasta=2026-01-31");
		expect(datos.desde).toBe("2026-01-01");
		expect(datos.hasta).toBe("2026-01-31");
	});
});
