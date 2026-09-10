/**
 * Reparto del texto en líneas dentro de la pieza.
 *
 * Vive aparte del dibujo porque es algoritmo puro —solo necesita poder medir el
 * ancho de un texto— y es donde de verdad puede romperse una pieza: un título
 * largo que se desborda o que tapa el precio. Se prueba con un medidor simulado,
 * sin canvas de por medio.
 */

/** Lo único que la maquetación necesita de un contexto de canvas. */
export interface Medidor {
	font: string;
	measureText(texto: string): { width: number };
}

/** Parte un texto en líneas que caben en `ancho`, sin cortar palabras. */
export function repartirEnLineas(
	ctx: Medidor,
	texto: string,
	ancho: number,
	maximoLineas: number,
): string[] {
	const palabras = texto.split(/\s+/);
	const lineas: string[] = [];
	let actual = "";

	for (const palabra of palabras) {
		const tentativa = actual ? `${actual} ${palabra}` : palabra;
		if (ctx.measureText(tentativa).width <= ancho || !actual) {
			actual = tentativa;
		} else {
			lineas.push(actual);
			actual = palabra;
		}
	}
	if (actual) lineas.push(actual);

	if (lineas.length <= maximoLineas) return lineas;

	// Se recorta con puntos suspensivos en vez de dejar el texto desbordado.
	const recortadas = lineas.slice(0, maximoLineas);
	recortadas[maximoLineas - 1] = `${recortadas[maximoLineas - 1].replace(/\s+\S*$/, "")}…`;
	return recortadas;
}

/** Reduce el cuerpo hasta que el texto quepa en las líneas disponibles. */
export function ajustarCuerpo(
	ctx: Medidor,
	texto: string,
	ancho: number,
	maximoLineas: number,
	cuerpoInicial: number,
	cuerpoMinimo: number,
	familia: string,
	peso = "600",
): { lineas: string[]; cuerpo: number } {
	let cuerpo = cuerpoInicial;
	for (;;) {
		ctx.font = `${peso} ${cuerpo}px ${familia}`;
		const lineas = repartirEnLineas(ctx, texto, ancho, maximoLineas + 1);
		if (lineas.length <= maximoLineas || cuerpo <= cuerpoMinimo) {
			return { lineas: lineas.slice(0, maximoLineas), cuerpo };
		}
		// Se acota al mínimo en vez de restar a ciegas: bajando de a 6 desde 80 con
		// mínimo 40 se llegaba a 38, por debajo del tamaño que mantiene el texto
		// legible en una pieza de 1080 px de ancho.
		cuerpo = Math.max(cuerpo - 6, cuerpoMinimo);
	}
}
