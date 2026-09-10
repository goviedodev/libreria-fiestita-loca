import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorDominio } from "../src/worker/datos/comun";
import { buscarPorIsbn } from "../src/worker/servicios/isbn";

// Cada prueba usa un ISBN distinto: la caché del Worker persiste dentro del
// isolate y un ISBN reutilizado devolvería el resultado de la prueba anterior.
const GOOGLE = "9780306406157";
const RESPALDO = "9780140449136";
const SIN_RESULTADOS = "9788437604947";
const AMBAS_FALLAN = "9789561234567";
const CACHEADO = "9780316000000";
const SOLO_GOOGLE_FALLA = "9780521123457";

function respuestaGoogle(volumeInfo: unknown) {
	return new Response(JSON.stringify({ totalItems: 1, items: [{ volumeInfo }] }), {
		headers: { "Content-Type": "application/json" },
	});
}

function googleVacia() {
	return new Response(JSON.stringify({ totalItems: 0 }), {
		headers: { "Content-Type": "application/json" },
	});
}

function respuestaOpenLibrary(isbn: string, libro: unknown) {
	return new Response(JSON.stringify({ [`ISBN:${isbn}`]: libro }), {
		headers: { "Content-Type": "application/json" },
	});
}

function openLibraryVacia() {
	return new Response("{}", { headers: { "Content-Type": "application/json" } });
}

/** Enruta cada petición a la respuesta de su fuente. */
function simularFuentes(manejar: (url: string) => Response | Promise<Response>) {
	const espia = vi.fn((entrada: RequestInfo | URL) => {
		const url = typeof entrada === "string" ? entrada : entrada.toString();
		return Promise.resolve(manejar(url));
	});
	vi.stubGlobal("fetch", espia);
	return espia;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("buscarPorIsbn", () => {
	it("devuelve los metadatos de la fuente primaria", async () => {
		simularFuentes(() =>
			respuestaGoogle({
				title: "Cien años de soledad",
				authors: ["Gabriel García Márquez"],
				publishedDate: "1967-05-30",
				publisher: "Sudamericana",
				categories: ["Fiction"],
				description: "La historia de los Buendía.",
				imageLinks: { thumbnail: "http://books.google.com/portada?zoom=5" },
			}),
		);

		const resultado = await buscarPorIsbn(GOOGLE);

		expect(resultado.encontrado).toBe(true);
		if (!resultado.encontrado) return;
		expect(resultado.metadatos).toMatchObject({
			isbn: GOOGLE,
			titulo: "Cien años de soledad",
			autor: "Gabriel García Márquez",
			anio: 1967,
			editorial: "Sudamericana",
			genero: "Fiction",
			fuente: "google-books",
		});
	});

	it("sirve la portada de Google por https y en tamaño mayor", async () => {
		simularFuentes(() =>
			respuestaGoogle({
				title: "Rayuela",
				imageLinks: { thumbnail: "http://books.google.com/books/content?id=x&zoom=5" },
			}),
		);

		const resultado = await buscarPorIsbn(SOLO_GOOGLE_FALLA);
		expect(resultado.encontrado).toBe(true);
		if (!resultado.encontrado) return;
		expect(resultado.metadatos.portadaUrl).toBe(
			"https://books.google.com/books/content?id=x&zoom=1",
		);
	});

	it("cae a la fuente alternativa cuando la primaria no tiene el libro", async () => {
		const espia = simularFuentes((url) =>
			url.includes("googleapis")
				? googleVacia()
				: respuestaOpenLibrary(RESPALDO, {
						title: "El Aleph",
						authors: [{ name: "Jorge Luis Borges" }],
						publish_date: "1949",
						publishers: [{ name: "Losada" }],
						subjects: [{ name: "Cuentos" }],
						cover: { large: "https://covers.openlibrary.org/b/id/1-L.jpg" },
					}),
		);

		const resultado = await buscarPorIsbn(RESPALDO);

		expect(espia).toHaveBeenCalledTimes(2);
		expect(resultado.encontrado).toBe(true);
		if (!resultado.encontrado) return;
		expect(resultado.metadatos).toMatchObject({
			titulo: "El Aleph",
			autor: "Jorge Luis Borges",
			anio: 1949,
			editorial: "Losada",
			fuente: "openlibrary",
		});
	});

	it("informa que no hubo coincidencias cuando ninguna fuente reconoce el ISBN", async () => {
		simularFuentes((url) => (url.includes("googleapis") ? googleVacia() : openLibraryVacia()));

		const resultado = await buscarPorIsbn(SIN_RESULTADOS);

		expect(resultado).toEqual({ encontrado: false, isbn: SIN_RESULTADOS });
	});

	it("rechaza un ISBN con dígito verificador inválido sin salir a la red", async () => {
		const espia = simularFuentes(() => googleVacia());

		await expect(buscarPorIsbn("9780306406156")).rejects.toThrow(ErrorDominio);
		expect(espia).not.toHaveBeenCalled();
	});

	it("indica el campo isbn al rechazar un ISBN inválido", async () => {
		simularFuentes(() => googleVacia());
		await expect(buscarPorIsbn("123")).rejects.toMatchObject({
			estado: 422,
			campos: { isbn: "El ISBN no es válido" },
		});
	});

	it("informa que el enriquecimiento no está disponible si ambas fuentes fallan", async () => {
		simularFuentes(() => Promise.reject(new Error("timeout")));

		await expect(buscarPorIsbn(AMBAS_FALLAN)).rejects.toMatchObject({ estado: 503 });
	});

	it("usa la fuente alternativa cuando la primaria falla en vez de caer", async () => {
		simularFuentes((url) => {
			if (url.includes("googleapis")) throw new Error("500");
			return respuestaOpenLibrary(CACHEADO, { title: "Ficciones" });
		});

		const resultado = await buscarPorIsbn(CACHEADO);
		expect(resultado.encontrado).toBe(true);
	});

	it("no vuelve a consultar la red para un ISBN ya buscado", async () => {
		const espia = simularFuentes(() => respuestaOpenLibrary(CACHEADO, { title: "Ficciones" }));

		await buscarPorIsbn(CACHEADO);

		expect(espia).not.toHaveBeenCalled();
	});
});
