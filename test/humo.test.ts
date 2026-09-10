import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("entorno de pruebas", () => {
	it("expone la D1 con las migraciones aplicadas", async () => {
		const { results } = await env.DB.prepare("SELECT 1 AS uno").all();
		expect(results).toEqual([{ uno: 1 }]);
	});

	it("expone los secrets de prueba", () => {
		expect(env.ADMIN_TOKEN).toBe("token-de-prueba");
	});
});
