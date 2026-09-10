import { describe, expect, it } from "vitest";
import { esquemaAltaLibro, esquemaEdicionLibro } from "../src/shared/libro-esquemas";
import { esTransicionValida, esEstadoFinal } from "../src/shared/reserva";
import { esquemaCrearReserva } from "../src/shared/reserva-esquemas";
import { esquemaCrearSolicitud } from "../src/shared/solicitud-esquemas";

const libroValido = {
	titulo: "Cien años de soledad",
	autor: "Gabriel García Márquez",
	condicion: "usado" as const,
	precio: 8500,
};

describe("esquemaAltaLibro", () => {
	it("acepta los datos mínimos", () => {
		const resultado = esquemaAltaLibro.safeParse(libroValido);
		expect(resultado.success).toBe(true);
	});

	it("rechaza un precio de cero", () => {
		const resultado = esquemaAltaLibro.safeParse({ ...libroValido, precio: 0 });
		expect(resultado.success).toBe(false);
		expect(resultado.error?.issues[0]?.path).toEqual(["precio"]);
	});

	it("rechaza un precio negativo", () => {
		expect(esquemaAltaLibro.safeParse({ ...libroValido, precio: -100 }).success).toBe(false);
	});

	it("rechaza un precio con decimales", () => {
		const resultado = esquemaAltaLibro.safeParse({ ...libroValido, precio: 1500.5 });
		expect(resultado.success).toBe(false);
		expect(resultado.error?.issues[0]?.message).toContain("entero");
	});

	it("rechaza un precio que no es número", () => {
		expect(esquemaAltaLibro.safeParse({ ...libroValido, precio: "8500" }).success).toBe(false);
	});

	it("rechaza el alta sin título", () => {
		const resultado = esquemaAltaLibro.safeParse({ ...libroValido, titulo: "   " });
		expect(resultado.success).toBe(false);
		expect(resultado.error?.issues[0]?.path).toEqual(["titulo"]);
	});

	it("rechaza el alta sin autor", () => {
		const resultado = esquemaAltaLibro.safeParse({ ...libroValido, autor: "" });
		expect(resultado.success).toBe(false);
		expect(resultado.error?.issues[0]?.path).toEqual(["autor"]);
	});

	it("rechaza una condición desconocida", () => {
		expect(esquemaAltaLibro.safeParse({ ...libroValido, condicion: "regular" }).success).toBe(false);
	});

	it("normaliza los opcionales vacíos a null", () => {
		const resultado = esquemaAltaLibro.parse({ ...libroValido, isbn: "  ", editorial: "" });
		expect(resultado.isbn).toBeNull();
		expect(resultado.editorial).toBeNull();
	});

	it("recorta los espacios del título y del autor", () => {
		const resultado = esquemaAltaLibro.parse({ ...libroValido, titulo: "  Rayuela  " });
		expect(resultado.titulo).toBe("Rayuela");
	});
});

describe("esquemaEdicionLibro", () => {
	it("acepta un cambio parcial", () => {
		expect(esquemaEdicionLibro.safeParse({ precio: 9900 }).success).toBe(true);
	});

	it("rechaza una edición sin ningún campo", () => {
		expect(esquemaEdicionLibro.safeParse({}).success).toBe(false);
	});
});

describe("esquemaCrearReserva", () => {
	const base = { nombre: "Ana Pérez", telefono: "+56912345678", libroIds: ["libro-1"] };

	it("acepta una reserva con un libro", () => {
		expect(esquemaCrearReserva.safeParse(base).success).toBe(true);
	});

	it("rechaza una reserva sin libros", () => {
		const resultado = esquemaCrearReserva.safeParse({ ...base, libroIds: [] });
		expect(resultado.success).toBe(false);
		expect(resultado.error?.issues[0]?.message).toContain("al menos un libro");
	});

	it("rechaza un nombre demasiado corto", () => {
		expect(esquemaCrearReserva.safeParse({ ...base, nombre: "A" }).success).toBe(false);
	});
});

describe("transiciones de estado de una reserva", () => {
	it.each([
		["pendiente", "pagado"],
		["pendiente", "cancelado"],
		["pagado", "entregado"],
		["pagado", "cancelado"],
	] as const)("permite %s → %s", (desde, hacia) => {
		expect(esTransicionValida(desde, hacia)).toBe(true);
	});

	it.each([
		["pendiente", "entregado"],
		["entregado", "pagado"],
		["cancelado", "pendiente"],
		["entregado", "cancelado"],
	] as const)("rechaza %s → %s", (desde, hacia) => {
		expect(esTransicionValida(desde, hacia)).toBe(false);
	});

	it("reconoce los estados finales", () => {
		expect(esEstadoFinal("entregado")).toBe(true);
		expect(esEstadoFinal("cancelado")).toBe(true);
		expect(esEstadoFinal("pendiente")).toBe(false);
	});
});

describe("esquemaCrearSolicitud", () => {
	it("acepta una solicitud con solo el autor", () => {
		const resultado = esquemaCrearSolicitud.safeParse({ autor: "Isabel Allende", telefono: "+56911112222" });
		expect(resultado.success).toBe(true);
	});

	it("rechaza una solicitud sin título ni autor", () => {
		const resultado = esquemaCrearSolicitud.safeParse({ telefono: "+56911112222" });
		expect(resultado.success).toBe(false);
		expect(resultado.error?.issues[0]?.message).toContain("al menos el título o el autor");
	});
});
