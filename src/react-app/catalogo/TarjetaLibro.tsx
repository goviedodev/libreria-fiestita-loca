import { Link } from "wouter";
import type { LibroPublico } from "../../shared/libro";
import { formatearPrecio } from "../../shared/texto";

/**
 * Un libro en el listado.
 *
 * La imagen es la foto del ejemplar si existe, si no la portada, y si no hay
 * ninguna, un marcador de posición: el Worker ya resolvió esa prioridad y aquí
 * solo llega `imagenUrl` o `null`.
 */
export function TarjetaLibro({ libro }: { libro: LibroPublico }) {
	const disponible = libro.estado === "disponible";

	return (
		<article className={`tarjeta${disponible ? "" : " tarjeta--agotada"}`}>
			<Link href={`/libro/${libro.id}`} className="tarjeta__enlace">
				<div className="tarjeta__lamina">
					{libro.imagenUrl ? (
						<img
							className="tarjeta__imagen"
							src={libro.imagenUrl}
							alt=""
							loading="lazy"
							width={200}
							height={300}
						/>
					) : (
						<div className="tarjeta__sin-imagen" aria-hidden="true">
							<span className="tarjeta__sin-imagen-marca">FL</span>
							<span className="tarjeta__sin-imagen-texto">Sin imagen</span>
						</div>
					)}
					{!disponible && (
						<span className="tarjeta__cinta">
							{libro.estado === "vendido" ? "Vendido" : "Reservado"}
						</span>
					)}
				</div>

				<div className="tarjeta__cuerpo">
					<h2 className="tarjeta__titulo">{libro.titulo}</h2>
					<p className="tarjeta__autor">{libro.autor}</p>
					<p className="tarjeta__pie">
						<span className="tarjeta__precio">{formatearPrecio(libro.precio)}</span>
						<span className="tarjeta__condicion">{libro.condicion === "nuevo" ? "Nuevo" : "Usado"}</span>
					</p>
				</div>
			</Link>
		</article>
	);
}
