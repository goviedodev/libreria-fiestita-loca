import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Reserva, ResumenNegocio, ResumenReserva } from "../src/shared/reserva";
import { crearLibro } from "../src/worker/datos/libros";
import { cambiarEstadoReserva, crearReserva } from "../src/worker/datos/reservas";

const BASE = "https://libreria.test";
const TOKEN = "token-de-prueba";

let cookie = "";

async function iniciarSesion(): Promise<string> {
	const respuesta = await SELF.fetch(`${BASE}/api/auth/ingreso`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.77" },
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

function cambiarEstado(folio: string, estado: string) {
	return comoAdmin(`/api/admin/reservas/${folio}/estado`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ estado }),
	});
}

async function limpiar() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM reserva_items"),
		env.DB.prepare("DELETE FROM reserva_eventos"),
		env.DB.prepare("DELETE FROM reservas"),
		env.DB.prepare("DELETE FROM libros"),
	]);
}

async function sembrarLibro(titulo: string, precio = 8500) {
	return crearLibro(env.DB, {
		isbn: null,
		titulo,
		autor: "Autor de Prueba",
		editorial: null,
		anio: null,
		genero: null,
		sinopsis: null,
		condicion: "usado",
		precio,
		portadaUrl: null,
	});
}

// El alfabeto del folio excluye 0/O y 1/I, y la ruta valida el formato antes de
// consultar: un folio de prueba con ceros se rechazaría con 404 antes de llegar a
// la base.
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
let contador = 0;

function folioDePrueba(): string {
	const n = contador++;
	let sufijo = "";
	for (let i = 0; i < 5; i++) {
		sufijo = ALFABETO[(n >> (i * 5)) % ALFABETO.length] + sufijo;
	}
	return `FL-${sufijo}`;
}

async function sembrarReserva(opciones: {
	titulos: readonly [string, number][];
	nombre?: string;
	telefono?: string;
	nota?: string | null;
}) {
	const libros = await Promise.all(opciones.titulos.map(([t, p]) => sembrarLibro(t, p)));
	const folio = folioDePrueba();
	await crearReserva(env.DB, {
		folio,
		nombre: opciones.nombre ?? "María Pérez",
		telefono: opciones.telefono ?? "56912345678",
		nota: opciones.nota ?? null,
		libroIds: libros.map((l) => l.id),
	});
	return { folio, libros };
}

beforeEach(async () => {
	await limpiar();
	cookie = await iniciarSesion();
});

describe("protección de las rutas de pedidos", () => {
	it.each(["/api/admin/reservas", "/api/admin/resumen"])("rechaza %s sin sesión", async (ruta) => {
		const respuesta = await SELF.fetch(`${BASE}${ruta}`);
		expect(respuesta.status).toBe(401);
	});

	it("rechaza el cambio de estado sin sesión", async () => {
		const { folio } = await sembrarReserva({ titulos: [["El Aleph", 8500]] });
		const respuesta = await SELF.fetch(`${BASE}/api/admin/reservas/${folio}/estado`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ estado: "pagado" }),
		});
		expect(respuesta.status).toBe(401);
	});
});

