import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "token-de-prueba";
const BASE = "https://libreria.test";

let cookie = "";

async function iniciarSesion(): Promise<string> {
	const respuesta = await SELF.fetch(`${BASE}/api/auth/ingreso`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.90" },
		body: JSON.stringify({ token: TOKEN }),
	});
	const cabecera = respuesta.headers.get("Set-Cookie");
	if (!cabecera) throw new Error("El ingreso no devolvió cookie");
	return cabecera.split(";")[0];
}

function comoAdmin(ruta: string, init: RequestInit = {}) {
	return SELF.fetch(`${BASE}${ruta}`, {
		...init,
		headers: { ...(init.headers as Record<string, string>), Cookie: cookie },
	});
}

function json(ruta: string, cuerpo: unknown, metodo = "POST") {
	return comoAdmin(ruta, {
		method: metodo,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(cuerpo),
	});
}

const LIBRO_BASE = {
	titulo: "El Aleph",
	autor: "Jorge Luis Borges",
	condicion: "usado" as const,
	precio: 8500,
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

beforeEach(async () => {
	await limpiar();
	cookie = await iniciarSesion();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** JPEG mínimo: los tres bytes de la firma bastan para la detección por contenido. */
function jpegDePrueba(relleno = 64): Uint8Array {
	const bytes = new Uint8Array(3 + relleno);
	bytes.set([0xff, 0xd8, 0xff]);
	bytes.fill(0x41, 3);
	return bytes;
}

function pngDePrueba(): Uint8Array {
	const bytes = new Uint8Array(32);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return bytes;
}

async function crear(datos: Record<string, unknown> = {}) {
	const respuesta = await json("/api/admin/libros", { ...LIBRO_BASE, ...datos });
	const cuerpo = (await respuesta.json()) as { libro: { id: string; [k: string]: unknown } };
	return { respuesta, libro: cuerpo.libro };
}

describe("protección de las rutas de inventario", () => {
	it("rechaza el listado sin sesión", async () => {
		const respuesta = await SELF.fetch(`${BASE}/api/admin/libros`);
		expect(respuesta.status).toBe(401);
	});

	it("rechaza el alta sin sesión", async () => {
		const respuesta = await SELF.fetch(`${BASE}/api/admin/libros`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(LIBRO_BASE),
		});
		expect(respuesta.status).toBe(401);
	});
});

describe("alta de libros", () => {
	it("crea el libro con los datos mínimos, disponible y con fecha", async () => {
		const { respuesta, libro } = await crear();

		expect(respuesta.status).toBe(201);
		expect(libro).toMatchObject({ titulo: "El Aleph", estado: "disponible", precio: 8500 });
		expect(libro.id).toBeTruthy();
		expect(libro.creadoEn).toBeTruthy();
	});

	it("rechaza un precio de cero indicando el campo", async () => {
		const respuesta = await json("/api/admin/libros", { ...LIBRO_BASE, precio: 0 });
		expect(respuesta.status).toBe(422);
		expect((await respuesta.json() as { campos: Record<string, string> }).campos).toHaveProperty("precio");

		const { results } = await env.DB.prepare("SELECT id FROM libros").all();
		expect(results).toHaveLength(0);
	});

	it("rechaza un precio con decimales", async () => {
		const respuesta = await json("/api/admin/libros", { ...LIBRO_BASE, precio: 8500.5 });
		expect(respuesta.status).toBe(422);
	});

	it("indica cuáles campos obligatorios faltan", async () => {
		const respuesta = await json("/api/admin/libros", { condicion: "usado", precio: 8500 });
		const cuerpo = (await respuesta.json()) as { campos: Record<string, string> };
		expect(respuesta.status).toBe(422);
		expect(Object.keys(cuerpo.campos).sort()).toEqual(["autor", "titulo"]);
	});

	it("normaliza el ISBN quitando guiones antes de guardarlo", async () => {
		const { libro } = await crear({ isbn: "978-0-306-40615-7" });
		expect(libro.isbn).toBe("9780306406157");
	});

	it("guarda como nulo un ISBN con dígito verificador inválido", async () => {
		const { libro } = await crear({ isbn: "9780306406156" });
		expect(libro.isbn).toBeNull();
	});

	it("permite un segundo ejemplar con el mismo ISBN", async () => {
		await crear({ isbn: "9780306406157", precio: 8500 });
		const { respuesta, libro } = await crear({ isbn: "9780306406157", precio: 12000 });

		expect(respuesta.status).toBe(201);
		expect(libro.precio).toBe(12000);
	});

	it("descarga la portada externa a R2 y la sirve como ruta propia", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve(new Response(jpegDePrueba(), { headers: { "Content-Type": "image/jpeg" } })),
			),
		);

		const { libro } = await crear({ portadaUrl: "https://ejemplo.test/portada.jpg" });

		expect(libro.imagenUrl).toMatch(/^\/api\/imagenes\/[0-9a-f]{32}\.jpg$/);
	});

	it("crea el libro igual si la portada externa no se puede traer", async () => {
		vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("sin red"))));

		const { respuesta, libro } = await crear({ portadaUrl: "https://ejemplo.test/rota.jpg" });

		expect(respuesta.status).toBe(201);
		expect(libro.imagenUrl).toBeNull();
	});

	it("ignora una portada externa que no es una imagen", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46])))),
		);

		const { libro } = await crear({ portadaUrl: "https://ejemplo.test/documento.pdf" });
		expect(libro.imagenUrl).toBeNull();
	});
});

