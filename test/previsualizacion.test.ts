import { describe, expect, it } from "vitest";
import type { Libro } from "../src/shared/libro";
import { descripcionDe, inyectarPrevisualizacion } from "../src/worker/servicios/previsualizacion";

const DOCUMENTO = `<!doctype html>
<html lang="es-CL">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="description" content="Catálogo de libros usados y nuevos." />
		<title>Fiestita Loca · Librería de Limache</title>
	</head>
	<body><div id="root"></div><script type="module" src="/assets/app.js"></script></body>
</html>`;

const LIBRO: Libro = {
	id: "abc-123",
	isbn: "9780307474728",
	titulo: "Cien años de soledad",
	autor: "Gabriel García Márquez",
	editorial: "Sudamericana",
	anio: 1967,
	genero: "Novela",
	sinopsis: "La historia de los Buendía en Macondo.",
	condicion: "usado",
	precio: 12990,
	estado: "disponible",
	imagenUrl: "/api/imagenes/abc.jpg",
	dadoDeBaja: false,
	creadoEn: "2026-01-01T00:00:00.000Z",
};

const ORIGEN = "https://fiestita.test";

describe("descripcionDe", () => {
	it("resume autor, condición y precio", () => {
		expect(descripcionDe(LIBRO)).toContain("Gabriel García Márquez");
		expect(descripcionDe(LIBRO)).toContain("Usado");
		expect(descripcionDe(LIBRO)).toContain("12.990");
	});

	it("funciona sin sinopsis", () => {
		const texto = descripcionDe({ ...LIBRO, sinopsis: null });
		expect(texto).toContain("Gabriel García Márquez");
		expect(texto).not.toContain("undefined");
	});

	it("recorta una sinopsis larga sin cortar una palabra", () => {
		const larga = "palabra ".repeat(80);
		const texto = descripcionDe({ ...LIBRO, sinopsis: larga });
		expect(texto.length).toBeLessThan(200);
		expect(texto).toContain("…");
	});
});

describe("inyectarPrevisualizacion", () => {
	const html = inyectarPrevisualizacion(DOCUMENTO, LIBRO, ORIGEN);

	it("pone el título y el autor en el título del documento", () => {
		expect(html).toContain("<title>Cien años de soledad — Gabriel García Márquez · Fiestita Loca</title>");
	});

	it("deja un solo título en el documento", () => {
		expect(html.match(/<title>/g)).toHaveLength(1);
	});

	it("deja una sola descripción", () => {
		expect(html.match(/name="description"/g)).toHaveLength(1);
	});

	it("agrega las etiquetas Open Graph con la URL absoluta de la imagen", () => {
		expect(html).toContain('property="og:title"');
		expect(html).toContain(`content="${ORIGEN}/api/imagenes/abc.jpg"`);
		expect(html).toContain(`content="${ORIGEN}/libro/abc-123"`);
	});

	it("usa la tarjeta grande solo cuando hay imagen", () => {
		expect(html).toContain('content="summary_large_image"');
		const sinImagen = inyectarPrevisualizacion(DOCUMENTO, { ...LIBRO, imagenUrl: null }, ORIGEN);
		expect(sinImagen).toContain('content="summary"');
		expect(sinImagen).not.toContain("og:image");
	});

	it("conserva el script del cliente para que el SPA siga arrancando", () => {
		expect(html).toContain('src="/assets/app.js"');
		expect(html).toContain('<div id="root">');
	});

	it("escapa las comillas y los signos del título", () => {
		const peligroso = inyectarPrevisualizacion(
			DOCUMENTO,
			{ ...LIBRO, titulo: 'El "gran" <libro> & otros' },
			ORIGEN,
		);
		expect(peligroso).toContain("&quot;gran&quot;");
		expect(peligroso).toContain("&lt;libro&gt;");
		expect(peligroso).toContain("&amp;");
		// Nada de lo inyectado puede abrir una etiqueta nueva.
		expect(peligroso).not.toContain("<libro>");
	});
});
