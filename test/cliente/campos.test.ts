import { describe, expect, it } from "vitest";
import { aCuerpo, CAMPOS_VACIOS } from "../../src/react-app/backoffice/inventario/campos";
import { hayEscaner } from "../../src/react-app/backoffice/inventario/escaner";

describe("aCuerpo", () => {
	it("recorta los textos y convierte los números", () => {
		const cuerpo = aCuerpo({
			...CAMPOS_VACIOS,
			titulo: "  El Aleph  ",
			autor: " Borges ",
			anio: "1949",
			precio: "8500",
		});

		expect(cuerpo).toMatchObject({ titulo: "El Aleph", autor: "Borges", anio: 1949, precio: 8500 });
	});

	it("convierte los opcionales vacíos en null", () => {
		const cuerpo = aCuerpo({ ...CAMPOS_VACIOS, titulo: "T", autor: "A", precio: "1000" });
		expect(cuerpo.isbn).toBeNull();
		expect(cuerpo.editorial).toBeNull();
		expect(cuerpo.anio).toBeNull();
		expect(cuerpo.genero).toBeNull();
		expect(cuerpo.sinopsis).toBeNull();
	});

	it("manda null cuando no hay precio, para que el servidor dé el error del campo", () => {
		expect(aCuerpo({ ...CAMPOS_VACIOS, precio: "   " }).precio).toBeNull();
	});

	it("no convierte un precio no numérico en NaN silencioso", () => {
		// El input filtra a dígitos, pero si algo se cuela debe llegar como número
		// inválido y no como cero.
		expect(Number.isNaN(aCuerpo({ ...CAMPOS_VACIOS, precio: "abc" }).precio as number)).toBe(true);
	});

	it("conserva la condición elegida", () => {
		expect(aCuerpo({ ...CAMPOS_VACIOS, condicion: "nuevo" }).condicion).toBe("nuevo");
	});
});

describe("hayEscaner", () => {
	it("es falso donde el navegador no trae BarcodeDetector", () => {
		expect(hayEscaner()).toBe(false);
	});

	it("es verdadero cuando existen el detector y la cámara", () => {
		const global = window as unknown as { BarcodeDetector?: unknown };
		global.BarcodeDetector = class {};
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getUserMedia: () => Promise.resolve(null) },
		});

		expect(hayEscaner()).toBe(true);
		delete global.BarcodeDetector;
	});
});
