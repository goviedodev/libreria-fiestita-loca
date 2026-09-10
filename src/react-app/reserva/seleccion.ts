import type { LibroPublico } from "../../shared/libro";

/**
 * Selección de libros del visitante, guardada en el navegador.
 *
 * Se guardan **ids**, no los libros completos: el precio o la disponibilidad
 * pueden cambiar mientras la selección espera, y mostrar una copia vieja sería
 * mentirle al cliente. Los datos se releen del servidor al abrir la reserva.
 *
 * `localStorage` puede fallar (modo privado, cookies bloqueadas, cuota llena), así
 * que cada acceso va protegido: sin persistencia la selección sigue funcionando
 * dentro de la pestaña, que es lo mínimo aceptable.
 */

const CLAVE = "fl_seleccion";
const MAXIMO = 30;

type Escucha = (ids: readonly string[]) => void;

let memoria: string[] = leerDelAlmacen();
const escuchas = new Set<Escucha>();

function leerDelAlmacen(): string[] {
	try {
		const crudo = localStorage.getItem(CLAVE);
		if (!crudo) return [];
		const datos: unknown = JSON.parse(crudo);
		// Lo que hay en el almacén lo pudo escribir una versión anterior o alguien a
		// mano: se valida antes de usarlo, como cualquier entrada externa.
		return Array.isArray(datos)
			? datos.filter((valor): valor is string => typeof valor === "string").slice(0, MAXIMO)
			: [];
	} catch {
		return [];
	}
}

function guardar(ids: readonly string[]) {
	try {
		localStorage.setItem(CLAVE, JSON.stringify(ids));
	} catch {
		// Sin persistencia la selección vive lo que dure la pestaña.
	}
}

function emitir() {
	const copia = Object.freeze([...memoria]);
	for (const escucha of escuchas) escucha(copia);
}

export function obtenerSeleccion(): readonly string[] {
	return memoria;
}

export function suscribir(escucha: Escucha): () => void {
	escuchas.add(escucha);
	return () => escuchas.delete(escucha);
}

export function estaSeleccionado(id: string): boolean {
	return memoria.includes(id);
}

export function agregar(id: string) {
	if (memoria.includes(id) || memoria.length >= MAXIMO) return;
	memoria = [...memoria, id];
	guardar(memoria);
	emitir();
}

export function quitar(id: string) {
	if (!memoria.includes(id)) return;
	memoria = memoria.filter((otro) => otro !== id);
	guardar(memoria);
	emitir();
}

export function alternar(id: string) {
	if (memoria.includes(id)) {
		quitar(id);
	} else {
		agregar(id);
	}
}

export function vaciar() {
	memoria = [];
	guardar(memoria);
	emitir();
}

/** Total de la selección, calculado sobre los libros que siguen disponibles. */
export function totalDe(libros: readonly LibroPublico[]): number {
	return libros
		.filter((libro) => libro.estado === "disponible")
		.reduce((suma, libro) => suma + libro.precio, 0);
}
