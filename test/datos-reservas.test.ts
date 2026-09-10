import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { cambiarEstadoReserva, crearReserva, estadoDeReserva } from "../src/worker/datos/reservas";
import { crearLibro, obtenerLibro } from "../src/worker/datos/libros";

const base = {
	isbn: null,
	titulo: "Rayuela",
	autor: "Julio Cortázar",
	editorial: null,
	anio: null,
	genero: "Novela",
	sinopsis: null,
	condicion: "usado" as const,
	precio: 7000,
	portadaUrl: null,
};

const cliente = { nombre: "Ana Pérez", telefono: "+56911112222", nota: null };

async function limpiar() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM reserva_items"),
		env.DB.prepare("DELETE FROM reserva_eventos"),
		env.DB.prepare("DELETE FROM reservas"),
		env.DB.prepare("DELETE FROM libros"),
	]);
}

async function contarFilas(tabla: string): Promise<number> {
	const fila = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${tabla}`).first<{ total: number }>();
	return fila?.total ?? 0;
}

beforeEach(limpiar);

describe("crearReserva", () => {
	it("crea la reserva pendiente y deja sus libros reservados", async () => {
		const uno = await crearLibro(env.DB, base);
		const dos = await crearLibro(env.DB, { ...base, titulo: "Bestiario", precio: 5000 });

		await crearReserva(env.DB, { ...cliente, folio: "FL-AAAAA", libroIds: [uno.id, dos.id] });

		const reserva = await estadoDeReserva(env.DB, "FL-AAAAA");
		expect(reserva?.estado).toBe("pendiente");
		expect((await obtenerLibro(env.DB, uno.id))?.estado).toBe("reservado");
		expect((await obtenerLibro(env.DB, dos.id))?.estado).toBe("reservado");
	});

	it("congela el precio de cada libro y calcula el total", async () => {
		const uno = await crearLibro(env.DB, base);
		const dos = await crearLibro(env.DB, { ...base, precio: 5000 });
		await crearReserva(env.DB, { ...cliente, folio: "FL-BBBBB", libroIds: [uno.id, dos.id] });

		const total = await env.DB.prepare("SELECT total FROM reservas WHERE folio = 'FL-BBBBB'").first<{
			total: number;
		}>();
		expect(total?.total).toBe(12000);

		const items = await env.DB.prepare(
			"SELECT precio FROM reserva_items ORDER BY precio",
		).all<{ precio: number }>();
		expect(items.results.map((i) => i.precio)).toEqual([5000, 7000]);
	});

	it("registra el evento inicial del historial", async () => {
		const libro = await crearLibro(env.DB, base);
		await crearReserva(env.DB, { ...cliente, folio: "FL-CCCCC", libroIds: [libro.id] });
		const eventos = await env.DB.prepare("SELECT estado FROM reserva_eventos").all<{ estado: string }>();
		expect(eventos.results.map((e) => e.estado)).toEqual(["pendiente"]);
	});

	it("rechaza una reserva sin libros", async () => {
		await expect(
			crearReserva(env.DB, { ...cliente, folio: "FL-DDDDD", libroIds: [] }),
		).rejects.toThrow(/al menos un libro/);
	});

	it("rechaza la reserva si un libro ya está reservado y no escribe nada", async () => {
		const libre = await crearLibro(env.DB, base);
		const tomado = await crearLibro(env.DB, { ...base, titulo: "Ya tomado" });
		await crearReserva(env.DB, { ...cliente, folio: "FL-EEEEE", libroIds: [tomado.id] });

		const reservasAntes = await contarFilas("reservas");
		const itemsAntes = await contarFilas("reserva_items");

		await expect(
			crearReserva(env.DB, { ...cliente, folio: "FL-FFFFF", libroIds: [libre.id, tomado.id] }),
		).rejects.toThrow(/ya no está disponible/);

		// Nada escrito: ni reserva, ni items, ni el estado del libro que sí estaba libre.
		expect(await contarFilas("reservas")).toBe(reservasAntes);
		expect(await contarFilas("reserva_items")).toBe(itemsAntes);
		expect((await obtenerLibro(env.DB, libre.id))?.estado).toBe("disponible");
		expect(await estadoDeReserva(env.DB, "FL-FFFFF")).toBeNull();
	});

	it("nombra el libro en conflicto en el mensaje de error", async () => {
		const tomado = await crearLibro(env.DB, { ...base, titulo: "Historia universal de la infamia" });
		await crearReserva(env.DB, { ...cliente, folio: "FL-GGGGG", libroIds: [tomado.id] });
		await expect(
			crearReserva(env.DB, { ...cliente, folio: "FL-HHHHH", libroIds: [tomado.id] }),
		).rejects.toThrow(/Historia universal de la infamia/);
	});

	it("rechaza la reserva de un libro dado de baja", async () => {
		const libro = await crearLibro(env.DB, base);
		await env.DB.prepare("UPDATE libros SET dado_de_baja = 1 WHERE id = ?").bind(libro.id).run();
		await expect(
			crearReserva(env.DB, { ...cliente, folio: "FL-IIIII", libroIds: [libro.id] }),
		).rejects.toThrow();
		expect(await contarFilas("reservas")).toBe(0);
	});
});

describe("cambiarEstadoReserva", () => {
	async function reservaCon(precio = 7000) {
		const libro = await crearLibro(env.DB, { ...base, precio });
		await crearReserva(env.DB, { ...cliente, folio: "FL-XXXXX", libroIds: [libro.id] });
		return libro;
	}

	it("marca como pagada una reserva pendiente y registra el evento", async () => {
		await reservaCon();
		await cambiarEstadoReserva(env.DB, "FL-XXXXX", "pagado");
		expect((await estadoDeReserva(env.DB, "FL-XXXXX"))?.estado).toBe("pagado");
		const eventos = await env.DB.prepare("SELECT estado FROM reserva_eventos ORDER BY id").all<{
			estado: string;
		}>();
		expect(eventos.results.map((e) => e.estado)).toEqual(["pendiente", "pagado"]);
	});

	it("la entrega deja los libros vendidos", async () => {
		const libro = await reservaCon();
		await cambiarEstadoReserva(env.DB, "FL-XXXXX", "pagado");
		await cambiarEstadoReserva(env.DB, "FL-XXXXX", "entregado");
		expect((await obtenerLibro(env.DB, libro.id))?.estado).toBe("vendido");
	});

	it("la cancelación devuelve los libros al catálogo", async () => {
		const libro = await reservaCon();
		await cambiarEstadoReserva(env.DB, "FL-XXXXX", "cancelado");
		expect((await obtenerLibro(env.DB, libro.id))?.estado).toBe("disponible");
	});

	it("rechaza saltar de pendiente a entregado", async () => {
		await reservaCon();
		await expect(cambiarEstadoReserva(env.DB, "FL-XXXXX", "entregado")).rejects.toThrow(
			/registrar el pago/,
		);
		expect((await estadoDeReserva(env.DB, "FL-XXXXX"))?.estado).toBe("pendiente");
	});

	it("rechaza cualquier cambio sobre una reserva entregada", async () => {
		await reservaCon();
		await cambiarEstadoReserva(env.DB, "FL-XXXXX", "pagado");
		await cambiarEstadoReserva(env.DB, "FL-XXXXX", "entregado");
		await expect(cambiarEstadoReserva(env.DB, "FL-XXXXX", "cancelado")).rejects.toThrow(
			/ya está entregado/,
		);
	});

	it("falla con 404 sobre un folio inexistente", async () => {
		await expect(cambiarEstadoReserva(env.DB, "FL-NADA1", "pagado")).rejects.toThrow(
			/No encontramos esa reserva/,
		);
	});
});
