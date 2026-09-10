import { ahora } from "./comun";

/** 5 fallos en 15 minutos desde el mismo origen bloquean nuevos intentos. */
export const MAXIMO_FALLOS = 5;
export const VENTANA_MS = 15 * 60 * 1000;

const codificador = new TextEncoder();

/**
 * Hash del IP de origen. Se guarda el hash y nunca el IP: para contar intentos
 * basta con distinguir orígenes, no con saber cuáles son.
 */
export async function hashDeOrigen(ip: string, sal: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", codificador.encode(`${sal}:${ip}`));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function inicioVentana(ahoraMs: number): string {
	return new Date(ahoraMs - VENTANA_MS).toISOString();
}

export async function estaBloqueado(db: D1Database, ipHash: string, ahoraMs = Date.now()): Promise<boolean> {
	const fila = await db
		.prepare("SELECT COUNT(*) AS total FROM intentos_ingreso WHERE ip_hash = ? AND creado_en > ?")
		.bind(ipHash, inicioVentana(ahoraMs))
		.first<{ total: number }>();
	return (fila?.total ?? 0) >= MAXIMO_FALLOS;
}

export async function registrarFallo(db: D1Database, ipHash: string): Promise<void> {
	await db
		.prepare("INSERT INTO intentos_ingreso (ip_hash, creado_en) VALUES (?, ?)")
		.bind(ipHash, ahora())
		.run();
}

/** Un ingreso exitoso limpia la cuenta de fallos de ese origen. */
export async function limpiarFallos(db: D1Database, ipHash: string): Promise<void> {
	await db.prepare("DELETE FROM intentos_ingreso WHERE ip_hash = ?").bind(ipHash).run();
}

/** Descarta los registros fuera de la ventana para que la tabla no crezca sin límite. */
export async function purgarAntiguos(db: D1Database, ahoraMs = Date.now()): Promise<void> {
	await db.prepare("DELETE FROM intentos_ingreso WHERE creado_en <= ?").bind(inicioVentana(ahoraMs)).run();
}
