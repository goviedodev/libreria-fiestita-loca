import { z } from "zod";
import { esIsbnValido, normalizarIsbn } from "../../shared/isbn";
import { ErrorDominio } from "../datos/comun";

/** Metadatos bibliográficos ya normalizados, listos para prellenar el formulario. */
export interface MetadatosIsbn {
	isbn: string;
	titulo: string | null;
	autor: string | null;
	anio: number | null;
	editorial: string | null;
	genero: string | null;
	sinopsis: string | null;
	portadaUrl: string | null;
	fuente: Fuente;
}

export type Fuente = "google-books" | "openlibrary";

export type ResultadoIsbn =
	| { encontrado: true; metadatos: MetadatosIsbn }
	| { encontrado: false; isbn: string };

/** Ambas fuentes tienen 5 s: el dueño está frente a la pantalla esperando. */
const TIEMPO_LIMITE_MS = 5000;

const TTL_HALLAZGO_S = 60 * 60 * 24 * 30;
// Un ISBN que hoy no está en ninguna fuente puede aparecer mañana, así que el
// resultado vacío se recuerda un día y no un mes.
const TTL_VACIO_S = 60 * 60 * 24;

const CLAVE_CACHE = "https://cache.fiestita.local/isbn/";

// ---------------------------------------------------------------------------
// Esquemas de las respuestas externas
//
// Son datos de terceros: se validan como cualquier otra entrada externa. Los
// esquemas son deliberadamente laxos (`catchall` implícito, casi todo opcional)
// porque solo interesan los campos que se usan; un campo nuevo o faltante en la
// fuente no debe romper la ingesta.
// ---------------------------------------------------------------------------

const esquemaVolumenGoogle = z.object({
	title: z.string().optional(),
	subtitle: z.string().optional(),
	authors: z.array(z.string()).optional(),
	publishedDate: z.string().optional(),
	publisher: z.string().optional(),
	categories: z.array(z.string()).optional(),
	description: z.string().optional(),
	imageLinks: z.object({ thumbnail: z.string().optional() }).optional(),
});

const esquemaRespuestaGoogle = z.object({
	totalItems: z.number().optional(),
	items: z.array(z.object({ volumeInfo: esquemaVolumenGoogle })).optional(),
});

const esquemaLibroOpenLibrary = z.object({
	title: z.string().optional(),
	subtitle: z.string().optional(),
	authors: z.array(z.object({ name: z.string() })).optional(),
	publish_date: z.string().optional(),
	publishers: z.array(z.object({ name: z.string() })).optional(),
	subjects: z.array(z.object({ name: z.string() })).optional(),
	notes: z.string().optional(),
	excerpts: z.array(z.object({ text: z.string().optional() })).optional(),
	cover: z.object({ large: z.string().optional(), medium: z.string().optional() }).optional(),
});

const esquemaRespuestaOpenLibrary = z.record(z.string(), esquemaLibroOpenLibrary);

// ---------------------------------------------------------------------------
// Utilidades de extracción
// ---------------------------------------------------------------------------

function texto(valor: string | undefined): string | null {
	const limpio = valor?.trim();
	return limpio ? limpio : null;
}

/** Las fechas vienen como `2003`, `2003-05` o `May 2003`: solo interesa el año. */
function anioDe(valor: string | undefined): number | null {
	const coincidencia = valor?.match(/\d{4}/);
	if (!coincidencia) return null;
	const anio = Number(coincidencia[0]);
	return anio >= 1400 && anio <= 2200 ? anio : null;
}

function tituloCompleto(titulo?: string, subtitulo?: string): string | null {
	const base = texto(titulo);
	const extra = texto(subtitulo);
	if (!base) return null;
	return extra ? `${base}: ${extra}` : base;
}

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

async function pedirJson(url: string): Promise<unknown> {
	const respuesta = await fetch(url, {
		signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
		headers: { Accept: "application/json", "User-Agent": "libreria-fiestita-loca" },
	});
	if (!respuesta.ok) {
		throw new Error(`La fuente respondió ${respuesta.status}`);
	}
	return respuesta.json();
}

