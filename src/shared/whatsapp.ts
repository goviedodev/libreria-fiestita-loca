import type { Reserva } from "./reserva";
import { formatearPrecio } from "./texto";

/**
 * Mensaje prearmado del handoff a WhatsApp.
 *
 * Vive en `shared/` porque lo arma el cliente al confirmar, pero el backoffice
 * también necesita el mismo formato para escribirle al cliente. Un solo lugar
 * evita que los dos mensajes se separen con el tiempo.
 */

/**
 * Arma el texto del pedido.
 *
 * Los saltos son `\n` de verdad, no `%0A`: la codificación la hace
 * `encodeURIComponent` una sola vez al construir la URL. Codificar aquí y de
 * nuevo allá dejaría `%250A` en el mensaje, que es como se ven las secuencias de
 * escape en pantalla.
 */
export function mensajeDeReserva(reserva: Reserva, origen: string): string {
	const lineas = [
		`Hola! Hice una reserva en Fiestita Loca.`,
		``,
		`Folio: ${reserva.folio}`,
		`A nombre de: ${reserva.nombre}`,
		``,
	];

	for (const item of reserva.items) {
		lineas.push(`• ${item.libro.titulo} — ${item.libro.autor}`);
		lineas.push(`  ${formatearPrecio(item.precio)}`);
		lineas.push(`  ${origen}/libro/${item.libro.id}`);
	}

	lineas.push(``, `Total: ${formatearPrecio(reserva.total)}`);

	if (reserva.nota) {
		lineas.push(``, `Nota: ${reserva.nota}`);
	}

	return lineas.join("\n");
}

/**
 * URL de `wa.me` con el mensaje ya codificado.
 *
 * El número llega desde la configuración del Worker, nunca escrito en el código:
 * la librería puede cambiarlo sin tocar el build (spec de `reservas-whatsapp`).
 */
export function enlaceWhatsapp(numero: string, mensaje: string): string {
	// `wa.me` quiere el número sin `+` ni separadores.
	const destino = numero.replace(/\D/g, "");
	return `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
}

/** Mensaje con el que el dueño avisa al cliente desde el backoffice. */
export function mensajeDeContacto(reserva: Reserva): string {
	return [
		`Hola ${reserva.nombre}! Te escribimos de Fiestita Loca por tu reserva ${reserva.folio}.`,
		``,
		...reserva.items.map((item) => `• ${item.libro.titulo}`),
		``,
		`Total: ${formatearPrecio(reserva.total)}`,
	].join("\n");
}

/**
 * Aviso de que llegó un libro que alguien había pedido.
 *
 * Lo dispara siempre el dueño desde el backoffice: el sistema no manda nada por
 * su cuenta (spec de `alertas-busqueda`).
 */
export function mensajeDeAviso(
	pedido: { titulo: string | null; autor: string | null },
	libro: { titulo: string; autor: string; id: string },
	origen: string,
): string {
	const loQuePidio = pedido.titulo ?? pedido.autor ?? "el libro que buscabas";

	return [
		`Hola! Te escribimos de Fiestita Loca.`,
		``,
		`Nos habías pedido «${loQuePidio}» y nos llegó este ejemplar:`,
		``,
		`• ${libro.titulo} — ${libro.autor}`,
		`  ${origen}/libro/${libro.id}`,
		``,
		`Si te sirve, avísanos y te lo apartamos.`,
	].join("\n");
}
