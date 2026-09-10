import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Reserva } from "../src/shared/reserva";
import { crearLibro } from "../src/worker/datos/libros";
import { PATRON_FOLIO } from "../src/worker/servicios/folio";

const BASE = "https://libreria.test";

interface RespuestaCreacion {
	reserva: Reserva;
	whatsapp: string;
}

async function limpiar() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM reserva_items"),
		env.DB.prepare("DELETE FROM reserva_eventos"),
		env.DB.prepare("DELETE FROM reservas"),
		env.DB.prepare("DELETE FROM libros"),
	]);
}

async function sembrar(titulo: string, precio = 8500) {
	return crearLibro(env.DB, {
		isbn: null,
		titulo,
		autor: "Jorge Luis Borges",
		editorial: null,
		anio: null,
		genero: null,
		sinopsis: null,
		condicion: "usado",
		precio,
		portadaUrl: null,
	});
}

function reservar(cuerpo: unknown) {
	return SELF.fetch(`${BASE}/api/reservas`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(cuerpo),
	});
}

const CLIENTE = { nombre: "María Pérez", telefono: "+56 9 1234 5678" };

beforeEach(limpiar);

describe("creación de una reserva", () => {
	it("crea la reserva pendiente con folio y deja los libros reservados", async () => {
		const uno = await sembrar("El Aleph", 8500);
		const dos = await sembrar("Ficciones", 9500);

		const respuesta = await reservar({ ...CLIENTE, libroIds: [uno.id, dos.id] });
		const cuerpo = (await respuesta.json()) as RespuestaCreacion;

		expect(respuesta.status).toBe(201);
		expect(cuerpo.reserva.folio).toMatch(PATRON_FOLIO);
		expect(cuerpo.reserva.estado).toBe("pendiente");
		expect(cuerpo.reserva.total).toBe(18000);
		expect(cuerpo.reserva.items).toHaveLength(2);

		const { results } = await env.DB.prepare("SELECT estado FROM libros ORDER BY titulo").all<{
			estado: string;
		}>();
		expect(results.map((f) => f.estado)).toEqual(["reservado", "reservado"]);
	});

	it("es pública: no exige sesión", async () => {
		const libro = await sembrar("El Aleph");
		const respuesta = await reservar({ ...CLIENTE, libroIds: [libro.id] });
		expect(respuesta.status).toBe(201);
	});

	it("registra el evento inicial en el historial", async () => {
		const libro = await sembrar("El Aleph");
		const { reserva } = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;

		const consulta = await SELF.fetch(`${BASE}/api/reservas/${reserva.folio}`);
		const cuerpo = (await consulta.json()) as { historial: { estado: string }[] };
		expect(cuerpo.historial).toEqual([{ estado: "pendiente", creadoEn: expect.any(String) }]);
	});

	it("rechaza un teléfono que no es un celular chileno", async () => {
		const libro = await sembrar("El Aleph");
		const respuesta = await reservar({ ...CLIENTE, telefono: "+56 33 2412345", libroIds: [libro.id] });
		const cuerpo = (await respuesta.json()) as { campos: Record<string, string> };

		expect(respuesta.status).toBe(422);
		expect(cuerpo.campos).toHaveProperty("telefono");

		const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM reservas").first<{ n: number }>();
		expect(fila?.n).toBe(0);
	});

	it("guarda el teléfono ya normalizado", async () => {
		const libro = await sembrar("El Aleph");
		await reservar({ ...CLIENTE, telefono: "9 1234 5678", libroIds: [libro.id] });

		const fila = await env.DB.prepare("SELECT telefono FROM reservas").first<{ telefono: string }>();
		expect(fila?.telefono).toBe("56912345678");
	});

	it("rechaza una reserva sin libros", async () => {
		const respuesta = await reservar({ ...CLIENTE, libroIds: [] });
		const cuerpo = (await respuesta.json()) as { campos: Record<string, string> };
		expect(respuesta.status).toBe(422);
		expect(cuerpo.campos.libroIds).toContain("al menos un libro");
	});

	it("rechaza una reserva sin nombre", async () => {
		const libro = await sembrar("El Aleph");
		const respuesta = await reservar({ nombre: "", telefono: CLIENTE.telefono, libroIds: [libro.id] });
		expect(respuesta.status).toBe(422);
	});

	it("nombra el libro que dejó de estar disponible y no crea la reserva", async () => {
		const libre = await sembrar("El Aleph");
		const tomado = await sembrar("Ficciones");
		await env.DB.prepare("UPDATE libros SET estado = 'reservado' WHERE id = ?").bind(tomado.id).run();

		const respuesta = await reservar({ ...CLIENTE, libroIds: [libre.id, tomado.id] });
		const cuerpo = (await respuesta.json()) as { error: string };

		expect(respuesta.status).toBe(409);
		expect(cuerpo.error).toContain("Ficciones");

		const reservas = await env.DB.prepare("SELECT COUNT(*) AS n FROM reservas").first<{ n: number }>();
		expect(reservas?.n).toBe(0);
		// El libro que sí estaba libre no quedó bloqueado por una reserva que no existe.
		const estado = await env.DB.prepare("SELECT estado FROM libros WHERE id = ?").bind(libre.id).first<{ estado: string }>();
		expect(estado?.estado).toBe("disponible");
	});

	it("solo una de dos reservas simultáneas del mismo libro se crea", async () => {
		const libro = await sembrar("El Aleph");

		const [una, otra] = await Promise.all([
			reservar({ ...CLIENTE, libroIds: [libro.id] }),
			reservar({ nombre: "Otro Cliente", telefono: "+56 9 8765 4321", libroIds: [libro.id] }),
		]);

		const estados = [una.status, otra.status].sort();
		expect(estados).toEqual([201, 409]);

		const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM reservas").first<{ n: number }>();
		expect(fila?.n).toBe(1);
	});

	it("ignora un libro repetido en la selección", async () => {
		const libro = await sembrar("El Aleph", 8500);
		const respuesta = await reservar({ ...CLIENTE, libroIds: [libro.id, libro.id] });
		const cuerpo = (await respuesta.json()) as RespuestaCreacion;

		expect(respuesta.status).toBe(201);
		expect(cuerpo.reserva.items).toHaveLength(1);
		expect(cuerpo.reserva.total).toBe(8500);
	});

	it("congela el precio: cambiarlo después no altera la reserva", async () => {
		const libro = await sembrar("El Aleph", 8500);
		const { reserva } = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;

		await env.DB.prepare("UPDATE libros SET precio = 20000 WHERE id = ?").bind(libro.id).run();

		const consulta = await SELF.fetch(`${BASE}/api/reservas/${reserva.folio}`);
		const cuerpo = (await consulta.json()) as { reserva: Reserva };
		expect(cuerpo.reserva.total).toBe(8500);
		expect(cuerpo.reserva.items[0].precio).toBe(8500);
	});
});

