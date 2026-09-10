import { afterEach, describe, expect, it, vi } from "vitest";
import type { Libro } from "../../src/shared/libro";
import { nombreDeArchivo } from "../../src/react-app/backoffice/novedades/pieza";
import { copiarAlPortapapeles, textoDePublicacion } from "../../src/react-app/backoffice/novedades/publicacion";

function libro(parcial: Partial<Libro> = {}): Libro {
	return {
		id: "id-1",
		isbn: null,
		titulo: "El Aleph",
		autor: "Jorge Luis Borges",
		editorial: null,
		anio: null,
		genero: null,
		sinopsis: null,
		condicion: "usado",
		precio: 8500,
		estado: "disponible",
		imagenUrl: null,
		dadoDeBaja: false,
		creadoEn: "2026-09-01T00:00:00.000Z",
		...parcial,
	};
}

describe("nombreDeArchivo", () => {
	it("identifica al libro y conserva el orden", () => {
		expect(nombreDeArchivo(libro(), 0)).toBe("01-el-aleph-jorge-luis-borges.png");
		expect(nombreDeArchivo(libro(), 9)).toBe("10-el-aleph-jorge-luis-borges.png");
	});

	it("quita tildes y signos que molestan en un nombre de archivo", () => {
		const nombre = nombreDeArchivo(
			libro({ titulo: "¿Quién mató a Palomino Molero?", autor: "Vargas Llosa" }),
			0,
		);
		expect(nombre).toBe("01-quien-mato-a-palomino-molero-vargas-llosa.png");
		expect(nombre).not.toMatch(/[^a-z0-9.-]/);
	});

	it("recorta un título muy largo sin perder la extensión", () => {
		const nombre = nombreDeArchivo(libro({ titulo: "palabra ".repeat(40) }), 0);
		expect(nombre.endsWith(".png")).toBe(true);
		expect(nombre.length).toBeLessThanOrEqual(68);
	});

	it("no deja un guion suelto al final del nombre", () => {
		expect(nombreDeArchivo(libro({ titulo: "2666", autor: "Bolaño" }), 0)).toBe("01-2666-bolano.png");
	});

	it("da un nombre usable aunque el título no tenga caracteres latinos", () => {
		expect(nombreDeArchivo(libro({ titulo: "○○○", autor: "△" }), 2)).toBe("03-libro.png");
	});
});

describe("textoDePublicacion", () => {
	const origen = "https://fiestita.test";

	it("lista cada libro con autor, precio y condición", () => {
		const texto = textoDePublicacion([libro(), libro({ titulo: "Ficciones", precio: 9500 })], origen);

		expect(texto).toContain("El Aleph — Jorge Luis Borges");
		expect(texto).toContain("8.500");
		expect(texto).toContain("Ficciones");
		expect(texto).toContain("9.500");
		expect(texto).toContain("usado");
	});

	it("incluye la URL del catálogo", () => {
		expect(textoDePublicacion([libro()], origen)).toContain(origen);
	});

	it("cambia el encabezado según cuántos libros haya", () => {
		expect(textoDePublicacion([libro()], origen)).toContain("Llegó a la mesa");
		expect(textoDePublicacion([libro(), libro()], origen)).toContain("2 ejemplares nuevos");
	});

	it("marca los nuevos como nuevos", () => {
		expect(textoDePublicacion([libro({ condicion: "nuevo" })], origen)).toContain("nuevo");
	});

	it("usa saltos de línea reales, listos para pegar en Instagram", () => {
		const texto = textoDePublicacion([libro()], origen);
		expect(texto.split("\n").length).toBeGreaterThan(5);
		expect(texto).not.toContain("\\n");
	});

	it("no rompe con una lista vacía", () => {
		expect(() => textoDePublicacion([], origen)).not.toThrow();
	});
});


