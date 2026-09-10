import { useEffect, useRef, useState } from "react";
import type { Libro } from "../../../shared/libro";
import { ALTO, ANCHO, dibujarPieza } from "./pieza";

/**
 * Muestra la pieza del libro que está primero en el orden elegido.
 *
 * Dibuja de verdad el mismo canvas que se descarga, escalado por CSS: lo que el
 * dueño ve es exactamente lo que se va a Instagram, no una maqueta parecida.
 */
export function Previsualizacion({ libros }: { libros: readonly Libro[] }) {
	const contenedor = useRef<HTMLDivElement>(null);
	const [indice, setIndice] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const actual = libros[Math.min(indice, Math.max(libros.length - 1, 0))];

	// Dibujar es trabajo sobre el DOM con una imagen que carga de forma asíncrona:
	// es exactamente el caso para el que sirve un efecto.
	useEffect(() => {
		if (!actual) return;

		let vigente = true;
		dibujarPieza(actual)
			.then((canvas) => {
				if (!vigente || !contenedor.current) return;
				canvas.className = "nov__lienzo";
				contenedor.current.replaceChildren(canvas);
				setError(null);
			})
			.catch(() => {
				if (vigente) setError("No pudimos dibujar la previsualización.");
			});

		return () => {
			vigente = false;
		};
	}, [actual]);

	if (libros.length === 0) {
		return (
			<aside className="nov__previa">
				<h2 className="nov__subtitulo">Previsualización</h2>
				<p className="nov__ayuda">Elige al menos un libro para ver su pieza.</p>
			</aside>
		);
	}

	return (
		<aside className="nov__previa">
			<h2 className="nov__subtitulo">Previsualización</h2>
			<p className="nov__ayuda">
				{ANCHO}×{ALTO}, el formato de una historia.
			</p>

			<div className="nov__marco" ref={contenedor} aria-label={`Pieza de ${actual?.titulo}`} />

			{error && (
				<p className="nov__aviso nov__aviso--error" role="alert">
					{error}
				</p>
			)}

			{libros.length > 1 && (
				<div className="nov__navegacion">
					<button
						type="button"
						disabled={indice <= 0}
						onClick={() => setIndice((previo) => previo - 1)}
					>
						← Anterior
					</button>
					<span>
						{Math.min(indice, libros.length - 1) + 1} de {libros.length}
					</span>
					<button
						type="button"
						disabled={indice >= libros.length - 1}
						onClick={() => setIndice((previo) => previo + 1)}
					>
						Siguiente →
					</button>
				</div>
			)}
		</aside>
	);
}
