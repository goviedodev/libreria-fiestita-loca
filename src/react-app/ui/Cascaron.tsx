import type { ReactNode } from "react";
import { Link, useRoute } from "wouter";
import { useSeleccion } from "../reserva/useSeleccion";
import "./cascaron.css";

/** Marco común de las vistas públicas: cabecera, contenido y pie. */
export function Cascaron({ children }: { children: ReactNode }) {
	const [enCatalogo] = useRoute("/");
	const seleccion = useSeleccion();

	return (
		<div className="cascaron">
			<header className="cascaron__cabecera">
				<div className="cascaron__interior">
					<Link href="/" className="marca" aria-label="Fiestita Loca, ir al catálogo">
						<span className="marca__nombre">Fiestita Loca</span>
						<span className="marca__bajada">Librería · Limache</span>
					</Link>
					<nav aria-label="Navegación principal" className="cascaron__nav">
						<Link href="/" aria-current={enCatalogo ? "page" : undefined}>
							Catálogo
						</Link>
						<Link href="/reserva">
							Mi reserva
							{seleccion.length > 0 && (
								<span className="cascaron__contador" aria-label={`${seleccion.length} libros seleccionados`}>
									{seleccion.length}
								</span>
							)}
						</Link>
					</nav>
				</div>
			</header>

			<main className="cascaron__contenido">{children}</main>

			<footer className="cascaron__pie">
				<div className="cascaron__interior">
					<p>Fiestita Loca · Libros usados y nuevos · Limache, Región de Valparaíso</p>
				</div>
			</footer>
		</div>
	);
}
