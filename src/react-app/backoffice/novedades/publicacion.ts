import type { Libro } from "../../../shared/libro";
import { formatearPrecio } from "../../../shared/texto";
import { aBlob, dibujarPieza, nombreDeArchivo } from "./pieza";

/**
 * Texto de la publicación.
 *
 * Se genera como punto de partida editable: el dueño conoce a su clientela y casi
 * siempre va a querer cambiarle algo antes de publicar.
 */
export function textoDePublicacion(libros: readonly Libro[], origen: string): string {
	const encabezado =
		libros.length === 1
			? "Llegó a la mesa 📚"
			: `Novedades de la semana 📚 ${libros.length} ejemplares nuevos`;

	const lineas = [encabezado, ""];

	for (const libro of libros) {
		lineas.push(`• ${libro.titulo} — ${libro.autor}`);
		lineas.push(`  ${formatearPrecio(libro.precio)} · ${libro.condicion === "nuevo" ? "nuevo" : "usado"}`);
	}

	lineas.push(
		"",
		"Cada uno es ejemplar único. Reserva por acá:",
		origen,
		"",
		"#libros #libreria #Limache #librosusados",
	);

	return lineas.join("\n");
}

/**
 * Copia al portapapeles.
 *
 * `navigator.clipboard` exige contexto seguro y puede estar denegado; el respaldo
 * con `execCommand` es feo pero funciona donde el moderno no, y aquí importa que
 * el dueño no se quede sin poder copiar su texto.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(texto);
		return true;
	} catch {
		try {
			const area = document.createElement("textarea");
			area.value = texto;
			area.style.position = "fixed";
			area.style.opacity = "0";
			document.body.appendChild(area);
			area.select();
			const copiado = document.execCommand("copy");
			document.body.removeChild(area);
			return copiado;
		} catch {
			return false;
		}
	}
}

/** Dispara la descarga de un blob con el nombre dado. */
function descargar(blob: Blob, nombre: string) {
	const url = URL.createObjectURL(blob);
	const enlace = document.createElement("a");
	enlace.href = url;
	enlace.download = nombre;
	document.body.appendChild(enlace);
	enlace.click();
	document.body.removeChild(enlace);
	// El objeto se libera después del clic; revocarlo de inmediato cancela la
	// descarga en algunos navegadores.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function descargarPieza(libro: Libro, indice: number): Promise<void> {
	const canvas = await dibujarPieza(libro);
	descargar(await aBlob(canvas), nombreDeArchivo(libro, indice));
}

/**
 * Descarga toda la tanda, una pieza tras otra.
 *
 * Van en serie y con una pausa: varios navegadores bloquean las descargas
 * simultáneas del mismo origen y solo dejan pasar la primera. Se prefiere esto a
 * cargar una librería de ZIP en el bundle por una función que se usa una vez a la
 * semana.
 */
export async function descargarTanda(
	libros: readonly Libro[],
	alProgresar?: (hechas: number, total: number) => void,
): Promise<void> {
	for (const [indice, libro] of libros.entries()) {
		await descargarPieza(libro, indice);
		alProgresar?.(indice + 1, libros.length);
		if (indice < libros.length - 1) {
			await new Promise((resolver) => setTimeout(resolver, 400));
		}
	}
}