describe("consulta de metadatos por ISBN", () => {
	function simularGoogle(volumeInfo: unknown) {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve(
					new Response(JSON.stringify({ totalItems: 1, items: [{ volumeInfo }] }), {
						headers: { "Content-Type": "application/json" },
					}),
				),
			),
		);
	}

	it("devuelve los metadatos y la fuente", async () => {
		simularGoogle({ title: "Ficciones", authors: ["Jorge Luis Borges"] });

		const respuesta = await comoAdmin("/api/admin/libros/isbn/9781901000009");
		const cuerpo = (await respuesta.json()) as {
			encontrado: boolean;
			metadatos: { titulo: string; fuente: string };
			ejemplares: number;
		};

		expect(respuesta.status).toBe(200);
		expect(cuerpo.encontrado).toBe(true);
		expect(cuerpo.metadatos.titulo).toBe("Ficciones");
		expect(cuerpo.metadatos.fuente).toBe("google-books");
		expect(cuerpo.ejemplares).toBe(0);
	});

	it("avisa cuántos ejemplares con ese ISBN ya existen", async () => {
		await crear({ isbn: "9781111000004" });
		simularGoogle({ title: "Repetido" });

		const respuesta = await comoAdmin("/api/admin/libros/isbn/9781111000004");
		const cuerpo = (await respuesta.json()) as { ejemplares: number };
		expect(cuerpo.ejemplares).toBe(1);
	});

	it("rechaza un ISBN mal formado sin consultar ninguna fuente", async () => {
		const espia = vi.fn(() => Promise.resolve(new Response("{}")));
		vi.stubGlobal("fetch", espia);

		const respuesta = await comoAdmin("/api/admin/libros/isbn/9780306406156");

		expect(respuesta.status).toBe(422);
		expect(espia).not.toHaveBeenCalled();
	});

	it("acepta el ISBN escrito con guiones", async () => {
		simularGoogle({ title: "Con guiones" });
		const respuesta = await comoAdmin("/api/admin/libros/isbn/978-0-521-12345-7");
		expect(respuesta.status).toBe(200);
	});
});

describe("edición de libros", () => {
	it("cambia el precio", async () => {
		const { libro } = await crear();

		const respuesta = await json(`/api/admin/libros/${libro.id}`, { precio: 9900 }, "PATCH");
		const cuerpo = (await respuesta.json()) as { libro: { precio: number } };

		expect(respuesta.status).toBe(200);
		expect(cuerpo.libro.precio).toBe(9900);
	});

	it("recalcula la columna normalizada al cambiar el autor", async () => {
		const { libro } = await crear();

		await json(`/api/admin/libros/${libro.id}`, { autor: "Isabel Allendé" }, "PATCH");

		const fila = await env.DB.prepare("SELECT autor_norm FROM libros WHERE id = ?")
			.bind(libro.id)
			.first<{ autor_norm: string }>();
		expect(fila?.autor_norm).toBe("isabel allende");
	});

	it("responde 404 sobre un libro inexistente", async () => {
		const respuesta = await json("/api/admin/libros/no-existe", { precio: 1000 }, "PATCH");
		expect(respuesta.status).toBe(404);
	});

	it("rechaza una edición sin ningún campo", async () => {
		const { libro } = await crear();
		const respuesta = await json(`/api/admin/libros/${libro.id}`, {}, "PATCH");
		expect(respuesta.status).toBe(422);
	});
});