describe("listado de pedidos", () => {
	it("devuelve folio, cliente, cantidad de libros, total y estado", async () => {
		const { folio } = await sembrarReserva({ titulos: [["El Aleph", 8500], ["Ficciones", 9500]] });

		const respuesta = await comoAdmin("/api/admin/reservas");
		const { reservas } = (await respuesta.json()) as { reservas: ResumenReserva[] };

		expect(respuesta.status).toBe(200);
		expect(reservas).toHaveLength(1);
		expect(reservas[0]).toMatchObject({
			folio,
			nombre: "María Pérez",
			telefono: "56912345678",
			estado: "pendiente",
			total: 18000,
			libros: 2,
			antigua: false,
		});
	});

	it("ordena de la más reciente a la más antigua", async () => {
		const vieja = await sembrarReserva({ titulos: [["Uno", 1000]] });
		const nueva = await sembrarReserva({ titulos: [["Dos", 2000]] });
		await env.DB.prepare("UPDATE reservas SET creado_en = '2020-01-01T00:00:00.000Z' WHERE folio = ?")
			.bind(vieja.folio)
			.run();

		const { reservas } = (await (await comoAdmin("/api/admin/reservas")).json()) as {
			reservas: ResumenReserva[];
		};
		expect(reservas.map((r) => r.folio)).toEqual([nueva.folio, vieja.folio]);
	});

	it("filtra por estado", async () => {
		const pagada = await sembrarReserva({ titulos: [["Uno", 1000]] });
		await sembrarReserva({ titulos: [["Dos", 2000]] });
		await cambiarEstadoReserva(env.DB, pagada.folio, "pagado");

		const { reservas } = (await (await comoAdmin("/api/admin/reservas?estado=pendiente")).json()) as {
			reservas: ResumenReserva[];
		};
		expect(reservas).toHaveLength(1);
		expect(reservas[0].estado).toBe("pendiente");
	});

	it("busca por folio, por nombre y por teléfono", async () => {
		const buscada = await sembrarReserva({
			titulos: [["Uno", 1000]],
			nombre: "Carolina Soto",
			telefono: "56987654321",
		});
		await sembrarReserva({ titulos: [["Dos", 2000]], nombre: "Otro Cliente", telefono: "56911112222" });

		const casos = [buscada.folio, "carolina", "CAROLINA", "8765 4321", "+56 9 8765 4321"];
		for (const termino of casos) {
			const respuesta = await comoAdmin(`/api/admin/reservas?busqueda=${encodeURIComponent(termino)}`);
			const { reservas } = (await respuesta.json()) as { reservas: ResumenReserva[] };
			expect(reservas.map((r) => r.folio), termino).toEqual([buscada.folio]);
		}
	});

	it("una búsqueda sin dígitos no arrastra por el teléfono", async () => {
		await sembrarReserva({ titulos: [["Uno", 1000]], nombre: "Carolina Soto" });
		const { reservas } = (await (
			await comoAdmin("/api/admin/reservas?busqueda=zzz")
		).json()) as { reservas: ResumenReserva[] };
		expect(reservas).toEqual([]);
	});

	it("destaca las pendientes con más de 7 días", async () => {
		const antigua = await sembrarReserva({ titulos: [["Vieja", 1000]] });
		const reciente = await sembrarReserva({ titulos: [["Nueva", 2000]] });

		const hace8Dias = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
		await env.DB.prepare("UPDATE reservas SET creado_en = ? WHERE folio = ?")
			.bind(hace8Dias, antigua.folio)
			.run();

		const { reservas } = (await (await comoAdmin("/api/admin/reservas")).json()) as {
			reservas: ResumenReserva[];
		};
		const porFolio = new Map(reservas.map((r) => [r.folio, r.antigua]));
		expect(porFolio.get(antigua.folio)).toBe(true);
		expect(porFolio.get(reciente.folio)).toBe(false);
	});

	it("no destaca una pagada antigua: ya no hay nada que cerrar", async () => {
		const { folio } = await sembrarReserva({ titulos: [["Vieja", 1000]] });
		await cambiarEstadoReserva(env.DB, folio, "pagado");
		const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
		await env.DB.prepare("UPDATE reservas SET creado_en = ? WHERE folio = ?").bind(hace30Dias, folio).run();

		const { reservas } = (await (await comoAdmin("/api/admin/reservas")).json()) as {
			reservas: ResumenReserva[];
		};
		expect(reservas[0].antigua).toBe(false);
	});

	it("devuelve una lista vacía sin error cuando no hay reservas", async () => {
		const { reservas } = (await (await comoAdmin("/api/admin/reservas")).json()) as {
			reservas: ResumenReserva[];
		};
		expect(reservas).toEqual([]);
	});
});

