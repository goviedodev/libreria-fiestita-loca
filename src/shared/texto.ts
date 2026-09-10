/**
 * Normaliza un texto para búsqueda y comparación: sin tildes, sin espacios
 * sobrantes y en minúsculas.
 *
 * SQLite en D1 no trae `unaccent` ni una collation insensible a diacríticos, así
 * que la normalización se hace aquí al escribir y al consultar (design.md §6).
 */
export function normalizarTexto(valor: string): string {
	return valor
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim()
		.replace(/\s+/g, " ");
}

/** Formatea un entero de pesos chilenos como `$8.500`. */
export function formatearPrecio(pesos: number): string {
	return new Intl.NumberFormat("es-CL", {
		style: "currency",
		currency: "CLP",
		maximumFractionDigits: 0,
	}).format(pesos);
}
