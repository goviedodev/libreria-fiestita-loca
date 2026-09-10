import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La selección es el carrito del visitante: si se pierde o se corrompe, se pierde
 * una venta. Se reimporta en cada prueba porque el módulo guarda estado propio.
 */
type Modulo = typeof import("../../src/react-app/reserva/seleccion");

async function cargar(): Promise<Modulo> {
	vi.resetModules();
	return import("../../src/react-app/reserva/seleccion");
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("selección de libros", () => {
	it("empieza vacía", async () => {
		const s = await cargar();
		expect(s.obtenerSeleccion()).toEqual([]);
	});

	it("agrega y reconoce lo agregado", async () => {
		const s = await cargar();
		s.agregar("uno");
		expect(s.obtenerSeleccion()).toEqual(["uno"]);
		expect(s.estaSeleccionado("uno")).toBe(true);
		expect(s.estaSeleccionado("otro")).toBe(false);
	});

	it("no agrega dos veces el mismo libro", async () => {
		const s = await cargar();
		s.agregar("uno");
		s.agregar("uno");
		expect(s.obtenerSeleccion()).toEqual(["uno"]);
	});

	it("conserva el orden en que se agregaron", async () => {
		const s = await cargar();
		s.agregar("a");
		s.agregar("b");
		s.agregar("c");
		expect(s.obtenerSeleccion()).toEqual(["a", "b", "c"]);
	});

	it("quita un libro sin tocar los demás", async () => {
		const s = await cargar();
		s.agregar("a");
		s.agregar("b");
		s.quitar("a");
		expect(s.obtenerSeleccion()).toEqual(["b"]);
	});

	it("quitar algo que no está no rompe nada", async () => {
		const s = await cargar();
		s.agregar("a");
		s.quitar("inexistente");
		expect(s.obtenerSeleccion()).toEqual(["a"]);
	});

	it("alterna agregando y quitando", async () => {
		const s = await cargar();
		s.alternar("a");
		expect(s.obtenerSeleccion()).toEqual(["a"]);
		s.alternar("a");
		expect(s.obtenerSeleccion()).toEqual([]);
	});

	it("vacía la selección entera", async () => {
		const s = await cargar();
		s.agregar("a");
		s.agregar("b");
		s.vaciar();
		expect(s.obtenerSeleccion()).toEqual([]);
	});

	it("persiste entre recargas de la página", async () => {
		const primera = await cargar();
		primera.agregar("a");
		primera.agregar("b");

		// Reimportar simula abrir la página de nuevo: el estado se relee del almacén.
		const segunda = await cargar();
		expect(segunda.obtenerSeleccion()).toEqual(["a", "b"]);
	});

	it("no acepta más de 30 libros", async () => {
		const s = await cargar();
		for (let i = 0; i < 35; i++) s.agregar(`libro-${i}`);
		expect(s.obtenerSeleccion()).toHaveLength(30);
	});
});

describe("almacenamiento hostil", () => {
	it("ignora un contenido que no es un arreglo", async () => {
		localStorage.setItem("fl_seleccion", '{"no":"soy un arreglo"}');
		const s = await cargar();
		expect(s.obtenerSeleccion()).toEqual([]);
	});

	it("ignora un JSON corrupto", async () => {
		localStorage.setItem("fl_seleccion", "{{{ esto no es json");
		const s = await cargar();
		expect(s.obtenerSeleccion()).toEqual([]);
	});

	it("descarta los elementos que no son cadenas", async () => {
		localStorage.setItem("fl_seleccion", JSON.stringify(["bueno", 42, null, { a: 1 }, "otro"]));
		const s = await cargar();
		expect(s.obtenerSeleccion()).toEqual(["bueno", "otro"]);
	});

	it("sigue funcionando si el almacén lanza al leer", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("modo privado");
		});
		const s = await cargar();
		expect(s.obtenerSeleccion()).toEqual([]);
	});

	it("sigue funcionando si el almacén lanza al escribir", async () => {
		const s = await cargar();
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("cuota llena");
		});

		// Sin persistencia, pero la selección vive dentro de la pestaña.
		expect(() => s.agregar("a")).not.toThrow();
		expect(s.obtenerSeleccion()).toEqual(["a"]);
	});
});

describe("suscripción", () => {
	it("avisa a quien escucha en cada cambio", async () => {
		const s = await cargar();
		const escucha = vi.fn();
		s.suscribir(escucha);

		s.agregar("a");
		s.quitar("a");
		s.vaciar();

		expect(escucha).toHaveBeenCalledTimes(3);
		expect(escucha).toHaveBeenLastCalledWith([]);
	});

	it("deja de avisar tras desuscribirse", async () => {
		const s = await cargar();
		const escucha = vi.fn();
		const cancelar = s.suscribir(escucha);

		s.agregar("a");
		cancelar();
		s.agregar("b");

		expect(escucha).toHaveBeenCalledTimes(1);
	});

	it("no avisa cuando la operación no cambia nada", async () => {
		const s = await cargar();
		s.agregar("a");
		const escucha = vi.fn();
		s.suscribir(escucha);

		s.agregar("a");
		s.quitar("inexistente");

		expect(escucha).not.toHaveBeenCalled();
	});
});

describe("totalDe", () => {
	const libro = (id: string, precio: number, estado = "disponible") =>
		({ id, precio, estado }) as never;

	it("suma solo los disponibles", async () => {
		const s = await cargar();
		const total = s.totalDe([
			libro("a", 1000),
			libro("b", 2000),
			libro("c", 5000, "vendido"),
			libro("d", 3000, "reservado"),
		]);
		expect(total).toBe(3000);
	});

	it("da cero con una lista vacía", async () => {
		const s = await cargar();
		expect(s.totalDe([])).toBe(0);
	});
});
