import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
	actualizarLibro,
	contarPorIsbn,
	crearLibro,
	darDeBajaLibro,
	generosDisponibles,
	listarLibros,
	obtenerLibro,
	reservasQueBloquean,
} from "../src/worker/datos/libros";
import { ErrorDominio } from "../src/worker/datos/comun";

const base = {
	isbn: null,
	titulo: "Cien años de soledad",
	autor: "Gabriel García Márquez",
	editorial: null,
	anio: null,
	genero: "Novela",
	sinopsis: null,
	condicion: "usado" as const,
	precio: 8500,
	portadaUrl: null,
};

async function limpiar() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM reserva_items"),
		env.DB.prepare("DELETE FROM reserva_eventos"),
		env.DB.prepare("DELETE FROM reservas"),
		env.DB.prepare("DELETE FROM solicitud_coincidencias"),
		env.DB.prepare("DELETE FROM libros"),
	]);
}

beforeEach(limpiar);

describe("crearLibro", () => {
	it("persiste el libro como disponible y con fecha de ingreso", async () => {
		const libro = await crearLibro(env.DB, base);
		expect(libro.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(libro.estado).toBe("disponible");
		expect(libro.creadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("guarda las columnas normalizadas sin tildes", async () => {
		const libro = await crearLibro(env.DB, base);
		const fila = await env.DB.prepare("SELECT titulo_norm, autor_norm FROM libros WHERE id = ?")
			.bind(libro.id)
			.first<{ titulo_norm: string; autor_norm: string }>();
		expect(fila?.titulo_norm).toBe("cien anos de soledad");
		expect(fila?.autor_norm).toBe("gabriel garcia marquez");
	});

	it("deja sin imagen al libro que no trae portada", async () => {
		const libro = await crearLibro(env.DB, base);
		expect(libro.imagenUrl).toBeNull();
	});

	it("expone la portada guardada en R2 como ruta propia", async () => {
		const libro = await crearLibro(env.DB, { ...base, imagenClave: "abc123.jpg" });
		expect(libro.imagenUrl).toBe("/api/imagenes/abc123.jpg");
	});
});

describe("listarLibros", () => {
	it("devuelve el catálogo vacío sin error", async () => {
		const pagina = await listarLibros(env.DB);
		expect(pagina.items).toEqual([]);
		expect(pagina.total).toBe(0);
	});

	it("ordena del más reciente al más antiguo", async () => {
		await crearLibro(env.DB, { ...base, titulo: "Primero" });
		await new Promise((r) => setTimeout(r, 5));
		await crearLibro(env.DB, { ...base, titulo: "Segundo" });
		const pagina = await listarLibros(env.DB);
		expect(pagina.items.map((l) => l.titulo)).toEqual(["Segundo", "Primero"]);
	});

	it("pagina de a 24 por omisión", async () => {
		for (let i = 0; i < 26; i++) {
			await crearLibro(env.DB, { ...base, titulo: `Libro ${i}` });
		}
		const primera = await listarLibros(env.DB);
		expect(primera.items).toHaveLength(24);
		expect(primera.total).toBe(26);
		const segunda = await listarLibros(env.DB, { pagina: 2 });
		expect(segunda.items).toHaveLength(2);
	});

	it("busca por autor ignorando las tildes", async () => {
		await crearLibro(env.DB, base);
		const pagina = await listarLibros(env.DB, { busqueda: "garcia marquez" });
		expect(pagina.items).toHaveLength(1);
	});

	it("busca por título parcial", async () => {
		await crearLibro(env.DB, base);
		const pagina = await listarLibros(env.DB, { busqueda: "cien años" });
		expect(pagina.items).toHaveLength(1);
	});

	it("busca por ISBN tal cual se guarda", async () => {
		await crearLibro(env.DB, { ...base, isbn: "9788437604947" });
		const pagina = await listarLibros(env.DB, { busqueda: "9788437604947" });
		expect(pagina.items).toHaveLength(1);
	});

	it("busca por ISBN aunque el visitante lo escriba con guiones", async () => {
		await crearLibro(env.DB, { ...base, isbn: "9788437604947" });
		const pagina = await listarLibros(env.DB, { busqueda: "978-84-376-0494-7" });
		expect(pagina.items).toHaveLength(1);
	});

	it("combina filtros de género, condición y disponibilidad", async () => {
		await crearLibro(env.DB, { ...base, genero: "Novela", condicion: "usado" });
		await crearLibro(env.DB, { ...base, genero: "Poesía", condicion: "usado" });
		await crearLibro(env.DB, { ...base, genero: "Novela", condicion: "nuevo" });
		const pagina = await listarLibros(env.DB, {
			genero: "Novela",
			condicion: "usado",
			soloDisponibles: true,
		});
		expect(pagina.items).toHaveLength(1);
		expect(pagina.total).toBe(1);
	});

	it("aplica el filtro sobre una búsqueda previa", async () => {
		await crearLibro(env.DB, { ...base, autor: "Jorge Luis Borges", condicion: "usado" });
		await crearLibro(env.DB, { ...base, autor: "Jorge Luis Borges", condicion: "nuevo" });
		const pagina = await listarLibros(env.DB, { busqueda: "borges", condicion: "usado" });
		expect(pagina.items).toHaveLength(1);
	});

	it("ordena por precio ascendente y descendente", async () => {
		await crearLibro(env.DB, { ...base, precio: 5000 });
		await crearLibro(env.DB, { ...base, precio: 15000 });
		const asc = await listarLibros(env.DB, { orden: "precio-asc" });
		expect(asc.items.map((l) => l.precio)).toEqual([5000, 15000]);
		const desc = await listarLibros(env.DB, { orden: "precio-desc" });
		expect(desc.items.map((l) => l.precio)).toEqual([15000, 5000]);
	});

	it("oculta del catálogo los libros dados de baja", async () => {
		const libro = await crearLibro(env.DB, base);
		await darDeBajaLibro(env.DB, libro.id);
		expect((await listarLibros(env.DB)).items).toHaveLength(0);
		expect((await listarLibros(env.DB, { incluirDadosDeBaja: true })).items).toHaveLength(1);
	});
});

describe("obtenerLibro", () => {
	it("devuelve null para un id inexistente", async () => {
		expect(await obtenerLibro(env.DB, "no-existe")).toBeNull();
	});

	it("devuelve null para un libro dado de baja", async () => {
		const libro = await crearLibro(env.DB, base);
		await darDeBajaLibro(env.DB, libro.id);
		expect(await obtenerLibro(env.DB, libro.id)).toBeNull();
		expect(await obtenerLibro(env.DB, libro.id, true)).not.toBeNull();
	});
});

describe("actualizarLibro", () => {
	it("cambia el precio", async () => {
		const libro = await crearLibro(env.DB, base);
		const actualizado = await actualizarLibro(env.DB, libro.id, { precio: 9900 });
		expect(actualizado.precio).toBe(9900);
	});

	it("recalcula las columnas normalizadas al cambiar el título", async () => {
		const libro = await crearLibro(env.DB, base);
		await actualizarLibro(env.DB, libro.id, { titulo: "Crónica de una muerte anunciada" });
		const fila = await env.DB.prepare("SELECT titulo_norm FROM libros WHERE id = ?")
			.bind(libro.id)
			.first<{ titulo_norm: string }>();
		expect(fila?.titulo_norm).toBe("cronica de una muerte anunciada");
	});

	it("falla con 404 sobre un libro inexistente", async () => {
		await expect(actualizarLibro(env.DB, "no-existe", { precio: 1000 })).rejects.toThrow(ErrorDominio);
	});
});

describe("darDeBajaLibro", () => {
	it("da de baja un libro sin reservas", async () => {
		const libro = await crearLibro(env.DB, base);
		await darDeBajaLibro(env.DB, libro.id);
		const guardado = await obtenerLibro(env.DB, libro.id, true);
		expect(guardado?.dadoDeBaja).toBe(true);
	});

	it("bloquea la baja de un libro con reserva pendiente e indica el folio", async () => {
		const libro = await crearLibro(env.DB, base);
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO reservas (id, folio, nombre, telefono, estado, total, creado_en, actualizado_en)
				VALUES ('r1', 'FL-ABC12', 'Ana', '+56911112222', 'pendiente', 8500, '2026-01-01', '2026-01-01')`,
			),
			env.DB.prepare("INSERT INTO reserva_items (reserva_id, libro_id, precio) VALUES ('r1', ?, 8500)").bind(
				libro.id,
			),
		]);
		expect(await reservasQueBloquean(env.DB, libro.id)).toEqual(["FL-ABC12"]);
		await expect(darDeBajaLibro(env.DB, libro.id)).rejects.toThrow(/FL-ABC12/);
	});
});

describe("contarPorIsbn y generosDisponibles", () => {
	it("cuenta los ejemplares que comparten ISBN", async () => {
		await crearLibro(env.DB, { ...base, isbn: "9788437604947" });
		await crearLibro(env.DB, { ...base, isbn: "9788437604947", precio: 12000 });
		expect(await contarPorIsbn(env.DB, "9788437604947")).toBe(2);
	});

	it("lista los géneros publicados sin repetir", async () => {
		await crearLibro(env.DB, { ...base, genero: "Novela" });
		await crearLibro(env.DB, { ...base, genero: "Novela" });
		await crearLibro(env.DB, { ...base, genero: "Poesía" });
		expect(await generosDisponibles(env.DB)).toEqual(["Novela", "Poesía"]);
	});
});
