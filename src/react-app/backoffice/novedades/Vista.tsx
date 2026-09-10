import { useState } from "react";
import type { Libro } from "../../../shared/libro";
import { formatearPrecio } from "../../../shared/texto";
import { Recurso } from "../../lib/Recurso";
import { listarNovedades, type Novedades } from "./api";
import { Previsualizacion } from "./Previsualizacion";
import { copiarAlPortapapeles, descargarPieza, descargarTanda, textoDePublicacion } from "./publicacion";
import "./novedades.css";

/**
 * Novedades para Instagram.
 *
 * El dueño elige qué libros entran y en qué orden, y se lleva las piezas y el
 * texto. Todo el trabajo pesado —dibujar los 1080×1920— ocurre en su navegador.
 */
export function VistaNovedades() {
	return (
		<Recurso
			pedir={() => listarNovedades({})}
			respaldo={<p className="nov__cargando">Buscando las novedades…</p>}
		>
			{(inicial) => <Panel inicial={inicial} />}
		</Recurso>
	);
}

function Panel({ inicial }: { inicial: Novedades }) {
	const [datos, setDatos] = useState(inicial);
	const [desde, setDesde] = useState(inicial.desde);
	const [hasta, setHasta] = useState(inicial.hasta);
	const [cargando, setCargando] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// El orden de la selección es el de la publicación: se guarda como lista de
	// ids, no como conjunto, porque la posición importa.
	const [orden, setOrden] = useState<readonly string[]>(() => inicial.libros.map((l) => l.id));

	const [texto, setTexto] = useState(() =>
		textoDePublicacion(inicial.libros, window.location.origin),
	);
	const [textoTocado, setTextoTocado] = useState(false);
	const [copiado, setCopiado] = useState(false);
	const [progreso, setProgreso] = useState<string | null>(null);

	const porId = new Map(datos.libros.map((libro) => [libro.id, libro]));
	const elegidos = orden
		.map((id) => porId.get(id))
		.filter((libro): libro is Libro => libro !== undefined);

	/** Regenera el texto salvo que el dueño ya lo haya editado. */
	function refrescarTexto(libros: readonly Libro[]) {
		if (!textoTocado) {
			setTexto(textoDePublicacion(libros, window.location.origin));
		}
	}

	async function consultarRango() {
		setCargando(true);
		setError(null);
		try {
			const nuevos = await listarNovedades({ desde, hasta });
			setDatos(nuevos);
			setOrden(nuevos.libros.map((l) => l.id));
			refrescarTexto(nuevos.libros);
		} catch {
			setError("No pudimos cargar las novedades.");
		} finally {
			setCargando(false);
		}
	}

	function alternar(id: string) {
		const nuevo = orden.includes(id) ? orden.filter((otro) => otro !== id) : [...orden, id];
		setOrden(nuevo);
		refrescarTexto(nuevo.map((i) => porId.get(i)).filter((l): l is Libro => l !== undefined));
	}

	function mover(id: string, direccion: -1 | 1) {
		const indice = orden.indexOf(id);
		const destino = indice + direccion;
		if (indice < 0 || destino < 0 || destino >= orden.length) return;

		const nuevo = [...orden];
		[nuevo[indice], nuevo[destino]] = [nuevo[destino], nuevo[indice]];
		setOrden(nuevo);
		refrescarTexto(nuevo.map((i) => porId.get(i)).filter((l): l is Libro => l !== undefined));
	}

	async function copiar() {
		setCopiado(await copiarAlPortapapeles(texto));
		if (!copiado) setTimeout(() => setCopiado(false), 2500);
	}

	async function bajarTanda() {
		setError(null);
		setProgreso(`0 de ${elegidos.length}`);
		try {
			await descargarTanda(elegidos, (hechas, total) => setProgreso(`${hechas} de ${total}`));
		} catch (causa) {
			setError(
				causa instanceof Error ? causa.message : "No pudimos generar alguna de las piezas.",
			);
		} finally {
			setProgreso(null);
		}
	}

	return (
		<section className="nov">
			<header className="nov__cabecera">
				<div>
					<h1>Novedades</h1>
					<p className="nov__bajada">
						Arma las piezas y el texto de la semana. Todo se genera acá, en tu navegador.
					</p>
				</div>
			</header>

			<form
				className="nov__rango"
				onSubmit={(e) => {
					e.preventDefault();
					void consultarRango();
				}}
			>
				<label className="nov__campo">
					<span className="nov__etiqueta">Desde</span>
					<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
				</label>
				<label className="nov__campo">
					<span className="nov__etiqueta">Hasta</span>
					<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
				</label>
				<button type="submit" className="nov__primario" disabled={cargando}>
					{cargando ? "Buscando…" : "Aplicar"}
				</button>
			</form>

			{error && (
				<p className="nov__aviso nov__aviso--error" role="alert">
					{error}
				</p>
			)}

			{datos.libros.length === 0 ? (
				<p className="nov__vacio">No ingresaste libros en ese período. Prueba con un rango más amplio.</p>
			) : (
				<>
					<div className="nov__columnas">
						<div className="nov__seleccion">
							<h2 className="nov__subtitulo">
								Libros del período ({elegidos.length} de {datos.libros.length} elegidos)
							</h2>
							<ul className="nov__lista">
								{datos.libros.map((libro) => {
									const posicion = orden.indexOf(libro.id);
									const elegido = posicion >= 0;
									return (
										<li key={libro.id} className={elegido ? "nov__item nov__item--elegido" : "nov__item"}>
											<label className="nov__marca">
												<input
													type="checkbox"
													checked={elegido}
													onChange={() => alternar(libro.id)}
												/>
												<span className="nov__orden">{elegido ? posicion + 1 : "—"}</span>
											</label>

											{libro.imagenUrl ? (
												<img className="nov__miniatura" src={libro.imagenUrl} alt="" loading="lazy" />
											) : (
												<span className="nov__miniatura nov__miniatura--vacia" aria-hidden="true">
													FL
												</span>
											)}

											<span className="nov__datos">
												<strong className="nov__titulo">{libro.titulo}</strong>
												<span className="nov__autor">{libro.autor}</span>
												<span className="nov__precio">{formatearPrecio(libro.precio)}</span>
											</span>

											{elegido && (
												<span className="nov__mover">
													<button
														type="button"
														aria-label={`Subir ${libro.titulo}`}
														disabled={posicion === 0}
														onClick={() => mover(libro.id, -1)}
													>
														↑
													</button>
													<button
														type="button"
														aria-label={`Bajar ${libro.titulo}`}
														disabled={posicion === orden.length - 1}
														onClick={() => mover(libro.id, 1)}
													>
														↓
													</button>
												</span>
											)}

											<button
												type="button"
												className="nov__texto-boton"
												onClick={() => void descargarPieza(libro, Math.max(posicion, 0))}
											>
												Descargar
											</button>
										</li>
									);
								})}
							</ul>
						</div>

						<Previsualizacion libros={elegidos} />
					</div>

					<div className="nov__acciones">
						<button
							type="button"
							className="nov__primario"
							disabled={elegidos.length === 0 || progreso !== null}
							onClick={() => void bajarTanda()}
						>
							{progreso
								? `Generando ${progreso}…`
								: `Descargar ${elegidos.length} ${elegidos.length === 1 ? "pieza" : "piezas"}`}
						</button>
					</div>

					<div className="nov__publicacion">
						<h2 className="nov__subtitulo">Texto de la publicación</h2>
						<p className="nov__ayuda">
							Edítalo si quieres; lo que copies es lo que esté escrito acá.
						</p>
						<textarea
							className="nov__texto"
							rows={12}
							value={texto}
							onChange={(e) => {
								setTexto(e.target.value);
								setTextoTocado(true);
								setCopiado(false);
							}}
						/>
						<div className="nov__acciones">
							<button type="button" className="nov__primario" onClick={() => void copiar()}>
								{copiado ? "¡Copiado!" : "Copiar texto"}
							</button>
							{textoTocado && (
								<button
									type="button"
									className="nov__texto-boton"
									onClick={() => {
										setTexto(textoDePublicacion(elegidos, window.location.origin));
										setTextoTocado(false);
										setCopiado(false);
									}}
								>
									Volver al texto original
								</button>
							)}
						</div>
					</div>
				</>
			)}
		</section>
	);
}
