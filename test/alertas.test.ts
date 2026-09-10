import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Aviso, Solicitud } from "../src/shared/solicitud";
import { mensajeDeAviso } from "../src/shared/whatsapp";
import { crearLibro } from "../src/worker/datos/libros";
import { crearSolicitud, detectarCoincidencias } from "../src/worker/datos/solicitudes";

const BASE = "https://libreria.test";
const TOKEN = "token-de-prueba";

let cookie = "";

async function iniciarSesion(): Promise<string> {
	const respuesta = await SELF.fetch(`${BASE}/api/auth/ingreso`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.55" },
		body: JSON.stringify({ token: TOKEN }),
	});
	return (respuesta.headers.get("Set-Cookie") ?? "").split(";")[0];
}

function comoAdmin(ruta: string, init: RequestInit = {}) {
	return SELF.fetch(`${BASE}${ruta}`, {
		...init,
		headers: { ...(init.headers as Record<string, string>), Cookie: cookie },
	});
}

function solicitar(cuerpo: unknown) {
	return SELF.fetch(`${BASE}/api/solicitudes`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(cuerpo),
	});
}

async function limpiar() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM solicitud_coincidencias"),
		env.DB.prepare("DELETE FROM solicitudes"),
		env.DB.prepare("DELETE FROM reserva_items"),
		env.DB.prepare("DELETE FROM reservas"),
		env.DB.prepare("DELETE FROM libros"),
	]);
}

async function sembrarLibro(titulo: string, autor: string) {
	return crearLibro(env.DB, {
		isbn: null,
		titulo,
		autor,
		editorial: null,
		anio: null,
		genero: null,
		sinopsis: null,
		condicion: "usado",
		precio: 8000,
		portadaUrl: null,
	});
}

const TELEFONO = "+56 9 1234 5678";

beforeEach(async () => {
	await limpiar();
	cookie = await iniciarSesion();
	vi.restoreAllMocks();
});

describe("registro de una búsqueda no satisfecha", () => {
	it("registra la solicitud abierta con su fecha", async () => {
		const respuesta = await solicitar({ autor: "Isabel Allende", telefono: TELEFONO });

		expect(respuesta.status).toBe(201);
		expect(await respuesta.json()).toMatchObject({ registrada: true, yaExistia: false });

		const fila = await env.DB.prepare(
			"SELECT autor, autor_norm, telefono, estado, creado_en FROM solicitudes",
		).first<{ autor: string; autor_norm: string; telefono: string; estado: string; creado_en: string }>();

		expect(fila).toMatchObject({
			autor: "Isabel Allende",
			autor_norm: "isabel allende",
			telefono: "56912345678",
			estado: "abierta",
		});
		expect(fila?.creado_en).toBeTruthy();
	});

	it("acepta una solicitud con solo el título", async () => {
		const respuesta = await solicitar({ titulo: "Rayuela", telefono: TELEFONO });
		expect(respuesta.status).toBe(201);
	});

	it("rechaza una solicitud sin título ni autor", async () => {
		const respuesta = await solicitar({ telefono: TELEFONO });
		const cuerpo = (await respuesta.json()) as { campos: Record<string, string> };

		expect(respuesta.status).toBe(422);
		expect(Object.keys(cuerpo.campos)).toContain("titulo");

		const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM solicitudes").first<{ n: number }>();
		expect(fila?.n).toBe(0);
	});

	it("rechaza un teléfono que no es celular chileno", async () => {
		const respuesta = await solicitar({ autor: "Borges", telefono: "+56 33 2412345" });
		const cuerpo = (await respuesta.json()) as { campos: Record<string, string> };
		expect(respuesta.status).toBe(422);
		expect(cuerpo.campos).toHaveProperty("telefono");
	});

	it("no crea un duplicado de una solicitud ya abierta", async () => {
		await solicitar({ autor: "Isabel Allende", telefono: TELEFONO });
		const repetida = await solicitar({ autor: "Isabel Allende", telefono: TELEFONO });

		expect(repetida.status).toBe(200);
		expect(await repetida.json()).toMatchObject({ registrada: true, yaExistia: true });

		const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM solicitudes").first<{ n: number }>();
		expect(fila?.n).toBe(1);
	});

	it("reconoce el duplicado aunque cambien tildes y mayúsculas", async () => {
		await solicitar({ autor: "Isabel Allendé", telefono: TELEFONO });
		const repetida = await solicitar({ autor: "ISABEL ALLENDE", telefono: "9 1234 5678" });

		expect(await repetida.json()).toMatchObject({ yaExistia: true });
	});

	it("sí crea una nueva si la anterior ya fue cerrada", async () => {
		await solicitar({ autor: "Isabel Allende", telefono: TELEFONO });
		await env.DB.prepare("UPDATE solicitudes SET estado = 'cerrada'").run();

		const nueva = await solicitar({ autor: "Isabel Allende", telefono: TELEFONO });
		expect(await nueva.json()).toMatchObject({ yaExistia: false });

		const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM solicitudes").first<{ n: number }>();
		expect(fila?.n).toBe(2);
	});

	it("distingue solicitudes de teléfonos distintos", async () => {
		await solicitar({ autor: "Isabel Allende", telefono: TELEFONO });
		await solicitar({ autor: "Isabel Allende", telefono: "+56 9 8765 4321" });

		const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM solicitudes").first<{ n: number }>();
		expect(fila?.n).toBe(2);
	});

	it("no devuelve el teléfono al visitante", async () => {
		const respuesta = await solicitar({ autor: "Borges", telefono: TELEFONO });
		expect(JSON.stringify(await respuesta.json())).not.toContain("5678");
	});
});

