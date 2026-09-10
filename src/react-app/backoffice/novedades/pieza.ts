import type { Libro } from "../../../shared/libro";
import { formatearPrecio } from "../../../shared/texto";
import { ajustarCuerpo } from "./maquetacion";

/**
 * Genera la pieza de Instagram de un libro, en el navegador del dueño.
 *
 * Todo ocurre en un `<canvas>` local: no hay servicio de diseño de por medio, ni
 * las portadas salen del dominio propio. Esto último es la razón por la que el
 * grupo 4 descarga las portadas externas a R2 (design.md §9): `toBlob()` lanza
 * `SecurityError` sobre un canvas contaminado por una imagen de otro origen, y
 * ahí toda esta capacidad se caería.
 */

export const ANCHO = 1080;
export const ALTO = 1920;

const PALETA = {
	papel: "#f7f2e8",
	papelHondo: "#ebe2d2",
	tinta: "#231c16",
	tintaSuave: "#6b5f52",
	acento: "#9b2c1f",
};

const SERIF = '"Iowan Old Style", Palatino, Georgia, "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Carga una imagen del propio dominio.
 *
 * Se resuelve con `null` en vez de rechazar: una portada que no carga degrada la
 * pieza al fondo de respaldo, no cancela la tanda entera.
 */
function cargarImagen(url: string): Promise<HTMLImageElement | null> {
	return new Promise((resolver) => {
		const imagen = new Image();
		// Mismo origen, pero declararlo es lo que mantiene el canvas limpio si
		// algún día las imágenes se sirven desde un subdominio.
		imagen.crossOrigin = "anonymous";
		imagen.onload = () => resolver(imagen);
		imagen.onerror = () => resolver(null);
		imagen.src = url;
	});
}

/** Grano de papel, el mismo gesto que el fondo del sitio. */
function pintarGrano(ctx: CanvasRenderingContext2D) {
	ctx.save();
	ctx.globalAlpha = 0.035;
	ctx.fillStyle = PALETA.tinta;
	for (let y = 0; y < ALTO; y += 4) {
		ctx.fillRect(0, y, ANCHO, 1);
	}
	ctx.restore();
}

/** Trama diagonal del respaldo cuando el libro no tiene imagen. */
function pintarTrama(ctx: CanvasRenderingContext2D, x: number, y: number, ancho: number, alto: number) {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, ancho, alto);
	ctx.clip();
	ctx.fillStyle = PALETA.papelHondo;
	ctx.fillRect(x, y, ancho, alto);
	ctx.strokeStyle = PALETA.tinta;
	ctx.globalAlpha = 0.06;
	ctx.lineWidth = 8;
	for (let i = -alto; i < ancho + alto; i += 34) {
		ctx.beginPath();
		ctx.moveTo(x + i, y);
		ctx.lineTo(x + i + alto, y + alto);
		ctx.stroke();
	}
	ctx.restore();
}

const MARGEN = 96;
const CAJA_IMAGEN = { x: MARGEN, y: 300, ancho: ANCHO - MARGEN * 2, alto: 980 };

/** Dibuja la portada dentro de su caja, recortada al centro y sin deformar. */
function pintarPortada(ctx: CanvasRenderingContext2D, imagen: HTMLImageElement) {
	const { x, y, ancho, alto } = CAJA_IMAGEN;
	const escala = Math.max(ancho / imagen.width, alto / imagen.height);
	const anchoFinal = imagen.width * escala;
	const altoFinal = imagen.height * escala;

	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, ancho, alto);
	ctx.clip();
	ctx.drawImage(imagen, x + (ancho - anchoFinal) / 2, y + (alto - altoFinal) / 2, anchoFinal, altoFinal);
	ctx.restore();
}

/** Respaldo: la trama con el monograma, para libros sin ninguna imagen. */
function pintarRespaldo(ctx: CanvasRenderingContext2D) {
	const { x, y, ancho, alto } = CAJA_IMAGEN;
	pintarTrama(ctx, x, y, ancho, alto);

	ctx.save();
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = PALETA.tintaSuave;
	ctx.font = `600 120px ${SERIF}`;
	ctx.fillText("FL", x + ancho / 2, y + alto / 2 - 30);
	ctx.font = `500 30px ${SANS}`;
	ctx.letterSpacing = "8px";
	ctx.fillText("FIESTITA LOCA", x + ancho / 2, y + alto / 2 + 70);
	ctx.restore();
}

