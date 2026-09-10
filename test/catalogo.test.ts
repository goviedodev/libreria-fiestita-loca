import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { crearLibro } from "../src/worker/datos/libros";
import type { Condicion } from "../src/shared/libro";

const BASE = "https://libreria.test";

interface Respuesta {
	items: { id: string; titulo: string; autor: string; estado: string; imagenUrl: string | null }[];
	total: number;
	pagina: number;
	porPagina: number;
	generos: string[];
}

function catalogo(consulta = ""): Promise<Response> {
	return SELF.fetch(`${BASE}/api/libros${consulta}`);
}

async function leer(consulta = ""): Promise<Respuesta> {
	const respuesta = await catalogo(consulta);
	expect(respuesta.status).toBe(200);
	return (await respuesta.json()) as Respuesta;
}

async function limpiar() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM reserva_items"),
		env.DB.prepare("DELETE FROM reservas"),
		env.DB.prepare("DELETE FROM libros"),
	]);
}

interface Semilla {
	titulo?: string;
	autor?: string;
	condicion?: Condicion;
	precio?: number;
	genero?: string | null;
	isbn?: string | null;
	imagenClave?: string | null;
}

async function sembrar(datos: Semilla = {}) {
	return crearLibro(env.DB, {
		isbn: datos.isbn ?? null,
		titulo: datos.titulo ?? "El Aleph",
		autor: datos.autor ?? "Jorge Luis Borges",
		editorial: null,
		anio: null,
		genero: datos.genero ?? null,
		sinopsis: null,
		condicion: datos.condicion ?? "usado",
		precio: datos.precio ?? 8500,
		portadaUrl: null,
		imagenClave: datos.imagenClave ?? null,
	});
}

beforeEach(limpiar);

describe("listado del catálogo", () => {
	it("es público: no exige sesión", async () => {
		await sembrar();
		const respuesta = await catalogo();
		expect(respuesta.status).toBe(200);
	});

	it("responde sin error cuando no hay libros publicados", async () => {
		const datos = await leer();
		expect(datos.total).toBe(0);
		expect(datos.items).toEqual([]);
	});

	it("ordena del más reciente al más antiguo de forma predeterminada", async () => {
		await sembrar({ titulo: "Primero" });
		await sembrar({ titulo: "Segundo" });
		await sembrar({ titulo: "Tercero" });

		const datos = await leer();
		expect(datos.items.map((l) => l.titulo)).toEqual(["Tercero", "Segundo", "Primero"]);
	});

	it("pagina de a 24 e informa el total", async () => {
		for (let i = 0; i < 26; i++) await sembrar({ titulo: `Libro ${i}` });

		const primera = await leer();
		expect(primera.items).toHaveLength(24);
		expect(primera.total).toBe(26);
		expect(primera.porPagina).toBe(24);

		const segunda = await leer("?pagina=2");
		expect(segunda.items).toHaveLength(2);
		expect(segunda.pagina).toBe(2);
	});

	it("no deja que el visitante pida más de 24 por página", async () => {
		for (let i = 0; i < 30; i++) await sembrar({ titulo: `Libro ${i}` });
		// El parámetro no está en el esquema público: se ignora.
		const datos = await leer("?porPagina=500");
		expect(datos.items).toHaveLength(24);
	});

	it("oculta los libros dados de baja", async () => {
		const libro = await sembrar({ titulo: "Retirado" });
		await sembrar({ titulo: "Publicado" });
		await env.DB.prepare("UPDATE libros SET dado_de_baja = 1 WHERE id = ?").bind(libro.id).run();

		const datos = await leer();
		expect(datos.items.map((l) => l.titulo)).toEqual(["Publicado"]);
	});

	it("sigue mostrando los vendidos, marcados como no disponibles", async () => {
		const libro = await sembrar({ titulo: "Vendido" });
		await env.DB.prepare("UPDATE libros SET estado = 'vendido' WHERE id = ?").bind(libro.id).run();

		const datos = await leer();
		expect(datos.items[0]).toMatchObject({ titulo: "Vendido", estado: "vendido" });
	});

	it("deja la imagen en null cuando el libro no tiene ninguna", async () => {
		await sembrar();
		const datos = await leer();
		expect(datos.items[0].imagenUrl).toBeNull();
	});

	it("nunca expone el campo interno de baja", async () => {
		await sembrar();
		const datos = await leer();
		expect(datos.items[0]).not.toHaveProperty("dadoDeBaja");
	});

	it("devuelve los géneros publicados para armar el filtro", async () => {
		await sembrar({ genero: "Novela" });
		await sembrar({ genero: "Cuento" });
		const datos = await leer();
		expect(datos.generos).toEqual(["Cuento", "Novela"]);
	});
});

