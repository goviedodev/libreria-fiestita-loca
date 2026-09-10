import { ErrorDominio } from "../datos/comun";

/**
 * Folio de reserva: `FL-XXXXX`.
 *
 * El alfabeto excluye `0`/`O` y `1`/`I` porque el folio se dicta por teléfono y
 * se lee de una pantalla: confundir un cero con una O convierte una reserva
 * legítima en un "no encontramos esa reserva" (design.md §12).
 *
 * Son 32^5 ≈ 33 millones de combinaciones. La unicidad la garantiza el `UNIQUE`
 * de la columna, no la probabilidad: ante colisión se reintenta.
 */
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LARGO = 5;
const INTENTOS_MAXIMOS = 3;

export const PATRON_FOLIO = /^FL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

export function generarFolio(): string {
	// `crypto.getRandomValues` y no `Math.random`: el folio identifica una reserva
	// y no debe ser adivinable a partir de otro.
	const bytes = crypto.getRandomValues(new Uint8Array(LARGO));
	let folio = "";
	for (const byte of bytes) {
		folio += ALFABETO[byte % ALFABETO.length];
	}
	return `FL-${folio}`;
}

/** Normaliza lo que el cliente escribe: minúsculas, sin espacios y con el prefijo. */
export function normalizarFolio(valor: string): string {
	const limpio = valor.trim().toUpperCase().replace(/\s|-/g, "");
	const sinPrefijo = limpio.startsWith("FL") ? limpio.slice(2) : limpio;
	return `FL-${sinPrefijo}`;
}

/** `true` si el error viene del `UNIQUE` sobre `reservas.folio`. */
function esColisionDeFolio(causa: unknown): boolean {
	return causa instanceof Error && /UNIQUE constraint failed: reservas\.folio/i.test(causa.message);
}

/**
 * Ejecuta una operación con un folio nuevo, reintentando si el folio ya existía.
 *
 * El reintento se limita a la colisión: cualquier otro fallo —un libro que dejó
 * de estar disponible, por ejemplo— sube tal cual, porque reintentarlo daría el
 * mismo resultado y solo retrasaría el aviso al cliente.
 */
export async function conFolioUnico<T>(operacion: (folio: string) => Promise<T>): Promise<T> {
	let ultimaCausa: unknown;

	for (let intento = 0; intento < INTENTOS_MAXIMOS; intento++) {
		const folio = generarFolio();
		try {
			return await operacion(folio);
		} catch (causa) {
			if (!esColisionDeFolio(causa)) throw causa;
			ultimaCausa = causa;
		}
	}

	console.error("No se pudo generar un folio único en 3 intentos:", ultimaCausa);
	throw new ErrorDominio("No pudimos generar tu reserva. Inténtalo de nuevo.", 409);
}