/**
 * Dibuja la pieza completa en un canvas nuevo y lo devuelve.
 *
 * No toca el DOM: el canvas vive en memoria y quien llame decide si lo muestra o
 * lo convierte a blob.
 */
export async function dibujarPieza(libro: Libro): Promise<HTMLCanvasElement> {
	const canvas = document.createElement("canvas");
	canvas.width = ANCHO;
	canvas.height = ALTO;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Este navegador no permite generar las piezas");
	}

	ctx.fillStyle = PALETA.papel;
	ctx.fillRect(0, 0, ANCHO, ALTO);
	pintarGrano(ctx);

	// Encabezado
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = PALETA.acento;
	ctx.font = `600 30px ${SANS}`;
	ctx.letterSpacing = "10px";
	ctx.fillText("NUEVO EN LA MESA", ANCHO / 2, 170);
	ctx.letterSpacing = "0px";

	ctx.strokeStyle = PALETA.tinta;
	ctx.globalAlpha = 0.18;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(MARGEN, 215);
	ctx.lineTo(ANCHO - MARGEN, 215);
	ctx.stroke();
	ctx.globalAlpha = 1;

	const imagen = libro.imagenUrl ? await cargarImagen(libro.imagenUrl) : null;
	if (imagen) {
		pintarPortada(ctx, imagen);
	} else {
		pintarRespaldo(ctx);
	}

	// Título: es lo que tiene que leerse de un vistazo en una historia.
	const anchoTexto = ANCHO - MARGEN * 2;
	let y = CAJA_IMAGEN.y + CAJA_IMAGEN.alto + 110;

	ctx.fillStyle = PALETA.tinta;
	const titulo = ajustarCuerpo(ctx, libro.titulo, anchoTexto, 3, 82, 46, SERIF);
	for (const linea of titulo.lineas) {
		ctx.fillText(linea, ANCHO / 2, y);
		y += titulo.cuerpo * 1.12;
	}

	y += 18;
	ctx.fillStyle = PALETA.tintaSuave;
	const autor = ajustarCuerpo(ctx, libro.autor, anchoTexto, 2, 42, 30, SANS, "400");
	for (const linea of autor.lineas) {
		ctx.fillText(linea, ANCHO / 2, y);
		y += autor.cuerpo * 1.2;
	}

	// Precio y condición
	y += 70;
	ctx.fillStyle = PALETA.acento;
	ctx.font = `600 72px ${SERIF}`;
	ctx.fillText(formatearPrecio(libro.precio), ANCHO / 2, y);

	ctx.fillStyle = PALETA.tintaSuave;
	ctx.font = `500 28px ${SANS}`;
	ctx.letterSpacing = "6px";
	ctx.fillText(libro.condicion === "nuevo" ? "NUEVO" : "USADO", ANCHO / 2, y + 52);
	ctx.letterSpacing = "0px";

	// Pie con la marca
	ctx.fillStyle = PALETA.tinta;
	ctx.font = `600 40px ${SERIF}`;
	ctx.fillText("Fiestita Loca", ANCHO / 2, ALTO - 118);
	ctx.fillStyle = PALETA.tintaSuave;
	ctx.font = `400 26px ${SANS}`;
	ctx.letterSpacing = "5px";
	ctx.fillText("LIBRERÍA · LIMACHE", ANCHO / 2, ALTO - 72);

	return canvas;
}

/** Convierte el canvas a PNG. Rechaza si el canvas quedó contaminado. */
export function aBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolver, rechazar) => {
		try {
			canvas.toBlob((blob) => {
				if (blob) resolver(blob);
				else rechazar(new Error("No se pudo generar la imagen"));
			}, "image/png");
		} catch (causa) {
			// `SecurityError` significa canvas contaminado: una imagen de otro origen
			// se coló en el dibujo. Ver design.md §9.
			rechazar(causa instanceof Error ? causa : new Error("No se pudo generar la imagen"));
		}
	});
}

/** Nombre de archivo que identifica al libro sin caracteres problemáticos. */
export function nombreDeArchivo(libro: Libro, indice: number): string {
	const base = `${libro.titulo} ${libro.autor}`
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);

	return `${String(indice + 1).padStart(2, "0")}-${base || "libro"}.png`;
}
