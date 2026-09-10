import { ErrorDominio } from "../datos/comun";

/**
 * Imágenes en R2.
 *
 * Todas las imágenes del catálogo —incluidas las portadas que vienen de las
 * fuentes bibliográficas— se guardan en el propio bucket (design.md §9): la
 * portada no desaparece si la fuente la borra, no se hace hotlinking, y el canvas
 * que genera las piezas de Instagram no queda contaminado por otro origen.
 */

export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

const TIPOS_ACEPTADOS = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
} as const;

export type TipoImagen = keyof typeof TIPOS_ACEPTADOS;

export const FORMATOS_ACEPTADOS = "JPEG, PNG o WebP";

/**
 * Detecta el tipo por los bytes iniciales, no por el `Content-Type` declarado.
 *
 * El encabezado lo controla quien sube el archivo; los bytes no. Un PDF renombrado
 * a `.jpg` con `Content-Type: image/jpeg` se rechaza igual.
 */
export function tipoPorContenido(bytes: Uint8Array): TipoImagen | null {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}

	const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (bytes.length >= 8 && PNG.every((byte, i) => bytes[i] === byte)) {
		return "image/png";
	}

	// WebP es un contenedor RIFF: "RIFF" en 0..3 y "WEBP" en 8..11.
	if (bytes.length >= 12) {
		const marca = (desde: number) => String.fromCharCode(...bytes.slice(desde, desde + 4));
		if (marca(0) === "RIFF" && marca(8) === "WEBP") {
			return "image/webp";
		}
	}

	return null;
}

/** Clave con hash del contenido: la misma imagen no se duplica y la URL es inmutable. */
async function claveDeContenido(bytes: Uint8Array, tipo: TipoImagen): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
	const hex = [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 32);
	return `${hex}.${TIPOS_ACEPTADOS[tipo]}`;
}

interface ImagenGuardada {
	clave: string;
	tipo: TipoImagen;
	bytes: number;
}

async function guardar(bucket: R2Bucket, datos: Uint8Array, tipo: TipoImagen): Promise<ImagenGuardada> {
	const clave = await claveDeContenido(datos, tipo);
	await bucket.put(clave, datos as unknown as ArrayBufferView, {
		httpMetadata: { contentType: tipo, cacheControl: "public, max-age=31536000, immutable" },
	});
	return { clave, tipo, bytes: datos.length };
}

/**
 * Valida y almacena la foto del ejemplar que sube el dueño.
 *
 * Lanza `ErrorDominio` con el motivo exacto: la spec pide que el mensaje diga qué
 * formatos se aceptan o cuál es el tamaño máximo, no un "archivo inválido".
 */
export async function guardarFotoDeEjemplar(bucket: R2Bucket, archivo: File): Promise<ImagenGuardada> {
	if (archivo.size > TAMANO_MAXIMO_BYTES) {
		throw new ErrorDominio(`La imagen no puede superar los 5 MB`, 422, {
			foto: "La imagen no puede superar los 5 MB",
		});
	}
	if (archivo.size === 0) {
		throw new ErrorDominio("El archivo está vacío", 422, { foto: "El archivo está vacío" });
	}

	const datos = new Uint8Array(await archivo.arrayBuffer());

	// Se revisa el tamaño otra vez sobre los bytes leídos: `File.size` es un dato
	// declarado y podría no coincidir con lo que realmente llega.
	if (datos.length > TAMANO_MAXIMO_BYTES) {
		throw new ErrorDominio(`La imagen no puede superar los 5 MB`, 422, {
			foto: "La imagen no puede superar los 5 MB",
		});
	}

	const tipo = tipoPorContenido(datos);
	if (!tipo) {
		throw new ErrorDominio(`Solo se aceptan imágenes ${FORMATOS_ACEPTADOS}`, 422, {
			foto: `Solo se aceptan imágenes ${FORMATOS_ACEPTADOS}`,
		});
	}

	return guardar(bucket, datos, tipo);
}

const TIEMPO_LIMITE_PORTADA_MS = 8000;

/**
 * Descarga a R2 la portada que devolvió la fuente bibliográfica.
 *
 * Devuelve `null` ante cualquier problema en vez de lanzar: que la portada no se
 * pueda traer no puede impedir que el libro se dé de alta.
 */
export async function guardarPortadaExterna(bucket: R2Bucket, url: string): Promise<string | null> {
	try {
		const respuesta = await fetch(url, {
			signal: AbortSignal.timeout(TIEMPO_LIMITE_PORTADA_MS),
			headers: { "User-Agent": "libreria-fiestita-loca" },
		});
		if (!respuesta.ok || !respuesta.body) return null;

		const declarado = Number(respuesta.headers.get("Content-Length") ?? "0");
		if (declarado > TAMANO_MAXIMO_BYTES) return null;

		const datos = new Uint8Array(await respuesta.arrayBuffer());
		if (datos.length === 0 || datos.length > TAMANO_MAXIMO_BYTES) return null;

		const tipo = tipoPorContenido(datos);
		if (!tipo) return null;

		const { clave } = await guardar(bucket, datos, tipo);
		return clave;
	} catch (causa) {
		console.warn("No se pudo traer la portada externa:", causa);
		return null;
	}
}

/**
 * Borra una imagen que dejó de usarse.
 *
 * Como la clave es el hash del contenido, dos libros con la misma imagen la
 * comparten: solo se borra si ninguna otra fila la referencia.
 */
export async function eliminarImagenSiHuerfana(
	bucket: R2Bucket,
	db: D1Database,
	clave: string | null,
): Promise<void> {
	if (!clave) return;

	const fila = await db
		.prepare("SELECT COUNT(*) AS total FROM libros WHERE imagen_clave = ? OR foto_clave = ?")
		.bind(clave, clave)
		.first<{ total: number }>();

	if ((fila?.total ?? 0) > 0) return;

	await bucket.delete(clave).catch((causa) => {
		// Una imagen que no se pudo borrar es basura en el bucket, no un fallo de
		// la operación que el dueño pidió.
		console.warn("No se pudo borrar la imagen", clave, causa);
	});
}