describe("detección de coincidencias", () => {
	async function coincidenciasDe(solicitudId: string): Promise<number> {
		const fila = await env.DB
			.prepare("SELECT COUNT(*) AS n FROM solicitud_coincidencias WHERE solicitud_id = ?")
			.bind(solicitudId)
			.first<{ n: number }>();
		return fila?.n ?? 0;
	}

	it("coincide por autor ignorando tildes", async () => {
		const { solicitud } = await crearSolicitud(env.DB, {
			titulo: null,
			autor: "isabel allende",
			telefono: "56912345678",
		});
		const libro = await sembrarLibro("La casa de los espíritus", "Isabel Allendé");

		expect(await detectarCoincidencias(env.DB, libro.id)).toBe(1);
		expect(await coincidenciasDe(solicitud.id)).toBe(1);
	});

	it("coincide por título parcial", async () => {
		const { solicitud } = await crearSolicitud(env.DB, {
			titulo: "cien años",
			autor: null,
			telefono: "56912345678",
		});
		const libro = await sembrarLibro("Cien años de soledad", "Gabriel García Márquez");

		expect(await detectarCoincidencias(env.DB, libro.id)).toBe(1);
		expect(await coincidenciasDe(solicitud.id)).toBe(1);
	});

	// El formulario público tiene una sola caja, así que el término del visitante
	// llega siempre como `titulo` aunque haya escrito un autor. La detección tiene
	// que cruzarlo contra ambos campos del libro.
	it("un término guardado como título coincide con el autor del libro", async () => {
		const { solicitud } = await crearSolicitud(env.DB, {
			titulo: "bolaño",
			autor: null,
			telefono: "56955554444",
		});
		const libro = await sembrarLibro("Los detectives salvajes", "Roberto Bolaño");

		expect(await detectarCoincidencias(env.DB, libro.id)).toBe(1);
		expect(await coincidenciasDe(solicitud.id)).toBe(1);
	});

	it("un término guardado como autor coincide con el título del libro", async () => {
		const { solicitud } = await crearSolicitud(env.DB, {
			titulo: null,
			autor: "rayuela",
			telefono: "56955554444",
		});
		const libro = await sembrarLibro("Rayuela", "Julio Cortázar");

		expect(await detectarCoincidencias(env.DB, libro.id)).toBe(1);
		expect(await coincidenciasDe(solicitud.id)).toBe(1);
	});

	it("no coincide cuando no tiene nada que ver", async () => {
		const { solicitud } = await crearSolicitud(env.DB, {
			titulo: null,
			autor: "Nicanor Parra",
			telefono: "56912345678",
		});
		const libro = await sembrarLibro("Rayuela", "Julio Cortázar");

		expect(await detectarCoincidencias(env.DB, libro.id)).toBe(0);
		expect(await coincidenciasDe(solicitud.id)).toBe(0);
	});

	it("ignora las solicitudes que ya no están abiertas", async () => {
		await crearSolicitud(env.DB, { titulo: null, autor: "Borges", telefono: "56912345678" });
		await env.DB.prepare("UPDATE solicitudes SET estado = 'cerrada'").run();

		const libro = await sembrarLibro("El Aleph", "Jorge Luis Borges");
		expect(await detectarCoincidencias(env.DB, libro.id)).toBe(0);
	});

	it("un libro puede satisfacer varias solicitudes", async () => {
		await crearSolicitud(env.DB, { titulo: null, autor: "Borges", telefono: "56911111111" });
		await crearSolicitud(env.DB, { titulo: "el aleph", autor: null, telefono: "56922222222" });

		const libro = await sembrarLibro("El Aleph", "Jorge Luis Borges");
		expect(await detectarCoincidencias(env.DB, libro.id)).toBe(2);
	});

	it("una solicitud puede acumular varios libros", async () => {
		const { solicitud } = await crearSolicitud(env.DB, {
			titulo: null,
			autor: "Borges",
			telefono: "56912345678",
		});
		const uno = await sembrarLibro("El Aleph", "Jorge Luis Borges");
		const dos = await sembrarLibro("Ficciones", "Jorge Luis Borges");

		await detectarCoincidencias(env.DB, uno.id);
		await detectarCoincidencias(env.DB, dos.id);

		expect(await coincidenciasDe(solicitud.id)).toBe(2);
	});

	it("no duplica una coincidencia ya registrada", async () => {
		const { solicitud } = await crearSolicitud(env.DB, {
			titulo: null,
			autor: "Borges",
			telefono: "56912345678",
		});
		const libro = await sembrarLibro("El Aleph", "Jorge Luis Borges");

		await detectarCoincidencias(env.DB, libro.id);
		await detectarCoincidencias(env.DB, libro.id);

		expect(await coincidenciasDe(solicitud.id)).toBe(1);
	});

	it("devuelve cero sin lanzar si la detección falla", async () => {
		// Una base rota es lo más parecido a un fallo real que se puede provocar.
		const rota = { prepare: () => { throw new Error("base caída"); } } as unknown as D1Database;
		await expect(detectarCoincidencias(rota, "cualquiera")).resolves.toBe(0);
	});

	it("el alta del libro no depende de la detección", async () => {
		await crearSolicitud(env.DB, { titulo: null, autor: "Borges", telefono: "56912345678" });

		const respuesta = await comoAdmin("/api/admin/libros", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				titulo: "El Aleph",
				autor: "Jorge Luis Borges",
				condicion: "usado",
				precio: 8000,
			}),
		});

		expect(respuesta.status).toBe(201);
	});
});