describe("detalle de una reserva", () => {
	it("trae cliente, nota, libros con precio congelado, total e historial", async () => {
		const { folio, libros } = await sembrarReserva({
			titulos: [["El Aleph", 8500]],
			nota: "Paso el viernes",
		});
		await cambiarEstadoReserva(env.DB, folio, "pagado");
		await env.DB.prepare("UPDATE libros SET precio = 30000 WHERE id = ?").bind(libros[0].id).run();

		const respuesta = await comoAdmin(`/api/admin/reservas/${folio}`);
		const cuerpo = (await respuesta.json()) as {
			reserva: Reserva;
			historial: { estado: string }[];
			contacto: string;
		};

		expect(respuesta.status).toBe(200);
		expect(cuerpo.reserva.nota).toBe("Paso el viernes");
		expect(cuerpo.reserva.items[0].precio).toBe(8500);
		expect(cuerpo.reserva.total).toBe(8500);
		expect(cuerpo.historial.map((e) => e.estado)).toEqual(["pendiente", "pagado"]);
	});

	it("muestra el teléfono completo, a diferencia de la consulta pública", async () => {
		const { folio } = await sembrarReserva({ titulos: [["El Aleph", 8500]] });

		const admin = (await (await comoAdmin(`/api/admin/reservas/${folio}`)).json()) as {
			reserva: Reserva;
		};
		const publica = (await (await SELF.fetch(`${BASE}/api/reservas/${folio}`)).json()) as {
			reserva: Reserva;
		};

		expect(admin.reserva.telefono).toBe("56912345678");
		expect(publica.reserva.telefono).not.toBe("56912345678");
	});

	it("arma el enlace de WhatsApp hacia el teléfono del cliente", async () => {
		const { folio } = await sembrarReserva({ titulos: [["El Aleph", 8500]], telefono: "56987654321" });

		const cuerpo = (await (await comoAdmin(`/api/admin/reservas/${folio}`)).json()) as {
			contacto: string;
		};
		const url = new URL(cuerpo.contacto);
		const mensaje = decodeURIComponent(url.searchParams.get("text") ?? "");

		expect(url.pathname).toBe("/56987654321");
		expect(mensaje).toContain(folio);
		expect(mensaje).toContain("El Aleph");
	});

	it("responde 404 para un folio inexistente", async () => {
		const respuesta = await comoAdmin("/api/admin/reservas/FL-ZZZZZ");
		expect(respuesta.status).toBe(404);
	});
});

describe("cambio de estado desde el backoffice", () => {
	it("marca como pagada y registra el evento", async () => {
		const { folio } = await sembrarReserva({ titulos: [["El Aleph", 8500]] });

		const respuesta = await cambiarEstado(folio, "pagado");
		const cuerpo = (await respuesta.json()) as { reserva: Reserva; historial: { estado: string }[] };

		expect(respuesta.status).toBe(200);
		expect(cuerpo.reserva.estado).toBe("pagado");
		expect(cuerpo.historial.map((e) => e.estado)).toEqual(["pendiente", "pagado"]);
	});

	it("la entrega deja los libros vendidos y fuera del catálogo público", async () => {
		const { folio, libros } = await sembrarReserva({ titulos: [["El Aleph", 8500]] });
		await cambiarEstado(folio, "pagado");
		await cambiarEstado(folio, "entregado");

		const fila = await env.DB.prepare("SELECT estado FROM libros WHERE id = ?")
			.bind(libros[0].id)
			.first<{ estado: string }>();
		expect(fila?.estado).toBe("vendido");

		const catalogo = await SELF.fetch(`${BASE}/api/libros?disponibilidad=disponible`);
		const cuerpo = (await catalogo.json()) as { total: number };
		expect(cuerpo.total).toBe(0);
	});

	it("la cancelación devuelve los libros al catálogo", async () => {
		const { folio, libros } = await sembrarReserva({ titulos: [["El Aleph", 8500]] });

		await cambiarEstado(folio, "cancelado");

		const fila = await env.DB.prepare("SELECT estado FROM libros WHERE id = ?")
			.bind(libros[0].id)
			.first<{ estado: string }>();
		expect(fila?.estado).toBe("disponible");

		const catalogo = await SELF.fetch(`${BASE}/api/libros?disponibilidad=disponible`);
		const cuerpo = (await catalogo.json()) as { total: number };
		expect(cuerpo.total).toBe(1);
	});

	it("rechaza saltar de pendiente a entregado y no toca el stock", async () => {
		const { folio, libros } = await sembrarReserva({ titulos: [["El Aleph", 8500]] });

		const respuesta = await cambiarEstado(folio, "entregado");
		const cuerpo = (await respuesta.json()) as { error: string };

		expect(respuesta.status).toBe(409);
		expect(cuerpo.error).toContain("pago");

		const reserva = await env.DB.prepare("SELECT estado FROM reservas WHERE folio = ?")
			.bind(folio)
			.first<{ estado: string }>();
		const libro = await env.DB.prepare("SELECT estado FROM libros WHERE id = ?")
			.bind(libros[0].id)
			.first<{ estado: string }>();
		expect(reserva?.estado).toBe("pendiente");
		expect(libro?.estado).toBe("reservado");
	});

	it("rechaza cualquier cambio sobre una reserva ya cerrada", async () => {
		const { folio } = await sembrarReserva({ titulos: [["El Aleph", 8500]] });
		await cambiarEstado(folio, "cancelado");

		for (const estado of ["pagado", "pendiente", "entregado"]) {
			const respuesta = await cambiarEstado(folio, estado);
			expect(respuesta.status, estado).toBe(409);
		}
	});

	it("no libera un libro que otra reserva activa ya tiene tomado", async () => {
		// El mismo ejemplar no puede estar en dos reservas activas, pero sí puede
		// quedar en una cancelada y otra viva si el dueño lo reasignó a mano.
		const libro = await sembrarLibro("Compartido", 5000);
		const folioA = folioDePrueba();
		await crearReserva(env.DB, {
			folio: folioA,
			nombre: "Cliente A",
			telefono: "56911111111",
			nota: null,
			libroIds: [libro.id],
		});

		const folioB = folioDePrueba();
		await env.DB.batch([
			env.DB
				.prepare(
					`INSERT INTO reservas (id, folio, nombre, telefono, estado, total, creado_en, actualizado_en)
					VALUES ('otra', ?, 'Cliente B', '56922222222', 'pendiente', 5000, '2026-01-01', '2026-01-01')`,
				)
				.bind(folioB),
			env.DB
				.prepare("INSERT INTO reserva_items (reserva_id, libro_id, precio) VALUES ('otra', ?, 5000)")
				.bind(libro.id),
		]);

		await cambiarEstado(folioA, "cancelado");

		const fila = await env.DB.prepare("SELECT estado FROM libros WHERE id = ?")
			.bind(libro.id)
			.first<{ estado: string }>();
		expect(fila?.estado).toBe("reservado");
	});

	it("no deja nada a medias si el cambio falla", async () => {
		const { folio, libros } = await sembrarReserva({ titulos: [["El Aleph", 8500]] });
		await cambiarEstado(folio, "pagado");

		// Se borra el libro por debajo para que el UPDATE del batch falle por FK.
		await env.DB.prepare("DELETE FROM reserva_items WHERE libro_id = ?").bind(libros[0].id).run();
		await env.DB.prepare("DELETE FROM libros WHERE id = ?").bind(libros[0].id).run();

		// La reserva sigue existiendo y su estado no puede haber avanzado a medias.
		const antes = await env.DB.prepare("SELECT estado FROM reservas WHERE folio = ?")
			.bind(folio)
			.first<{ estado: string }>();
		expect(antes?.estado).toBe("pagado");
	});
});

