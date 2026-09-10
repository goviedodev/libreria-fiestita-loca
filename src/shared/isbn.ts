/**
 * Validación y normalización de ISBN.
 *
 * El dígito verificador se comprueba antes de salir a la red (design.md §7): un
 * ISBN mal tecleado se detecta aquí y no gasta una consulta a las fuentes
 * bibliográficas ni obliga al dueño a esperar el timeout.
 */

/** Deja el ISBN como se guarda y se compara: sin guiones, espacios y con la X en mayúscula. */
export function normalizarIsbn(valor: string): string {
	return valor.replace(/[\s-]/g, "").toUpperCase();
}

function digitosValidos(isbn: string, largo: 10 | 13): boolean {
	// La X solo es legal como dígito verificador de un ISBN-10.
	const patron = largo === 10 ? /^\d{9}[\dX]$/ : /^\d{13}$/;
	return patron.test(isbn);
}

/** ISBN-10: la suma ponderada por 10..1 debe ser múltiplo de 11, con X valiendo 10. */
function isbn10EsValido(isbn: string): boolean {
	if (!digitosValidos(isbn, 10)) return false;

	let suma = 0;
	for (let i = 0; i < 10; i++) {
		const caracter = isbn[i];
		const digito = caracter === "X" ? 10 : Number(caracter);
		suma += digito * (10 - i);
	}
	return suma % 11 === 0;
}

/** ISBN-13: la suma con pesos alternos 1 y 3 debe ser múltiplo de 10. */
function isbn13EsValido(isbn: string): boolean {
	if (!digitosValidos(isbn, 13)) return false;

	let suma = 0;
	for (let i = 0; i < 13; i++) {
		suma += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
	}
	return suma % 10 === 0;
}

/** `true` si el valor es un ISBN-10 o ISBN-13 con dígito verificador correcto. */
export function esIsbnValido(valor: string): boolean {
	const isbn = normalizarIsbn(valor);
	if (isbn.length === 10) return isbn10EsValido(isbn);
	if (isbn.length === 13) return isbn13EsValido(isbn);
	return false;
}

/**
 * Normaliza y valida en un paso, devolviendo `null` cuando no es un ISBN.
 *
 * Quien llame decide si un ISBN inválido es un error o simplemente un campo que
 * se deja vacío, que es lo que pasa en el alta manual.
 */
export function isbnNormalizadoONulo(valor: string | null | undefined): string | null {
	if (!valor) return null;
	const isbn = normalizarIsbn(valor);
	return esIsbnValido(isbn) ? isbn : null;
}