describe("copiarAlPortapapeles", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("usa la API moderna cuando está disponible", async () => {
		const escribir = vi.fn(() => Promise.resolve());
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: escribir } });

		await expect(copiarAlPortapapeles("hola")).resolves.toBe(true);
		expect(escribir).toHaveBeenCalledWith("hola");
	});

	it("cae al respaldo si el portapapeles moderno está denegado", async () => {
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: { writeText: () => Promise.reject(new Error("denegado")) },
		});
		const ejecutar = vi.fn(() => true);
		Object.defineProperty(document, "execCommand", { configurable: true, value: ejecutar });

		await expect(copiarAlPortapapeles("hola")).resolves.toBe(true);
		expect(ejecutar).toHaveBeenCalledWith("copy");
		// El textarea temporal no puede quedar en el documento.
		expect(document.querySelectorAll("textarea")).toHaveLength(0);
	});

	it("devuelve false cuando ninguno de los dos caminos funciona", async () => {
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: { writeText: () => Promise.reject(new Error("denegado")) },
		});
		Object.defineProperty(document, "execCommand", {
			configurable: true,
			value: () => { throw new Error("tampoco"); },
		});

		await expect(copiarAlPortapapeles("hola")).resolves.toBe(false);
	});
});

describe("descarga de piezas", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.doUnmock("../../src/react-app/backoffice/novedades/pieza");
		vi.resetModules();
	});

	/**
	 * El dibujo en canvas se simula: `happy-dom` no implementa un contexto 2D, y lo
	 * que interesa acá es la orquestación —qué nombre lleva cada archivo, en qué
	 * orden salen— no los píxeles, que se verifican en el navegador.
	 */
	async function conDibujoSimulado() {
		vi.doMock("../../src/react-app/backoffice/novedades/pieza", () => ({
			ANCHO: 1080,
			ALTO: 1920,
			dibujarPieza: vi.fn(() => Promise.resolve({} as HTMLCanvasElement)),
			aBlob: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))),
			nombreDeArchivo: (l: { titulo: string }, i: number) => `${i + 1}-${l.titulo}.png`,
		}));
		vi.resetModules();
		return import("../../src/react-app/backoffice/novedades/publicacion");
	}

	function espiarDescargas() {
		const nombres: string[] = [];
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
			nombres.push(this.download);
		});
		// Se espían solo los métodos estáticos: reemplazar el global `URL` entero
		// rompe `new URL(...)` en el resto del módulo.
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		return nombres;
	}

	it("descarga una pieza con el nombre del libro", async () => {
		const modulo = await conDibujoSimulado();
		const nombres = espiarDescargas();

		await modulo.descargarPieza({ titulo: "El Aleph" } as never, 0);

		expect(nombres).toEqual(["1-El Aleph.png"]);
	});

	it("descarga la tanda en orden y avisa del progreso", async () => {
		const modulo = await conDibujoSimulado();
		const nombres = espiarDescargas();
		const progreso: string[] = [];

		await modulo.descargarTanda(
			[{ titulo: "Uno" }, { titulo: "Dos" }, { titulo: "Tres" }] as never,
			(hechas, total) => progreso.push(`${hechas}/${total}`),
		);

		expect(nombres).toEqual(["1-Uno.png", "2-Dos.png", "3-Tres.png"]);
		expect(progreso).toEqual(["1/3", "2/3", "3/3"]);
	});

	it("no deja el enlace temporal en el documento", async () => {
		const modulo = await conDibujoSimulado();
		espiarDescargas();

		await modulo.descargarPieza({ titulo: "El Aleph" } as never, 0);

		expect(document.querySelectorAll("a[download]")).toHaveLength(0);
	});

	it("una tanda vacía no hace nada ni falla", async () => {
		const modulo = await conDibujoSimulado();
		const nombres = espiarDescargas();

		await expect(modulo.descargarTanda([])).resolves.toBeUndefined();
		expect(nombres).toEqual([]);
	});
});
