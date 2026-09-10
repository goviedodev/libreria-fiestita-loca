import { z } from "zod";
import { ESTADOS_RESERVA } from "./reserva";
import { MENSAJE_TELEFONO, normalizarTelefono } from "./telefono";

/**
 * Esquemas de validación de una reserva.
 *
 * Separados de los tipos por la misma razón que en `libro-esquemas.ts`: importar
 * este archivo arrastra zod, y el cliente solo necesita los tipos y las
 * constantes de `reserva.ts`.
 */

export const esquemaCrearReserva = z.object({
	nombre: z.string().trim().min(2, "Necesitamos tu nombre").max(120),
	// El teléfono se valida y se normaliza en el mismo paso: lo que llega a la base
	// ya está en el formato canónico que necesita el enlace de WhatsApp.
	telefono: z
		.string()
		.trim()
		.min(1, "Necesitamos tu teléfono")
		.transform((valor, ctx) => {
			const canonico = normalizarTelefono(valor);
			if (!canonico) {
				ctx.addIssue({ code: "custom", message: MENSAJE_TELEFONO });
				return z.NEVER;
			}
			return canonico;
		}),
	nota: z.string().trim().max(500).nullish().transform((v) => (v ? v : null)),
	libroIds: z
		.array(z.string().min(1))
		.min(1, "Elige al menos un libro")
		.max(30, "Son demasiados libros para una sola reserva"),
});

export const esquemaCambioEstado = z.object({
	estado: z.enum(ESTADOS_RESERVA),
});

export type CrearReserva = z.infer<typeof esquemaCrearReserva>;
