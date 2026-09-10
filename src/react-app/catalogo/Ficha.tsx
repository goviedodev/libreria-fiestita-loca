import { Link } from "wouter";
import { alternar } from "../reserva/seleccion";
import { useSeleccion } from "../reserva/useSeleccion";
import type { LibroPublico } from "../../shared/libro";
import { formatearPrecio } from "../../shared/texto";
import { ErrorRespuesta } from "../lib/api";
import { Recurso } from "../lib/Recurso";
import { NoEncontrado } from "../ui/NoEncontrado";
import { pedirLibro } from "./api";
import "./catalogo.css";

/**
 * Ficha de un libro, en su URL propia y estable.
 *
 * Un libro inexistente y uno dado de baja llegan igual como 404: para el visitante
 * son lo mismo, y la página de no encontrado deja el camino de vuelta al catálogo.
 */
export function Ficha({ id }: { id: string }) {
	return (
		<Recurso
			pedir={() =>
				pedirLibro(id).then(
					(datos) => datos.libro,
					(causa: unknown) => {
						if (causa instanceof ErrorRespuesta && causa.estado === 404) return null;
						throw causa;
					},
				)
			}
			respaldo={<p className="catalogo__cargando">Cargando el libro…</p>}
		>
			{(libro) => (libro ? <Detalle libro={libro} /> : <NoEncontrado />)}
		</Recurso>
	);
}

const ETIQUETA_ESTADO: Record<LibroPublico["estado"], string> = {
	disponible: "Disponible",
	reservado: "Reservado por otra persona",
	vendido: "Vendido",
};

function Detalle({ libro }: { libro: LibroPublico }) {
	const disponible = libro.estado === "disponible";
	const datos = [
		["Editorial", libro.editorial],
		["Año", libro.anio ? String(libro.anio) : null],
		["Género", libro.genero],
		["Condición", libro.condicion === "nuevo" ? "Nuevo" : "Usado"],
		["ISBN", libro.isbn],
	].filter((par): par is [string, string] => Boolean(par[1]));

	return (
		<article className="ficha">
			<p className="ficha__migas">
				<Link href="/">← Volver al catálogo</Link>
			</p>

			<div className="ficha__cuerpo">
				<div className="ficha__lamina">
					{libro.imagenUrl ? (
						<img className="ficha__imagen" src={libro.imagenUrl} alt={`Portada de ${libro.titulo}`} />
					) : (
						<div className="ficha__sin-imagen" aria-hidden="true">
							<span className="tarjeta__sin-imagen-marca">FL</span>
							<span className="tarjeta__sin-imagen-texto">Sin imagen</span>
						</div>
					)}
				</div>

				<div className="ficha__datos">
					<h1 className="ficha__titulo">{libro.titulo}</h1>
					<p className="ficha__autor">{libro.autor}</p>

					<p className={`ficha__estado ficha__estado--${libro.estado}`}>
						{ETIQUETA_ESTADO[libro.estado]}
					</p>

					<p className="ficha__precio">{formatearPrecio(libro.precio)}</p>

					{disponible ? (
						<AccionReservar libro={libro} />
					) : (
						<p className="ficha__no-disponible">
							Este ejemplar ya no está disponible. Es una copia única, pero podemos avisarte si llega
							otra.
						</p>
					)}

					{datos.length > 0 && (
						<dl className="ficha__ficha-tecnica">
							{datos.map(([etiqueta, valor]) => (
								<div key={etiqueta} className="ficha__dato">
									<dt>{etiqueta}</dt>
									<dd>{valor}</dd>
								</div>
							))}
						</dl>
					)}

					{libro.sinopsis && (
						<div className="ficha__sinopsis">
							<h2>Sinopsis</h2>
							<p>{libro.sinopsis}</p>
						</div>
					)}
				</div>
			</div>
		</article>
	);
}


/**
 * Agrega el ejemplar a la selección, o lleva a la reserva si ya está.
 *
 * La selección se guarda en el navegador, así que el visitante puede seguir
 * recorriendo el catálogo y juntar varios libros antes de dar sus datos.
 */
function AccionReservar({ libro }: { libro: LibroPublico }) {
	const seleccion = useSeleccion();
	const enLaSeleccion = seleccion.includes(libro.id);

	if (enLaSeleccion) {
		return (
			<div className="ficha__acciones">
				<Link href="/reserva" className="ficha__reservar">
					Ir a mi reserva ({seleccion.length})
				</Link>
				<button type="button" className="ficha__quitar" onClick={() => alternar(libro.id)}>
					Quitar de la reserva
				</button>
			</div>
		);
	}

	return (
		<button type="button" className="ficha__reservar" onClick={() => alternar(libro.id)}>
			Reservar este ejemplar
		</button>
	);
}
