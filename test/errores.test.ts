import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ErrorDominio } from "../src/worker/datos/comun";
import { leerJson, manejarErrores } from "../src/worker/middleware/errores";

const esquema = z.object({
	titulo: z.string().min(1, "El título es obligatorio"),
	precio: z.number().int("El precio debe ser un número entero de pesos").positive(),
});

function appDePrueba() {
	const app = new Hono();
	app.onError(manejarErrores);
	app.post("/validado", async (c) => c.json(await leerJson(c, esquema)));
	app.get("/dominio", () => {
		throw new ErrorDominio("No encontramos ese libro", 404);
	});
	app.get("/conflicto", () => {
		throw new ErrorDominio("El libro está en la reserva FL-ABC12", 409);
	});
	app.get("/roto", () => {
		throw new Error("detalle interno con datos sensibles");
	});
	return app;
}

describe("manejarErrores", () => {
	it("traduce un fallo de validación a 422 con el mapa de campos", async () => {
		const respuesta = await appDePrueba().request("/validado", {
			method: "POST",
			body: JSON.stringify({ titulo: "", precio: 1500.5 }),
		});
		expect(respuesta.status).toBe(422);
		const cuerpo = await respuesta.json<{ error: string; campos: Record<string, string> }>();
		expect(cuerpo.campos.titulo).toBe("El título es obligatorio");
		expect(cuerpo.campos.precio).toContain("entero");
	});

	it("rechaza un cuerpo que no es JSON", async () => {
		const respuesta = await appDePrueba().request("/validado", { method: "POST", body: "no soy json" });
		expect(respuesta.status).toBe(400);
		expect((await respuesta.json<{ error: string }>()).error).toContain("JSON válido");
	});

	it("respeta el estado de un error de dominio", async () => {
		const respuesta = await appDePrueba().request("/dominio");
		expect(respuesta.status).toBe(404);
		expect((await respuesta.json<{ error: string }>()).error).toBe("No encontramos ese libro");
	});

	it("devuelve 409 en un conflicto de reserva", async () => {
		const respuesta = await appDePrueba().request("/conflicto");
		expect(respuesta.status).toBe(409);
	});

	it("no filtra el detalle de un error inesperado", async () => {
		const respuesta = await appDePrueba().request("/roto");
		expect(respuesta.status).toBe(500);
		const cuerpo = await respuesta.text();
		expect(cuerpo).not.toContain("datos sensibles");
		expect(cuerpo).toContain("Algo salió mal");
	});

	it("omite el mapa de campos cuando no lo hay", async () => {
		const respuesta = await appDePrueba().request("/dominio");
		expect(Object.keys(await respuesta.json<object>())).toEqual(["error"]);
	});
});