describe("handoff a WhatsApp", () => {
	it("devuelve un enlace con folio, libros, URL y total", async () => {
		const uno = await sembrar("Cien años de soledad", 12990);
		const dos = await sembrar("El Aleph", 8500);

		const cuerpo = (await (await reservar({ ...CLIENTE, libroIds: [uno.id, dos.id] })).json()) as RespuestaCreacion;
		const mensaje = decodeURIComponent(new URL(cuerpo.whatsapp).searchParams.get("text") ?? "");

		expect(cuerpo.whatsapp.startsWith("https://wa.me/")).toBe(true);
		expect(mensaje).toContain(cuerpo.reserva.folio);
		expect(mensaje).toContain("Cien años de soledad");
		expect(mensaje).toContain("El Aleph");
		expect(mensaje).toContain(`/libro/${uno.id}`);
		expect(mensaje).toContain("21.490");
	});

	it("usa el número configurado y no uno escrito en el código", async () => {
		const libro = await sembrar("El Aleph");
		const cuerpo = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;
		// El binding de prueba es 56911112222 (vitest.config.ts).
		expect(new URL(cuerpo.whatsapp).pathname).toBe("/56911112222");
	});

	it("entrega tildes y saltos de línea legibles, no secuencias de escape", async () => {
		const libro = await sembrar("Crónica de una muerte anunciada");
		const cuerpo = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;
		const mensaje = decodeURIComponent(new URL(cuerpo.whatsapp).searchParams.get("text") ?? "");

		expect(mensaje).toContain("Crónica");
		expect(mensaje).toContain("\n");
		// Una doble codificación dejaría %0A o %25 a la vista.
		expect(mensaje).not.toContain("%0A");
		expect(mensaje).not.toContain("%25");
	});

	it("incluye la nota cuando el cliente dejó una", async () => {
		const libro = await sembrar("El Aleph");
		const cuerpo = (await (
			await reservar({ ...CLIENTE, nota: "Paso el viernes", libroIds: [libro.id] })
		).json()) as RespuestaCreacion;
		const mensaje = decodeURIComponent(new URL(cuerpo.whatsapp).searchParams.get("text") ?? "");
		expect(mensaje).toContain("Paso el viernes");
	});

	it("la reserva queda registrada aunque el cliente nunca abra el enlace", async () => {
		const libro = await sembrar("El Aleph");
		const cuerpo = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;

		// No se toca el enlace: se comprueba directamente la base, que es lo que ve
		// el dueño en su backoffice.
		const fila = await env.DB
			.prepare("SELECT estado FROM reservas WHERE folio = ?")
			.bind(cuerpo.reserva.folio)
			.first<{ estado: string }>();
		expect(fila?.estado).toBe("pendiente");
	});
});

