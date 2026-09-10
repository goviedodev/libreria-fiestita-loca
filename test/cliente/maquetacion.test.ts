import { describe, expect, it } from "vitest";
import { ajustarCuerpo, repartirEnLineas, type Medidor } from "../../src/react-app/backoffice/novedades/maquetacion";

/**
 * Medidor simulado: cada carácter ocupa un ancho fijo proporcional al cuerpo de
 * la fuente. Basta para ejercitar el reparto sin depender de un canvas real.
 */
function medidor(anchoPorCaracter = 10): Medidor {
	return {
		font: "",
		measureText(texto: string) {
			const cuerpo = Number(this.font.match(/(\d+)px/)?.[1] ?? 10);
			return { width: texto.length * anchoPorCaracter * (cuerpo / 10) };
		},
	};
}

describe("repartirEnLineas", () => {
	it("deja en una línea lo que cabe", () => {
		expect(repartirEnLineas(medidor(), "hola mundo", 200, 3)).toEqual(["hola mundo"]);
	});

	it("parte por espacios, nunca a mitad de palabra", () => {
		const lineas = repartirEnLineas(medidor(), "uno dos tres cuatro", 80, 5);
		expect(lineas.every((l) => !l.endsWith("-"))).toBe(true);
		expect(lineas.join(" ")).toBe("uno dos tres cuatro");
	});

	it("respeta el ancho disponible", () => {
		const m = medidor();
		const lineas = repartirEnLineas(m, "aaa bbb ccc ddd eee", 70, 10);
		for (const linea of lineas) {
			expect(m.measureText(linea).width).toBeLessThanOrEqual(70);
		}
	});

	it("deja pasar una palabra sola más ancha que la caja, en vez de perderla", () => {
		const lineas = repartirEnLineas(medidor(), "supercalifragilisticoespialidoso", 50, 3);
		expect(lineas[0]).toBe("supercalifragilisticoespialidoso");
	});

	it("recorta con puntos suspensivos al pasarse del máximo de líneas", () => {
		const lineas = repartirEnLineas(medidor(), "uno dos tres cuatro cinco seis siete", 40, 2);
		expect(lineas).toHaveLength(2);
		expect(lineas[1].endsWith("…")).toBe(true);
	});

	it("colapsa los espacios múltiples", () => {
		expect(repartirEnLineas(medidor(), "hola    mundo", 400, 2)).toEqual(["hola mundo"]);
	});

	it("no rompe con un texto vacío", () => {
		expect(repartirEnLineas(medidor(), "", 200, 2)).toEqual([]);
	});
});

describe("ajustarCuerpo", () => {
	it("conserva el cuerpo inicial cuando el texto ya cabe", () => {
		const { lineas, cuerpo } = ajustarCuerpo(medidor(), "corto", 500, 3, 80, 40, "serif");
		expect(cuerpo).toBe(80);
		expect(lineas).toEqual(["corto"]);
	});

	it("reduce el cuerpo hasta que el texto entra en las líneas permitidas", () => {
		const largo = "un titulo bastante largo que no cabe de ninguna manera en tres lineas grandes";
		const { lineas, cuerpo } = ajustarCuerpo(medidor(), largo, 300, 3, 80, 30, "serif");

		expect(cuerpo).toBeLessThan(80);
		expect(lineas.length).toBeLessThanOrEqual(3);
	});

	it("nunca baja del cuerpo mínimo, aunque el texto siga sin caber", () => {
		const enorme = "palabra ".repeat(60);
		const { cuerpo, lineas } = ajustarCuerpo(medidor(), enorme, 100, 2, 80, 40, "serif");

		expect(cuerpo).toBeGreaterThanOrEqual(40);
		expect(lineas).toHaveLength(2);
	});

	it("aplica el peso y la familia que se le pasan", () => {
		const m = medidor();
		ajustarCuerpo(m, "hola", 500, 2, 40, 20, "Georgia", "400");
		expect(m.font).toContain("400");
		expect(m.font).toContain("Georgia");
	});

	it("devuelve como mucho el máximo de líneas pedido", () => {
		const { lineas } = ajustarCuerpo(medidor(), "a b c d e f g h i j k", 30, 2, 40, 40, "serif");
		expect(lineas).toHaveLength(2);
	});
});
