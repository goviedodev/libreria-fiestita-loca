import { afterEach, describe, expect, it, vi } from "vitest";
import { consulta, enviar, enviarArchivo, ErrorRespuesta, obtener } from "../../src/react-app/lib/api";

function respuesta(cuerpo: unknown, estado = 200): Response {
	return new Response(estado === 204 ? null : JSON.stringify(cuerpo), {
		status: estado,
		headers: { "Content-Type": "application/json" },
	});
}

function simular(devolver: (url: string, init?: RequestInit) => Response) {
	const espia = vi.fn((entrada: RequestInfo | URL, init?: RequestInit) =>
		Promise.resolve(devolver(String(entrada), init)),
	);
	vi.stubGlobal("fetch", espia);
	return espia;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("obtener", () => {
	it("devuelve el cuerpo ya parseado", async () => {
		simular(() => respuesta({ hola: "mundo" }));
		await expect(obtener("/api/algo")).resolves.toEqual({ hola: "mundo" });
	});

	it("pasa la señal de aborto al fetch", async () => {
		const espia = simular(() => respuesta({}));
		const control = new AbortController();
		await obtener("/api/algo", control.signal);
		expect(espia.mock.calls[0][1]).toMatchObject({ signal: control.signal });
	});
});

describe("manejo de errores", () => {
	it("lanza ErrorRespuesta con el estado y el mensaje del servidor", async () => {
		simular(() => respuesta({ error: "No encontramos ese libro" }, 404));

		await expect(obtener("/api/libros/x")).rejects.toMatchObject({
			name: "ErrorRespuesta",
			estado: 404,
			message: "No encontramos ese libro",
		});
	});

	it("conserva los errores por campo del formulario", async () => {
		simular(() => respuesta({ error: "Revisa los datos", campos: { precio: "Debe ser mayor que cero" } }, 422));

		try {
			await enviar("/api/admin/libros", {});
			expect.unreachable("debió lanzar");
		} catch (causa) {
			expect(causa).toBeInstanceOf(ErrorRespuesta);
			expect((causa as ErrorRespuesta).campos).toEqual({ precio: "Debe ser mayor que cero" });
		}
	});

	it("da un mensaje genérico si el error no trae JSON", async () => {
		vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("<html>502</html>", { status: 502 }))));

		await expect(obtener("/api/algo")).rejects.toMatchObject({
			estado: 502,
			message: "No pudimos completar la operación",
		});
	});
});

describe("enviar", () => {
	it("manda JSON con su Content-Type", async () => {
		const espia = simular(() => respuesta({ ok: true }, 201));
		await enviar("/api/reservas", { nombre: "María" });

		const [url, init] = espia.mock.calls[0];
		expect(url).toBe("/api/reservas");
		expect(init).toMatchObject({ method: "POST" });
		expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
		expect(init?.body).toBe(JSON.stringify({ nombre: "María" }));
	});

	it("acepta otro método", async () => {
		const espia = simular(() => respuesta({}));
		await enviar("/api/admin/libros/1", { precio: 100 }, "PATCH");
		expect(espia.mock.calls[0][1]).toMatchObject({ method: "PATCH" });
	});

	it("resuelve con undefined ante un 204 sin cuerpo", async () => {
		simular(() => respuesta(null, 204));
		await expect(enviar("/api/algo", {}, "DELETE")).resolves.toBeUndefined();
	});
});

describe("enviarArchivo", () => {
	it("no fija Content-Type: lo pone el navegador con su boundary", async () => {
		const espia = simular(() => respuesta({ ok: true }));
		const formulario = new FormData();
		formulario.append("foto", new Blob(["x"]), "f.jpg");

		await enviarArchivo("/api/admin/libros/1/foto", formulario);

		const init = espia.mock.calls[0][1];
		expect(init?.headers).toBeUndefined();
		expect(init?.body).toBe(formulario);
	});
});

describe("consulta", () => {
	it("arma la query string omitiendo lo vacío", () => {
		expect(consulta({ q: "borges", genero: "", pagina: undefined, orden: "precio-asc" })).toBe(
			"?q=borges&orden=precio-asc",
		);
	});

	it("devuelve cadena vacía cuando no hay nada que mandar", () => {
		expect(consulta({})).toBe("");
		expect(consulta({ q: "", pagina: undefined })).toBe("");
	});

	it("codifica los valores con caracteres especiales", () => {
		expect(consulta({ q: "cien años & más" })).toContain("cien+a%C3%B1os");
	});

	it("acepta números", () => {
		expect(consulta({ pagina: 3 })).toBe("?pagina=3");
	});
});