describe("baja de libros", () => {
	it("da de baja un libro sin reservas y lo saca del catálogo", async () => {
		const { libro } = await crear();

		const respuesta = await comoAdmin(`/api/admin/libros/${libro.id}`, { method: "DELETE" });
		expect(respuesta.status).toBe(200);

		const fila = await env.DB.prepare("SELECT dado_de_baja FROM libros WHERE id = ?")
			.bind(libro.id)
			.first<{ dado_de_baja: number }>();
		expect(fila?.dado_de_baja).toBe(1);
	});

	it("sigue siendo consultable desde el backoffice tras la baja", async () => {
		const { libro } = await crear();
		await comoAdmin(`/api/admin/libros/${libro.id}`, { method: "DELETE" });

		const respuesta = await comoAdmin(`/api/admin/libros/${libro.id}`);
		expect(respuesta.status).toBe(200);
	});

	it("bloquea la baja indicando el folio de la reserva que lo retiene", async () => {
		const { libro } = await crear();
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO reservas (id, folio, nombre, telefono, estado, total, creado_en, actualizado_en)
				VALUES ('r1', 'FL-ABCDE', 'Cliente', '+56911112222', 'pendiente', 8500, '2026-01-01', '2026-01-01')`,
			),
			env.DB.prepare(
				"INSERT INTO reserva_items (reserva_id, libro_id, precio) VALUES ('r1', ?, 8500)",
			).bind(libro.id),
		]);

		const respuesta = await comoAdmin(`/api/admin/libros/${libro.id}`, { method: "DELETE" });
		const cuerpo = (await respuesta.json()) as { error: string };

		expect(respuesta.status).toBe(409);
		expect(cuerpo.error).toContain("FL-ABCDE");
	});
});

describe("foto del ejemplar", () => {
	function subir(id: string, archivo: Blob, nombre = "foto.jpg") {
		const formulario = new FormData();
		formulario.append("foto", archivo, nombre);
		return comoAdmin(`/api/admin/libros/${id}/foto`, { method: "POST", body: formulario });
	}

	it("acepta un JPEG y devuelve la URL con que se sirve", async () => {
		const { libro } = await crear();

		const respuesta = await subir(libro.id, new Blob([jpegDePrueba()], { type: "image/jpeg" }));
		const cuerpo = (await respuesta.json()) as { libro: { imagenUrl: string } };

		expect(respuesta.status).toBe(200);
		expect(cuerpo.libro.imagenUrl).toMatch(/^\/api\/imagenes\/[0-9a-f]{32}\.jpg$/);
	});

	it("acepta PNG y WebP", async () => {
		const { libro } = await crear();
		expect((await subir(libro.id, new Blob([pngDePrueba()], { type: "image/png" }))).status).toBe(200);

		const webp = new Uint8Array(16);
		webp.set([...new TextEncoder().encode("RIFF")], 0);
		webp.set([...new TextEncoder().encode("WEBP")], 8);
		expect((await subir(libro.id, new Blob([webp], { type: "image/webp" }))).status).toBe(200);
	});

	it("rechaza un PDF disfrazado de imagen y conserva la foto anterior", async () => {
		const { libro } = await crear();
		await subir(libro.id, new Blob([jpegDePrueba()], { type: "image/jpeg" }));

		const antes = await env.DB.prepare("SELECT foto_clave FROM libros WHERE id = ?")
			.bind(libro.id)
			.first<{ foto_clave: string }>();

		// Content-Type mentido a propósito: la validación mira los bytes.
		const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: "image/jpeg" });
		const respuesta = await subir(libro.id, pdf, "documento.pdf");
		const cuerpo = (await respuesta.json()) as { error: string; campos: Record<string, string> };

		expect(respuesta.status).toBe(422);
		expect(cuerpo.error).toContain("JPEG, PNG o WebP");
		expect(cuerpo.campos).toHaveProperty("foto");

		const despues = await env.DB.prepare("SELECT foto_clave FROM libros WHERE id = ?")
			.bind(libro.id)
			.first<{ foto_clave: string }>();
		expect(despues?.foto_clave).toBe(antes?.foto_clave);
	});

	it("rechaza una imagen de más de 5 MB indicando el máximo", async () => {
		const { libro } = await crear();
		const grande = new Blob([jpegDePrueba(5 * 1024 * 1024 + 10)], { type: "image/jpeg" });

		const respuesta = await subir(libro.id, grande);
		const cuerpo = (await respuesta.json()) as { error: string };

		expect(respuesta.status).toBe(422);
		expect(cuerpo.error).toContain("5 MB");
	});

	it("reemplaza la foto anterior y la deja inaccesible", async () => {
		const { libro } = await crear();

		const primera = await subir(libro.id, new Blob([jpegDePrueba(10)], { type: "image/jpeg" }));
		const claveVieja = ((await primera.json()) as { libro: { imagenUrl: string } }).libro.imagenUrl
			.split("/")
			.pop() as string;

		const segunda = await subir(libro.id, new Blob([jpegDePrueba(20)], { type: "image/jpeg" }));
		const claveNueva = ((await segunda.json()) as { libro: { imagenUrl: string } }).libro.imagenUrl
			.split("/")
			.pop() as string;

		expect(claveNueva).not.toBe(claveVieja);
		expect(await env.IMAGENES.get(claveVieja)).toBeNull();
		expect(await env.IMAGENES.get(claveNueva)).not.toBeNull();
	});

	it("la foto del ejemplar manda sobre la portada externa", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(pngDePrueba()))),
		);
		const { libro } = await crear({ portadaUrl: "https://ejemplo.test/portada.png" });
		vi.unstubAllGlobals();

		const respuesta = await subir(libro.id, new Blob([jpegDePrueba(7)], { type: "image/jpeg" }));
		const cuerpo = (await respuesta.json()) as { libro: { imagenUrl: string } };

		expect(cuerpo.libro.imagenUrl).toMatch(/\.jpg$/);
	});

	it("responde 404 al subir una foto a un libro inexistente", async () => {
		const respuesta = await subir("no-existe", new Blob([jpegDePrueba()], { type: "image/jpeg" }));
		expect(respuesta.status).toBe(404);
	});

	it("rechaza el envío sin archivo", async () => {
		const { libro } = await crear();
		const formulario = new FormData();
		formulario.append("otro", "cosa");
		const respuesta = await comoAdmin(`/api/admin/libros/${libro.id}/foto`, {
			method: "POST",
			body: formulario,
		});
		expect(respuesta.status).toBe(422);
	});
});

describe("servicio de imágenes", () => {
	it("sirve la imagen con caché inmutable y su tipo", async () => {
		const { libro } = await crear();
		const formulario = new FormData();
		formulario.append("foto", new Blob([jpegDePrueba(12)], { type: "image/jpeg" }), "f.jpg");
		const subida = await comoAdmin(`/api/admin/libros/${libro.id}/foto`, {
			method: "POST",
			body: formulario,
		});
		const url = ((await subida.json()) as { libro: { imagenUrl: string } }).libro.imagenUrl;

		// Es pública: se pide sin cookie de sesión.
		const respuesta = await SELF.fetch(`${BASE}${url}`);

		expect(respuesta.status).toBe(200);
		expect(respuesta.headers.get("Content-Type")).toBe("image/jpeg");
		expect(respuesta.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
	});

	it("responde 404 para una clave que no existe", async () => {
		const respuesta = await SELF.fetch(`${BASE}/api/imagenes/${"a".repeat(32)}.jpg`);
		expect(respuesta.status).toBe(404);
	});

	it("responde 404 para una clave con forma inválida sin tocar el bucket", async () => {
		// La clave se genera aquí y siempre es 32 hex + extensión. Cualquier otra
		// forma es alguien tanteando el bucket y se corta antes del `get`.
		for (const clave of ["wrangler.json", "..%2Fsecreto", "ZZZ.jpg", `${"a".repeat(32)}.pdf`]) {
			const respuesta = await SELF.fetch(`${BASE}/api/imagenes/${clave}`);
			expect(respuesta.status, clave).toBe(404);
			expect(respuesta.headers.get("Content-Type")).toContain("application/json");
		}
	});
});

describe("listado del backoffice", () => {
	it("incluye los libros dados de baja", async () => {
		const { libro } = await crear();
		await comoAdmin(`/api/admin/libros/${libro.id}`, { method: "DELETE" });

		const respuesta = await comoAdmin("/api/admin/libros");
		const cuerpo = (await respuesta.json()) as { items: unknown[]; total: number };

		expect(cuerpo.total).toBe(1);
		expect(cuerpo.items).toHaveLength(1);
	});

	it("devuelve los géneros publicados para armar el filtro", async () => {
		await crear({ genero: "Cuento" });
		const respuesta = await comoAdmin("/api/admin/libros");
		const cuerpo = (await respuesta.json()) as { generos: string[] };
		expect(cuerpo.generos).toContain("Cuento");
	});

	it("filtra por búsqueda ignorando las tildes", async () => {
		await crear({ autor: "Isabel Allende", titulo: "La casa de los espíritus" });
		const respuesta = await comoAdmin("/api/admin/libros?busqueda=allendé");
		const cuerpo = (await respuesta.json()) as { total: number };
		expect(cuerpo.total).toBe(1);
	});
});
