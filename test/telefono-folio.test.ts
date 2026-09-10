import { describe, expect, it } from "vitest";
import {
	esTelefonoValido,
	formatearTelefono,
	normalizarTelefono,
	telefonoEnmascarado,
} from "../src/shared/telefono";
import { conFolioUnico, generarFolio, normalizarFolio, PATRON_FOLIO } from "../src/worker/servicios/folio";
import { ErrorDominio } from "../src/worker/datos/comun";

describe("normalizarTelefono", () => {
	it("acepta las formas en que la gente escribe un celular chileno", () => {
		const esperado = "56912345678";
		for (const forma of [
			"+56 9 1234 5678",
			"+56912345678",
			"56912345678",
			"9 1234 5678",
			"912345678",
			"09 1234 5678",
			"0056 9 1234 5678",
			"(+56) 9-1234-5678",
		]) {
			expect(normalizarTelefono(forma), forma).toBe(esperado);
		}
	});

	it("rechaza un fijo, porque el negocio funciona por WhatsApp", () => {
		expect(normalizarTelefono("+56 33 2412345")).toBeNull();
		expect(normalizarTelefono("332412345")).toBeNull();
	});

	it("rechaza números con largo equivocado", () => {
		expect(normalizarTelefono("9123456")).toBeNull();
		expect(normalizarTelefono("5691234567890")).toBeNull();
		expect(normalizarTelefono("")).toBeNull();
	});

	it("rechaza un celular de otro país", () => {
		expect(normalizarTelefono("+54 9 11 1234 5678")).toBeNull();
		expect(normalizarTelefono("+1 555 123 4567")).toBeNull();
	});

	it("rechaza texto que no son dígitos", () => {
		expect(normalizarTelefono("llámame")).toBeNull();
	});

	it("esTelefonoValido coincide con la normalización", () => {
		expect(esTelefonoValido("+56 9 1234 5678")).toBe(true);
		expect(esTelefonoValido("123")).toBe(false);
	});
});

describe("presentación del teléfono", () => {
	it("formatea el canónico de forma legible", () => {
		expect(formatearTelefono("56912345678")).toBe("+56 9 1234 5678");
	});

	it("enmascara todo salvo los últimos cuatro dígitos", () => {
		const enmascarado = telefonoEnmascarado("56912345678");
		expect(enmascarado).toContain("5678");
		expect(enmascarado).not.toContain("91234");
	});
});

describe("generarFolio", () => {
	it("respeta el formato FL-XXXXX", () => {
		for (let i = 0; i < 50; i++) {
			expect(generarFolio()).toMatch(PATRON_FOLIO);
		}
	});

	it("nunca usa caracteres que se confunden al dictarlo", () => {
		const muestra = Array.from({ length: 300 }, generarFolio).join("");
		for (const ambiguo of ["0", "O", "1", "I"]) {
			expect(muestra.replace(/FL-/g, "")).not.toContain(ambiguo);
		}
	});

	it("no repite folios en una muestra grande", () => {
		const folios = new Set(Array.from({ length: 500 }, generarFolio));
		expect(folios.size).toBe(500);
	});
});

describe("normalizarFolio", () => {
	it("acepta el folio como lo escriba el cliente", () => {
		for (const forma of ["FL-AB2CD", "fl-ab2cd", "FLAB2CD", "ab2cd", " FL-AB2CD "]) {
			expect(normalizarFolio(forma), forma).toBe("FL-AB2CD");
		}
	});

	it("deja en forma inválida lo que no es un folio", () => {
		expect(PATRON_FOLIO.test(normalizarFolio("hola"))).toBe(false);
		expect(PATRON_FOLIO.test(normalizarFolio("FL-00000"))).toBe(false);
	});
});

describe("conFolioUnico", () => {
	const colision = () =>
		new Error("D1_ERROR: UNIQUE constraint failed: reservas.folio: SQLITE_CONSTRAINT");

	it("devuelve el resultado al primer intento cuando no hay colisión", async () => {
		const intentos: string[] = [];
		const folio = await conFolioUnico(async (candidato) => {
			intentos.push(candidato);
			return candidato;
		});

		expect(intentos).toHaveLength(1);
		expect(folio).toMatch(PATRON_FOLIO);
	});

	it("reintenta con un folio nuevo cuando el UNIQUE falla", async () => {
		const intentos: string[] = [];
		const folio = await conFolioUnico(async (candidato) => {
			intentos.push(candidato);
			if (intentos.length === 1) throw colision();
			return candidato;
		});

		expect(intentos).toHaveLength(2);
		expect(intentos[0]).not.toBe(intentos[1]);
		expect(folio).toBe(intentos[1]);
	});

	it("se rinde tras tres colisiones seguidas", async () => {
		let intentos = 0;
		const operacion = async () => {
			intentos++;
			throw colision();
		};

		await expect(conFolioUnico(operacion)).rejects.toBeInstanceOf(ErrorDominio);
		expect(intentos).toBe(3);
	});

	it("no reintenta ante un error que no es colisión de folio", async () => {
		let intentos = 0;
		const operacion = async () => {
			intentos++;
			// Un libro que dejó de estar disponible: reintentar daría lo mismo.
			throw new ErrorDominio("«El Aleph» ya no está disponible", 409);
		};

		await expect(conFolioUnico(operacion)).rejects.toThrow("ya no está disponible");
		expect(intentos).toBe(1);
	});
});
