import { Hono } from "hono";

export const rutasImagenes = new Hono<{ Bindings: Env }>();

/**
 * Sirve una imagen del bucket.
 *
 * La clave lleva el hash del contenido, así que una clave dada siempre devuelve
 * los mismos bytes: se puede cachear para siempre. Cambiar la imagen de un libro
 * cambia la clave, no el contenido de esta URL (design.md §9).
 */
rutasImagenes.get("/:clave", async (c) => {
	const clave = c.req.param("clave");

	// La clave se genera aquí y siempre tiene esta forma; cualquier otra cosa es
	// alguien tanteando el bucket.
	if (!/^[0-9a-f]{32}\.(jpg|png|webp)$/.test(clave)) {
		return c.json({ error: "Recurso no encontrado" }, 404);
	}

	const objeto = await c.env.IMAGENES.get(clave);
	if (!objeto) {
		return c.json({ error: "Recurso no encontrado" }, 404);
	}

	// `etag` permite que el navegador revalide con 304 aunque la caché expire.
	return new Response(objeto.body, {
		headers: {
			"Content-Type": objeto.httpMetadata?.contentType ?? "application/octet-stream",
			"Cache-Control": "public, max-age=31536000, immutable",
			ETag: objeto.httpEtag,
		},
	});
});
