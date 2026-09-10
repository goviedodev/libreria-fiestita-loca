import type { Libro } from "../../shared/libro";
import { formatearPrecio } from "../../shared/texto";

/**
 * Metadatos de previsualización de una ficha.
 *
 * WhatsApp, Instagram y Telegram piden la URL y leen el HTML **sin ejecutar
 * JavaScript**: un SPA les entrega el `index.html` vacío y la previsualización
 * sale con el título genérico del sitio. Por eso las etiquetas se inyectan en el
 * Worker, antes de mandar el documento.
 */

function escapar(valor: string): string {
	return valor
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Recorta a un largo legible sin cortar una palabra por la mitad. */
function resumir(texto: string, maximo = 160): string {
	const limpio = texto.replace(/\s+/g, " ").trim();
	if (limpio.length <= maximo) return limpio;
	const corte = limpio.slice(0, maximo);
	const ultimoEspacio = corte.lastIndexOf(" ");
	return `${corte.slice(0, ultimoEspacio > 0 ? ultimoEspacio : maximo)}…`;
}

export function descripcionDe(libro: Libro): string {
	const condicion = libro.condicion === "nuevo" ? "Nuevo" : "Usado";
	const encabezado = `${libro.autor} · ${condicion} · ${formatearPrecio(libro.precio)}`;
	return libro.sinopsis ? `${encabezado}. ${resumir(libro.sinopsis, 110)}` : encabezado;
}

/**
 * Reescribe el `<head>` del documento del SPA con los datos del libro.
 *
 * Solo se tocan el `<title>` y la descripción y se añaden las etiquetas Open
 * Graph: el resto del documento —incluido el script del cliente— sale intacto,
 * así que la aplicación arranca igual.
 */
export function inyectarPrevisualizacion(html: string, libro: Libro, origen: string): string {
	const titulo = `${libro.titulo} — ${libro.autor} · Fiestita Loca`;
	const descripcion = descripcionDe(libro);
	const urlFicha = `${origen}/libro/${libro.id}`;
	const imagen = libro.imagenUrl ? `${origen}${libro.imagenUrl}` : null;

	const etiquetas = [
		`<title>${escapar(titulo)}</title>`,
		`<meta name="description" content="${escapar(descripcion)}" />`,
		`<meta property="og:type" content="product" />`,
		`<meta property="og:site_name" content="Fiestita Loca" />`,
		`<meta property="og:title" content="${escapar(titulo)}" />`,
		`<meta property="og:description" content="${escapar(descripcion)}" />`,
		`<meta property="og:url" content="${escapar(urlFicha)}" />`,
		`<meta name="twitter:card" content="${imagen ? "summary_large_image" : "summary"}" />`,
	];

	if (imagen) {
		etiquetas.push(
			`<meta property="og:image" content="${escapar(imagen)}" />`,
			`<meta property="og:image:alt" content="${escapar(`Portada de ${libro.titulo}`)}" />`,
		);
	}

	return html
		.replace(/<title>[\s\S]*?<\/title>\s*/i, "")
		.replace(/<meta\s+name="description"[^>]*>\s*/i, "")
		.replace("</head>", `${etiquetas.join("\n\t\t")}\n\t</head>`);
}