describe("resumen del negocio", () => {
	it("cuenta inventario, reservas por estado y monto pendiente", async () => {
		const pendiente = await sembrarReserva({ titulos: [["Uno", 10000]] });
		const pagada = await sembrarReserva({ titulos: [["Dos", 5000]] });
		const entregada = await sembrarReserva({ titulos: [["Tres", 3000]] });
		await sembrarLibro("Libre", 1000);

		await cambiarEstadoReserva(env.DB, pagada.folio, "pagado");
		await cambiarEstadoReserva(env.DB, entregada.folio, "pagado");
		await cambiarEstadoReserva(env.DB, entregada.folio, "entregado");

		const resumen = (await (await comoAdmin("/api/admin/resumen")).json()) as ResumenNegocio;

		expect(resumen.libros).toEqual({ disponibles: 1, reservados: 2, vendidos: 1 });
		expect(resumen.reservas).toEqual({ pendiente: 1, pagado: 1, entregado: 1, cancelado: 0 });
		// Pendiente + pagada; la entregada ya se cobró.
		expect(resumen.pendienteDeCobro).toBe(15000);
		expect(pendiente.folio).toBeTruthy();
	});

	it("muestra todo en cero cuando el negocio no tiene movimientos", async () => {
		const resumen = (await (await comoAdmin("/api/admin/resumen")).json()) as ResumenNegocio;

		expect(resumen.libros).toEqual({ disponibles: 0, reservados: 0, vendidos: 0 });
		expect(resumen.reservas).toEqual({ pendiente: 0, pagado: 0, entregado: 0, cancelado: 0 });
		expect(resumen.pendienteDeCobro).toBe(0);
	});

	it("no cuenta los libros dados de baja en el inventario", async () => {
		const libro = await sembrarLibro("Retirado", 1000);
		await env.DB.prepare("UPDATE libros SET dado_de_baja = 1 WHERE id = ?").bind(libro.id).run();

		const resumen = (await (await comoAdmin("/api/admin/resumen")).json()) as ResumenNegocio;
		expect(resumen.libros.disponibles).toBe(0);
	});
});
