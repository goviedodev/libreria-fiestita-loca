/**
 * Sesión del backoffice: cookie firmada con HMAC, sin tabla de sesiones.
 *
 * Con un único administrador, revocar es rotar `SESSION_SECRET` con
 * `wrangler secret put`, lo que invalida todo al instante. A cambio, verificar una
 * sesión no cuesta una lectura a D1 en cada petición (design.md §10).
 */

const NOMBRE_COOKIE = "fl_sesion";
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

const codificador = new TextEncoder();

async function digest(valor: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest("SHA-256", codificador.encode(valor));
}

/**
 * Compara dos secretos sin filtrar por tiempo dónde difieren.
 *
 * Se comparan los digest SHA-256 y no las cadenas: así el recorrido siempre es de
 * 32 bytes, sea cual sea el largo de lo que envió quien intenta entrar.
 */
export async function coincideEnTiempoConstante(a: string, b: string): Promise<boolean> {
	const [unoAb, dosAb] = await Promise.all([digest(a), digest(b)]);
	const uno = new Uint8Array(unoAb);
	const dos = new Uint8Array(dosAb);

	let diferencia = 0;
	for (let i = 0; i < uno.length; i++) {
		diferencia |= uno[i] ^ dos[i];
	}
	return diferencia === 0;
}

async function clave(secreto: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		codificador.encode(secreto),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
}

function aBase64Url(datos: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(datos)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function firmar(mensaje: string, secreto: string): Promise<string> {
	return aBase64Url(await crypto.subtle.sign("HMAC", await clave(secreto), codificador.encode(mensaje)));
}

/** Emite el valor de la cookie: `expiracion.firma`. */
export async function emitirSesion(secreto: string, ahoraMs = Date.now()): Promise<string> {
	const expiracion = String(ahoraMs + VIGENCIA_MS);
	return `${expiracion}.${await firmar(expiracion, secreto)}`;
}

export async function sesionEsValida(valor: string | undefined, secreto: string, ahoraMs = Date.now()): Promise<boolean> {
	if (!valor) return false;

	const separador = valor.lastIndexOf(".");
	if (separador <= 0) return false;

	const expiracion = valor.slice(0, separador);
	const firma = valor.slice(separador + 1);

	const vence = Number(expiracion);
	if (!Number.isSafeInteger(vence) || vence <= ahoraMs) return false;

	return coincideEnTiempoConstante(firma, await firmar(expiracion, secreto));
}

/**
 * Cookie de sesión. `HttpOnly` deja el valor fuera del alcance de cualquier script
 * — el token nunca toca `localStorage` — y `SameSite=Strict` impide que otra
 * página dispare acciones de administración en nombre del dueño.
 */
export function cabeceraCookie(valor: string): string {
	const maxAge = Math.floor(VIGENCIA_MS / 1000);
	return `${NOMBRE_COOKIE}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function cabeceraCookieVencida(): string {
	return `${NOMBRE_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function leerCookieSesion(cabecera: string | undefined): string | undefined {
	if (!cabecera) return undefined;
	for (const parte of cabecera.split(";")) {
		const [nombre, ...resto] = parte.trim().split("=");
		if (nombre === NOMBRE_COOKIE) {
			return resto.join("=") || undefined;
		}
	}
	return undefined;
}

export { NOMBRE_COOKIE, VIGENCIA_MS };
