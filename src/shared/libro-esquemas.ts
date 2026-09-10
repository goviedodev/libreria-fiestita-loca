import { z } from "zod";
import { CONDICIONES } from "./libro";

/**
 * Esquemas de validación de un libro.
 *
 * Viven aparte de los tipos a propósito: importar este archivo arrastra zod, y el
 * catálogo público —que solo necesita las constantes y los tipos de `libro.ts`—
 * no tiene por qué pagar esa librería en el bundle del visitante.
 */

const textoObligatorio = (campo: string) =>
	z
		.string()
		.trim()
		.min(1, `El ${campo} es obligatorio`)
		.max(300, `El ${campo} no puede superar los 300 caracteres`);

const textoOpcional = z
	.string()
	.trim()
	.max(4000)
	.nullish()
	.transform((valor) => (valor ? valor : null));

/** Precio en pesos chilenos: entero y mayor que cero. */
export const esquemaPrecio = z
	.number({ error: "El precio debe ser un número" })
	.int("El precio debe ser un número entero de pesos")
	.positive("El precio debe ser mayor que cero");

export const esquemaAltaLibro = z.object({
	isbn: z.string().trim().nullish().transform((valor) => (valor ? valor : null)),
	titulo: textoObligatorio("título"),
	autor: textoObligatorio("autor"),
	editorial: textoOpcional,
	anio: z.number().int().min(1400).max(2200).nullish().transform((v) => v ?? null),
	genero: z.string().trim().max(120).nullish().transform((v) => (v ? v : null)),
	sinopsis: textoOpcional,
	condicion: z.enum(CONDICIONES, { error: "La condición debe ser nuevo o usado" }),
	precio: esquemaPrecio,
	// URL de portada que devolvió la fuente bibliográfica. El Worker la descarga a
	// R2; nunca se guarda la URL externa (design.md §9).
	portadaUrl: z.url().nullish().transform((v) => (v ? v : null)),
});

/** Toda edición es parcial, pero al menos un campo debe venir. */
export const esquemaEdicionLibro = esquemaAltaLibro
	.partial()
	.refine((datos) => Object.keys(datos).length > 0, {
		error: "No hay ningún campo que modificar",
	});

export type AltaLibro = z.infer<typeof esquemaAltaLibro>;
export type EdicionLibro = z.infer<typeof esquemaEdicionLibro>;
