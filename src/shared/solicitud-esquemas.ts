import { z } from "zod";
import { ESTADOS_SOLICITUD } from "./solicitud";
import { MENSAJE_TELEFONO, normalizarTelefono } from "./telefono";

/**
 * Esquemas de validación de una solicitud.
 *
 * Separados de los tipos por la misma razón que en `libro-esquemas.ts` y
 * `reserva-esquemas.ts`: el catálogo público monta el formulario de aviso y no
 * tiene por qué cargar zod para eso.
 */

const opcional = z
	.string()
	.trim()
	.max(300)
	.nullish()
	.transform((valor) => (valor ? valor : null));

export const esquemaCrearSolicitud = z
	.object({
		titulo: opcional,
		autor: opcional,
		// Mismo tratamiento que en la reserva: se valida y se normaliza a la vez, así
		// el teléfono guardado sirve directo para el enlace de WhatsApp del aviso.
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
	})
	.refine((datos) => datos.titulo !== null || datos.autor !== null, {
		error: "Indica al menos el título o el autor del libro que buscas",
		path: ["titulo"],
	});

export type CrearSolicitud = z.infer<typeof esquemaCrearSolicitud>;

export const esquemaCambioEstadoSolicitud = z.object({
	estado: z.enum(ESTADOS_SOLICITUD),
});