describe("búsqueda", () => {
	it("encuentra por autor ignorando tildes y mayúsculas", async () => {
		await sembrar({ autor: "Gabriel García Márquez", titulo: "Cien años de soledad" });
		await sembrar({ autor: "Jorge Luis Borges", titulo: "El Aleph" });

		for (const termino of ["garcia marquez", "GARCÍA MÁRQUEZ", "García Marquez"]) {
			const datos = await leer(`?q=${encodeURIComponent(termino)}`);
			expect(datos.total, termino).toBe(1);
			expect(datos.items[0].titulo).toBe("Cien años de soledad");
		}
	});

	it("admite coincidencias parciales de título", async () => {
		await sembrar({ titulo: "Cien años de soledad" });
		const datos = await leer("?q=cien%20anos");
		expect(datos.total).toBe(1);
	});

	it("busca por ISBN aunque se escriba con guiones", async () => {
		await sembrar({ isbn: "9780306406157", titulo: "Con ISBN" });
		const datos = await leer("?q=978-0-306-40615-7");
		expect(datos.total).toBe(1);
	});

	it("informa cero resultados sin error cuando no hay coincidencias", async () => {
		await sembrar();
		const datos = await leer("?q=inexistente");
		expect(datos.total).toBe(0);
		expect(datos.items).toEqual([]);
	});
});

describe("filtros y orden", () => {
	beforeEach(async () => {
		await sembrar({ titulo: "Novela usada barata", genero: "Novela", condicion: "usado", precio: 3000 });
		await sembrar({ titulo: "Novela nueva cara", genero: "Novela", condicion: "nuevo", precio: 20000 });
		await sembrar({ titulo: "Cuento usado", genero: "Cuento", condicion: "usado", precio: 5000 });
	});

	it("combina género, condición y disponibilidad", async () => {
		const datos = await leer("?genero=Novela&condicion=usado&disponibilidad=disponible");
		expect(datos.total).toBe(1);
		expect(datos.items[0].titulo).toBe("Novela usada barata");
	});

	it("aplica un filtro sobre una búsqueda previa", async () => {
		const datos = await leer("?q=novela&condicion=usado");
		expect(datos.total).toBe(1);
		expect(datos.items[0].titulo).toBe("Novela usada barata");
	});

	it("excluye los no disponibles cuando se filtra por disponibilidad", async () => {
		const vendido = await sembrar({ titulo: "Ya vendido", genero: "Novela" });
		await env.DB.prepare("UPDATE libros SET estado = 'vendido' WHERE id = ?").bind(vendido.id).run();

		const todos = await leer("?genero=Novela");
		const soloDisponibles = await leer("?genero=Novela&disponibilidad=disponible");
		expect(todos.total).toBe(3);
		expect(soloDisponibles.total).toBe(2);
	});

	it("ordena por precio ascendente y descendente", async () => {
		const asc = await leer("?orden=precio-asc");
		const desc = await leer("?orden=precio-desc");
		expect(asc.items[0].titulo).toBe("Novela usada barata");
		expect(desc.items[0].titulo).toBe("Novela nueva cara");
	});

	it("sin filtros devuelve el catálogo completo", async () => {
		const datos = await leer();
		expect(datos.total).toBe(3);
	});

	it("ignora un valor desconocido en vez de romper el enlace compartido", async () => {
		// Un enlace viejo con un género que ya no existe debe abrir el catálogo igual.
		const datos = await leer("?condicion=inventada&orden=inventado&pagina=cero");
		expect(datos.total).toBe(3);
		expect(datos.pagina).toBe(1);
	});
});

describe("ficha de un libro", () => {
	it("devuelve todos los datos del libro", async () => {
		const libro = await sembrar({ titulo: "El Aleph", genero: "Cuento" });
		const respuesta = await SELF.fetch(`${BASE}/api/libros/${libro.id}`);
		const cuerpo = (await respuesta.json()) as { libro: Record<string, unknown> };

		expect(respuesta.status).toBe(200);
		expect(cuerpo.libro).toMatchObject({ titulo: "El Aleph", genero: "Cuento", estado: "disponible" });
		expect(cuerpo.libro).not.toHaveProperty("dadoDeBaja");
	});

	it("responde no encontrado para un id inexistente", async () => {
		const respuesta = await SELF.fetch(`${BASE}/api/libros/no-existe`);
		expect(respuesta.status).toBe(404);
	});

	it("responde no encontrado para un libro dado de baja", async () => {
		const libro = await sembrar();
		await env.DB.prepare("UPDATE libros SET dado_de_baja = 1 WHERE id = ?").bind(libro.id).run();

		const respuesta = await SELF.fetch(`${BASE}/api/libros/${libro.id}`);
		expect(respuesta.status).toBe(404);
	});

	it("da la misma respuesta para inexistente y dado de baja", async () => {
		const libro = await sembrar();
		await env.DB.prepare("UPDATE libros SET dado_de_baja = 1 WHERE id = ?").bind(libro.id).run();

		const baja = await SELF.fetch(`${BASE}/api/libros/${libro.id}`);
		const inexistente = await SELF.fetch(`${BASE}/api/libros/otro`);
		expect(await baja.json()).toEqual(await inexistente.json());
	});
});
