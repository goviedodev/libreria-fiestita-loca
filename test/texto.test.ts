import { describe, expect, it } from "vitest";
import { formatearPrecio, normalizarTexto } from "../src/shared/texto";

describe("normalizarTexto", () => {
	it("iguala tildes y mayúsculas de un mismo apellido", () => {
		const esperado = "allende";
		expect(normalizarTexto("Allendé")).toBe(esperado);
		expect(normalizarTexto("allende")).toBe(esperado);
		expect(normalizarTexto("ALLENDE")).toBe(esperado);
		expect(normalizarTexto("Allende")).toBe(esperado);
	});

	it("quita las tildes de un nombre completo", () => {
		expect(normalizarTexto("Gabriel García Márquez")).toBe("gabriel garcia marquez");
	});

	// `\p{Diacritic}` sobre NFD también descompone la eñe y le quita la virgulilla,
	// así que `años` se normaliza a `anos`. Es lo que conviene para buscar: el
	// término del visitante pasa por la misma función, y quien escribe "anos" en un
	// teclado sin eñe encuentra igual el libro.
	it("colapsa la eñe a n, igual que el término de búsqueda", () => {
		expect(normalizarTexto("Cien años de soledad")).toBe("cien anos de soledad");
		expect(normalizarTexto("CIEN ANOS DE SOLEDAD")).toBe(normalizarTexto("Cien años de soledad"));
	});

	it("colapsa los espacios sobrantes", () => {
		expect(normalizarTexto("  El   Aleph  ")).toBe("el aleph");
	});

	it("normaliza la diéresis y otros diacríticos", () => {
		expect(normalizarTexto("Müller")).toBe("muller");
		expect(normalizarTexto("Çelik")).toBe("celik");
	});

	it("deja intacto un texto que ya está normalizado", () => {
		expect(normalizarTexto("rayuela")).toBe("rayuela");
	});
});

describe("formatearPrecio", () => {
	it("formatea pesos chilenos sin decimales", () => {
		// Intl separa el símbolo con un espacio duro, así que se compara solo el número.
		expect(formatearPrecio(8500)).toContain("8.500");
		expect(formatearPrecio(8500)).not.toContain(",");
	});
});
