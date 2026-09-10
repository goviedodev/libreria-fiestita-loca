/**
 * Teléfonos chilenos.
 *
 * Se aceptan **celulares** y no fijos: el negocio entero se apoya en WhatsApp, y
 * un número fijo dejaría al dueño sin forma de contactar al cliente por el canal
 * que la spec define. El mensaje de error lo dice explícitamente para que nadie
 * se quede adivinando por qué se rechaza su número.
 *
 * Formato canónico: `56` + `9` + ocho dígitos, sin signos. Es lo que necesita la
 * URL de `wa.me`, así que se guarda ya normalizado y no hay que convertirlo dos
 * veces.
 */

export const MENSAJE_TELEFONO = "Necesitamos un celular chileno, como +56 9 1234 5678";

/** Deja solo los dígitos: el visitante escribe con `+`, espacios, guiones o paréntesis. */
function soloDigitos(valor: string): string {
	return valor.replace(/\D/g, "");
}

/**
 * Devuelve el número en formato canónico `569XXXXXXXX`, o `null` si no es un
 * celular chileno.
 *
 * Se admiten las formas en que la gente lo escribe de verdad: con y sin código de
 * país, con el `0` de larga distancia de antes, y con el `9` suelto.
 */
export function normalizarTelefono(valor: string): string | null {
	let digitos = soloDigitos(valor);

	// `0056 9…` — prefijo internacional escrito con ceros.
	if (digitos.startsWith("00")) {
		digitos = digitos.slice(2);
	}
	// `09 1234 5678` — el cero de larga distancia nacional, todavía en uso.
	if (digitos.length === 10 && digitos.startsWith("09")) {
		digitos = digitos.slice(1);
	}
	// `9 1234 5678` — lo más común al escribirlo sin pensar en el país.
	if (digitos.length === 9 && digitos.startsWith("9")) {
		digitos = `56${digitos}`;
	}

	return /^569\d{8}$/.test(digitos) ? digitos : null;
}

export function esTelefonoValido(valor: string): boolean {
	return normalizarTelefono(valor) !== null;
}

/** `+56 9 1234 5678`, para mostrar en el backoffice. */
export function formatearTelefono(canonico: string): string {
	const coincidencia = canonico.match(/^56(9)(\d{4})(\d{4})$/);
	if (!coincidencia) return canonico;
	const [, nueve, medio, fin] = coincidencia;
	return `+56 ${nueve} ${medio} ${fin}`;
}

/**
 * Los últimos cuatro dígitos, para la consulta pública por folio.
 *
 * La spec pide ocultar el teléfono salvo sus últimos dígitos: quien consulta un
 * folio ajeno no puede sacar de ahí el número de otra persona, pero el dueño del
 * folio reconoce el suyo.
 */
export function telefonoEnmascarado(canonico: string): string {
	return `••• ${canonico.slice(-4)}`;
}