describe("consulta pública por folio", () => {
	it("devuelve estado, fecha y libros", async () => {
		const libro = await sembrar("El Aleph");
		const creada = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;

		const respuesta = await SELF.fetch(`${BASE}/api/reservas/${creada.reserva.folio}`);
		const cuerpo = (await respuesta.json()) as { reserva: Reserva };

		expect(respuesta.status).toBe(200);
		expect(cuerpo.reserva.estado).toBe("pendiente");
		expect(cuerpo.reserva.creadoEn).toBeTruthy();
		expect(cuerpo.reserva.items[0].libro.titulo).toBe("El Aleph");
	});

	it("oculta el teléfono salvo los últimos dígitos", async () => {
		const libro = await sembrar("El Aleph");
		const creada = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;

		const respuesta = await SELF.fetch(`${BASE}/api/reservas/${creada.reserva.folio}`);
		const cuerpo = (await respuesta.json()) as { reserva: Reserva };

		expect(cuerpo.reserva.telefono).toContain("5678");
		expect(cuerpo.reserva.telefono).not.toContain("56912345678");
	});

	it("tampoco expone el teléfono completo en la respuesta de creación", async () => {
		const libro = await sembrar("El Aleph");
		const creada = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;
		expect(creada.reserva.telefono).not.toContain("56912345678");
	});

	it("acepta el folio escrito en minúsculas o sin guion", async () => {
		const libro = await sembrar("El Aleph");
		const creada = (await (await reservar({ ...CLIENTE, libroIds: [libro.id] })).json()) as RespuestaCreacion;
		const sinGuion = creada.reserva.folio.replace("-", "").toLowerCase();

		const respuesta = await SELF.fetch(`${BASE}/api/reservas/${sinGuion}`);
		expect(respuesta.status).toBe(200);
	});

	it("responde no encontrado para un folio inexistente", async () => {
		const respuesta = await SELF.fetch(`${BASE}/api/reservas/FL-ZZZZZ`);
		expect(respuesta.status).toBe(404);
	});

	it("da la misma respuesta para folio inexistente y folio mal formado", async () => {
		const inexistente = await SELF.fetch(`${BASE}/api/reservas/FL-ZZZZZ`);
		const malFormado = await SELF.fetch(`${BASE}/api/reservas/hola`);
		expect(malFormado.status).toBe(404);
		expect(await malFormado.json()).toEqual(await inexistente.json());
	});
});
