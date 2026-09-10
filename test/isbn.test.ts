import { describe, expect, it } from "vitest";
import { esIsbnValido, isbnNormalizadoONulo, normalizarIsbn } from "../src/shared/isbn";

describe("normalizarIsbn", () => {
	it("quita guiones y espacios", () => {
		expect(normalizarIsbn("978-0-306-40615-7")).toBe("9780306406157");
		expect(normalizarIsbn(" 978 0306 406157 ")).toBe("9780306406157");
	});

	it("deja la X del verificador en mayúscula", () => {
		expect(normalizarIsbn("0-8044-2957-x")).toBe("080442957X");
	});
});

describe("esIsbnValido", () => {
	it("acepta ISBN-10 conocidos", () => {
		expect(esIsbnValido("0-306-40615-2")).toBe(true);
		expect(esIsbnValido("0140449132")).toBe(true);
	});

	it("acepta un ISBN-10 con X como dígito verificador", () => {
		expect(esIsbnValido("0-8044-2957-X")).toBe(true);
	});

	it("acepta ISBN-13 conocidos", () => {
		expect(esIsbnValido("978-0-306-40615-7")).toBe(true);
		expect(esIsbnValido("9780140449136")).toBe(true);
		expect(esIsbnValido("9788437604947")).toBe(true);
	});

	it("rechaza un ISBN-13 con el verificador cambiado", () => {
		expect(esIsbnValido("9780306406156")).toBe(false);
	});

	it("rechaza un ISBN-10 con el verificador cambiado", () => {
		expect(esIsbnValido("0306406153")).toBe(false);
	});

	it("rechaza una X fuera de la posición del verificador", () => {
		expect(esIsbnValido("X306406152")).toBe(false);
	});

	it("rechaza una X en un ISBN-13", () => {
		expect(esIsbnValido("978030640615X")).toBe(false);
	});

	it("rechaza largos que no son 10 ni 13", () => {
		expect(esIsbnValido("123456789")).toBe(false);
		expect(esIsbnValido("97803064061577")).toBe(false);
		expect(esIsbnValido("")).toBe(false);
	});

	it("rechaza texto que no son dígitos", () => {
		expect(esIsbnValido("no-es-un-isbn")).toBe(false);
	});
});

describe("isbnNormalizadoONulo", () => {
	it("devuelve el ISBN normalizado cuando es válido", () => {
		expect(isbnNormalizadoONulo("978-0-306-40615-7")).toBe("9780306406157");
	});

	it("devuelve null para un ISBN inválido, vacío o ausente", () => {
		expect(isbnNormalizadoONulo("9780306406156")).toBeNull();
		expect(isbnNormalizadoONulo("")).toBeNull();
		expect(isbnNormalizadoONulo(null)).toBeNull();
		expect(isbnNormalizadoONulo(undefined)).toBeNull();
	});
});