describe("avisos del backoffice", () => {
	async function sembrarAvisoPendiente() {
		const { solicitud } = await crearSolicitud(env.DB, {
			titulo: null,
			autor: "Jorge Luis Borges",
			telefono: "56987654321",
		});
		const libro = await sembrarLibro("El Aleph", "Jorge Luis Borges");
		await detectarCoincidencias(env.DB, libro.id);
		return { solicitud, libro };
	}

	it("exige sesión", async () => {
		const respuesta = await SELF.fetch(`${BASE}/api/admin/alertas`);
		expect(respuesta.status).toBe(401);
	});

	it("muestra la solicitud con el libro que coincide", async () => {
		const { libro } = await sembrarAvisoPendiente();

		const respuesta = await comoAdmin("/api/admin/alertas");
		const { avisos } = (await respuesta.json()) as {
			avisos: (Aviso & { coincidencias: { aviso: string }[] })[];
		};

		expect(respuesta.status).toBe(200);
		expect(avisos).toHaveLength(1);
		expect(avisos[0].solicitud.autor).toBe("Jorge Luis Borges");
		expect(avisos[0].coincidencias).toHaveLength(1);
		expect(avisos[0].coincidencias[0]).toMatchObject({ libroId: libro.id, titulo: "El Aleph" });
	});

	it("arma el enlace de WhatsApp con el libro y su ficha", async () => {
		const { libro } = await sembrarAvisoPendiente();

		const { avisos } = (await (await comoAdmin("/api/admin/alertas")).json()) as {
			avisos: { coincidencias: { aviso: string }[] }[];
		};
		const url = new URL(avisos[0].coincidencias[0].aviso);
		const mensaje = decodeURIComponent(url.searchParams.get("text") ?? "");

		expect(url.pathname).toBe("/56987654321");
		expect(mensaje).toContain("El Aleph");
		expect(mensaje).toContain(`/libro/${libro.id}`);
		expect(mensaje).not.toContain("%0A");
	});

	it("solo trae las abiertas por omisión", async () => {
		const { solicitud } = await sembrarAvisoPendiente();
		await env.DB.prepare("UPDATE solicitudes SET estado = 'avisada' WHERE id = ?")
			.bind(solicitud.id)
			.run();

		const { avisos } = (await (await comoAdmin("/api/admin/alertas")).json()) as { avisos: Aviso[] };
		expect(avisos).toHaveLength(0);
	});

	it("permite pedir las ya avisadas", async () => {
		const { solicitud } = await sembrarAvisoPendiente();
		await env.DB.prepare("UPDATE solicitudes SET estado = 'avisada' WHERE id = ?")
			.bind(solicitud.id)
			.run();

		const { avisos } = (await (await comoAdmin("/api/admin/alertas?estado=avisada")).json()) as {
			avisos: Aviso[];
		};
		expect(avisos).toHaveLength(1);
	});

	it("marca una solicitud como avisada", async () => {
		const { solicitud } = await sembrarAvisoPendiente();

		const respuesta = await comoAdmin(`/api/admin/alertas/${solicitud.id}/estado`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ estado: "avisada" }),
		});
		const cuerpo = (await respuesta.json()) as { solicitud: Solicitud };

		expect(respuesta.status).toBe(200);
		expect(cuerpo.solicitud.estado).toBe("avisada");
	});

	it("una solicitud cerrada deja de generar coincidencias nuevas", async () => {
		const { solicitud } = await sembrarAvisoPendiente();
		await comoAdmin(`/api/admin/alertas/${solicitud.id}/estado`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ estado: "cerrada" }),
		});

		const otro = await sembrarLibro("Ficciones", "Jorge Luis Borges");
		expect(await detectarCoincidencias(env.DB, otro.id)).toBe(0);
	});

	it("responde 404 sobre una solicitud inexistente", async () => {
		const respuesta = await comoAdmin("/api/admin/alertas/no-existe/estado", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ estado: "cerrada" }),
		});
		expect(respuesta.status).toBe(404);
	});

	it("no muestra coincidencias de libros dados de baja", async () => {
		const { libro } = await sembrarAvisoPendiente();
		await env.DB.prepare("UPDATE libros SET dado_de_baja = 1 WHERE id = ?").bind(libro.id).run();

		const { avisos } = (await (await comoAdmin("/api/admin/alertas")).json()) as { avisos: Aviso[] };
		expect(avisos[0].coincidencias).toHaveLength(0);
	});
});

describe("mensajeDeAviso", () => {
	it("menciona lo que el cliente pidió y el libro que llegó", () => {
		const texto = mensajeDeAviso(
			{ titulo: null, autor: "Isabel Allende" },
			{ titulo: "La casa de los espíritus", autor: "Isabel Allende", id: "abc" },
			"https://fiestita.test",
		);

		expect(texto).toContain("Isabel Allende");
		expect(texto).toContain("La casa de los espíritus");
		expect(texto).toContain("https://fiestita.test/libro/abc");
		expect(texto).toContain("\n");
	});

	it("usa el título cuando el cliente lo dio", () => {
		const texto = mensajeDeAviso(
			{ titulo: "Rayuela", autor: null },
			{ titulo: "Rayuela", autor: "Julio Cortázar", id: "x" },
			"https://fiestita.test",
		);
		expect(texto).toContain("«Rayuela»");
	});
});
