import { useState } from "react";
import { Link } from "wouter";
import type { Libro } from "../../../shared/libro";
import { formatearPrecio } from "../../../shared/texto";
import { Recurso } from "../../lib/Recurso";
import { listarInventario, type ListadoInventario } from "./api";
import "./inventario.css";

const ETIQUETA_ESTADO: Record<Libro["estado"], string> = {
	disponible: "Disponible",
	reservado: "Reservado",
	vendido: "Vendido",
};

/**
 * Listado del inventario completo, incluidos los dados de baja.
 *
 * La consulta se dispara al enviar el formulario y no en cada tecla: la búsqueda
 * es sobre la base y no vale la pena una petición por pulsación.
 */
export function Inventario() {
	return (
		<Recurso
			pedir={() => listarInventario({})}
			respaldo={<p className="inv__vacio">Cargando inventario…</p>}
		>
			{(inicial) => <Listado inicial={inicial} />}
		</Recurso>
	);
}

function Listado({ inicial }: { inicial: ListadoInventario }) {
	const [busqueda, setBusqueda] = useState("");
	const [condicion, setCondicion] = useState("");
	const [genero, setGenero] = useState("");
	const [pagina, setPagina] = useState(1);

	// La primera página llega ya resuelta desde <Recurso>: pedirla desde un efecto
	// sería un setState síncrono dentro del efecto, que el lint de React 19 marca
	// como error.
	const [datos, setDatos] = useState(inicial);
	const [cargando, setCargando] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function consultar(nuevaPagina = pagina) {
		setCargando(true);
		setError(null);
		try {
			setDatos(await listarInventario({ busqueda, condicion, genero, pagina: nuevaPagina }));
			setPagina(nuevaPagina);
		} catch {
			setError("No pudimos cargar el inventario.");
		} finally {
			setCargando(false);
		}
	}

	const paginas = Math.max(Math.ceil(datos.total / datos.porPagina), 1);

	return (
		<section className="inv">
			<header className="inv__cabecera">
				<div>
					<h1>Inventario</h1>
					<p className="inv__bajada">
						{`${datos.total} ${datos.total === 1 ? "libro" : "libros"}`}
					</p>
				</div>
				<Link href="/ingesta" className="inv__primario inv__primario--enlace">
					Ingresar libro
				</Link>
			</header>

			<form
				className="inv__filtros"
				onSubmit={(e) => {
					e.preventDefault();
					void consultar(1);
				}}
			>
				<input
					type="search"
					value={busqueda}
					placeholder="Título, autor o ISBN"
					onChange={(e) => setBusqueda(e.target.value)}
					aria-label="Buscar en el inventario"
				/>
				<select
					value={condicion}
					onChange={(e) => setCondicion(e.target.value)}
					aria-label="Condición"
				>
					<option value="">Toda condición</option>
					<option value="nuevo">Nuevo</option>
					<option value="usado">Usado</option>
				</select>
				<select value={genero} onChange={(e) => setGenero(e.target.value)} aria-label="Género">
					<option value="">Todo género</option>
					{datos.generos.map((nombre) => (
						<option key={nombre} value={nombre}>
							{nombre}
						</option>
					))}
				</select>
				<button type="submit" className="inv__primario" disabled={cargando}>
					{cargando ? "Buscando…" : "Filtrar"}
				</button>
			</form>

			{error && (
				<p className="inv__aviso inv__aviso--error" role="alert">
					{error}
				</p>
			)}

			{datos.items.length === 0 && (
				<p className="inv__vacio">No hay libros que coincidan con esa búsqueda.</p>
			)}

			<ul className="inv__lista">
				{datos.items.map((libro) => (
					<li key={libro.id} className={libro.dadoDeBaja ? "inv__fila inv__fila--baja" : "inv__fila"}>
						<Link href={`/inventario/${libro.id}`} className="inv__fila-enlace">
							{libro.imagenUrl ? (
								<img className="inv__miniatura" src={libro.imagenUrl} alt="" loading="lazy" />
							) : (
								<span className="inv__miniatura inv__miniatura--vacia" aria-hidden="true">
									◲
								</span>
							)}
							<span className="inv__fila-datos">
								<strong className="inv__fila-titulo">{libro.titulo}</strong>
								<span className="inv__fila-autor">{libro.autor}</span>
							</span>
							<span className="inv__fila-meta">
								<span className={`inv__pastilla inv__pastilla--${libro.estado}`}>
									{libro.dadoDeBaja ? "Dado de baja" : ETIQUETA_ESTADO[libro.estado]}
								</span>
								<span className="inv__fila-precio">{formatearPrecio(libro.precio)}</span>
							</span>
						</Link>
					</li>
				))}
			</ul>

			{paginas > 1 && (
				<nav className="inv__paginacion" aria-label="Páginas del inventario">
					<button
						type="button"
						className="inv__texto-boton"
						disabled={pagina <= 1 || cargando}
						onClick={() => void consultar(pagina - 1)}
					>
						Anterior
					</button>
					<span>
						Página {pagina} de {paginas}
					</span>
					<button
						type="button"
						className="inv__texto-boton"
						disabled={pagina >= paginas || cargando}
						onClick={() => void consultar(pagina + 1)}
					>
						Siguiente
					</button>
				</nav>
			)}
		</section>
	);
}