async function consultarGoogleBooks(isbn: string): Promise<MetadatosIsbn | null> {
	const crudo = await pedirJson(
		`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`,
	);
	const datos = esquemaRespuestaGoogle.parse(crudo);
	const volumen = datos.items?.[0]?.volumeInfo;
	if (!volumen) return null;

	const titulo = tituloCompleto(volumen.title, volumen.subtitle);
	if (!titulo) return null;

	return {
		isbn,
		titulo,
		autor: volumen.authors?.length ? volumen.authors.join(", ") : null,
		anio: anioDe(volumen.publishedDate),
		editorial: texto(volumen.publisher),
		genero: texto(volumen.categories?.[0]),
		sinopsis: texto(volumen.description),
		// Google sirve la miniatura por HTTP y en tamaño pequeño; `https` y un
		// zoom mayor dan una portada usable para el catálogo y para las piezas.
		portadaUrl: mejorarPortadaGoogle(volumen.imageLinks?.thumbnail),
		fuente: "google-books",
	};
}

function mejorarPortadaGoogle(url: string | undefined): string | null {
	const limpia = texto(url);
	if (!limpia) return null;
	return limpia.replace(/^http:/, "https:").replace(/&zoom=\d/, "&zoom=1");
}

async function consultarOpenLibrary(isbn: string): Promise<MetadatosIsbn | null> {
	const clave = `ISBN:${isbn}`;
	const crudo = await pedirJson(
		`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(clave)}&format=json&jscmd=data`,
	);
	const datos = esquemaRespuestaOpenLibrary.parse(crudo);
	const libro = datos[clave];
	if (!libro) return null;

	const titulo = tituloCompleto(libro.title, libro.subtitle);
	if (!titulo) return null;

	return {
		isbn,
		titulo,
		autor: libro.authors?.length ? libro.authors.map((a) => a.name).join(", ") : null,
		anio: anioDe(libro.publish_date),
		editorial: texto(libro.publishers?.[0]?.name),
		genero: texto(libro.subjects?.[0]?.name),
		sinopsis: texto(libro.notes) ?? texto(libro.excerpts?.[0]?.text),
		portadaUrl: texto(libro.cover?.large) ?? texto(libro.cover?.medium),
		fuente: "openlibrary",
	};
}

// ---------------------------------------------------------------------------
// Caché
// ---------------------------------------------------------------------------

async function leerCache(isbn: string): Promise<ResultadoIsbn | null> {
	try {
		const guardado = await caches.default.match(CLAVE_CACHE + isbn);
		return guardado ? ((await guardado.json()) as ResultadoIsbn) : null;
	} catch {
		// Una caché que falla no puede tumbar la ingesta: se consulta la fuente.
		return null;
	}
}

function guardarEnCache(isbn: string, resultado: ResultadoIsbn): Promise<void> {
	const ttl = resultado.encontrado ? TTL_HALLAZGO_S : TTL_VACIO_S;
	return caches.default
		.put(
			CLAVE_CACHE + isbn,
			new Response(JSON.stringify(resultado), {
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": `public, max-age=${ttl}`,
				},
			}),
		)
		.catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

/**
 * Busca los metadatos de un ISBN: Google Books primero, OpenLibrary de respaldo.
 *
 * Lanza `ErrorDominio` 422 si el ISBN no es válido —sin tocar la red— y 503 si
 * ambas fuentes fallan, para que el cliente pueda ofrecer el alta manual sin
 * perder lo que el dueño ya escribió.
 */
export async function buscarPorIsbn(valor: string): Promise<ResultadoIsbn> {
	const isbn = normalizarIsbn(valor);
	if (!esIsbnValido(isbn)) {
		throw new ErrorDominio("Ese ISBN no es válido", 422, { isbn: "El ISBN no es válido" });
	}

	const enCache = await leerCache(isbn);
	if (enCache) return enCache;

	const fuentes = [consultarGoogleBooks, consultarOpenLibrary];
	let fallosSeguidos = 0;

	for (const consultar of fuentes) {
		try {
			const metadatos = await consultar(isbn);
			if (metadatos) {
				const resultado: ResultadoIsbn = { encontrado: true, metadatos };
				await guardarEnCache(isbn, resultado);
				return resultado;
			}
		} catch (causa) {
			// Un fallo de una fuente no es un fallo de la búsqueda: se prueba la
			// siguiente. Solo si fallan todas se informa que no hay enriquecimiento.
			fallosSeguidos++;
			console.warn(`Fuente bibliográfica no disponible para ${isbn}:`, causa);
		}
	}

	if (fallosSeguidos === fuentes.length) {
		throw new ErrorDominio(
			"La búsqueda por ISBN no está disponible en este momento. Puedes ingresar el libro a mano.",
			503,
		);
	}

	const vacio: ResultadoIsbn = { encontrado: false, isbn };
	await guardarEnCache(isbn, vacio);
	return vacio;
}
