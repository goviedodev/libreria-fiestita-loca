import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Las migraciones se leen en Node y viajan como binding de prueba, para que cada
// worker de test las aplique sobre su propia D1 efímera.
const migraciones = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

/**
 * Dos proyectos, porque el código corre en dos runtimes distintos:
 *
 * - `worker`: pruebas dentro de workerd, con una D1 real y efímera.
 * - `cliente`: módulos del navegador (almacenamiento, portapapeles, canvas) que
 *   necesitan un DOM y que workerd no puede ejecutar.
 */
export default defineConfig({
	test: {
		projects: [
			{
				plugins: [
					cloudflareTest({
						wrangler: { configPath: "./wrangler.json" },
						miniflare: {
							bindings: {
								MIGRACIONES: migraciones,
								ADMIN_TOKEN: "token-de-prueba",
								SESSION_SECRET: "secreto-de-prueba",
								WHATSAPP_NUMERO: "56911112222",
							},
						},
					}),
				],
				test: {
					name: "worker",
					include: ["test/*.test.ts"],
					setupFiles: ["./test/setup.ts"],
				},
			},
			{
				test: {
					name: "cliente",
					include: ["test/cliente/*.test.ts"],
					environment: "happy-dom",
					// Las pruebas de la selección reimportan el módulo con
					// `vi.resetModules()`, y bajo la instrumentación de istanbul ese
					// primer import dinámico puede pasar de 5 s. Sin esto la suite
					// falla solo al medir cobertura, que es el peor tipo de intermitencia.
					testTimeout: 20_000,
				},
			},
		],
		coverage: {
			// `istanbul` y no `v8`: el proveedor v8 necesita `node:inspector`, que no
			// existe en workerd. Istanbul instrumenta al transformar, así que funciona
			// dentro del runtime de Workers.
			provider: "istanbul",
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/react-app/main.tsx",
				"src/**/*.d.ts",
				// Las vistas se verifican en el navegador contra el Worker local, no con
				// pruebas de unidad: contarlas aquí diluiría la señal de la lógica que sí
				// se prueba.
				"src/react-app/**/*.tsx",
				// Envoltorios de una línea sobre `obtener`/`enviar`: una prueba de estos
				// verificaría el simulacro, no el código.
				"src/react-app/**/api.ts",
			],
			reporter: ["text", "html"],
			thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
		},
	},
});
