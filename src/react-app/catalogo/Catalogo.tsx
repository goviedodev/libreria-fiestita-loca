import { useEffect, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { Recurso } from "../lib/Recurso";
import {
	aQueryString,
	hayFiltros,
	leerFiltros,
	pedirCatalogo,
	type CatalogoRespuesta,
	type FiltrosCatalogo,
} from "./api";
import { AvisameSiLlega } from "./AvisameSiLlega";
import { Filtros } from "./Filtros";
import { TarjetaLibro } from "./TarjetaLibro";
import "./catalogo.css";

/**
 * Catálogo público.
 *
 * La URL es la única fuente de verdad de la consulta: los filtros la reescriben y
 * la vista se re-consulta a partir de ella. Así, copiar la barra de direcciones y
 * pegarla en WhatsApp reproduce exactamente la misma búsqueda, que es lo que pide
 * la spec.
 */
export function Catalogo() {
	const busquedaUrl = useSearch();

	return (
		<Recurso
			pedir={() => pedirCatalogo(leerFiltros(busquedaUrl))}
			respaldo={<p className="catalogo__cargando">Cargando el catálogo…</p>}
		>
			{(inicial) => <Listado inicial={inicial} />}
		</Recurso>
	);
}

function Listado({ inicial }: { inicial: CatalogoRespuesta }) {
	const busquedaUrl = useSearch();
	const [, navegar] = useLocation();
	const filtros = leerFiltros(busquedaUrl);

	const [datos, setDatos] = useState(inicial);
	const [error, setError] = useState<string | null>(null);

	// La URL manda: cada cambio dispara la consulta. Sincronizar con la barra de
	// direcciones —un sistema externo a React— es justo para lo que sirve un efecto.
	//
	// El estado solo se toca dentro de los callbacks de la promesa. Llamar a
	// setState en el cuerpo del efecto es un error de lint en React 19, y con razón:
	// encadena renders. Por eso no hay un indicador de "cargando" propio; la lista
	// anterior se mantiene hasta que llega la nueva.
	const urlAplicada = useRef(busquedaUrl);
	const peticion = useRef<AbortController | null>(null);

	useEffect(() => {
		if (urlAplicada.current === busquedaUrl) return;
		urlAplicada.current = busquedaUrl;

		peticion.current?.abort();
		const control = new AbortController();
		peticion.current = control;

		pedirCatalogo(leerFiltros(busquedaUrl), control.signal)
			.then((respuesta) => {
				setDatos(respuesta);
				setError(null);
			})
			.catch(() => {
				// Una petición abortada no es un fallo: la reemplazó otra más nueva.
				if (control.signal.aborted) return;
				setError("No pudimos cargar el catálogo. Revisa tu conexión.");
			});

		return () => control.abort();
	}, [busquedaUrl]);

	function aplicar(nuevos: FiltrosCatalogo) {
		navegar(`/${aQueryString(nuevos)}`);
	}

	function irAPagina(pagina: number) {
		aplicar({ ...filtros, pagina: pagina > 1 ? pagina : undefined });
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	const paginas = Math.max(Math.ceil(datos.total / datos.porPagina), 1);
	const paginaActual = filtros.pagina ?? 1;
	const filtrado = hayFiltros(filtros);

	return (
		<section className="catalogo">
			<header className="catalogo__portada">
				<p className="catalogo__antetitulo">Librería en Limache</p>
				<h1 className="catalogo__titulo">Libros que ya vivieron algo</h1>
				<p className="catalogo__entrada">
					Usados y nuevos, un ejemplar de cada uno. Lo que ves acá es lo que hay hoy en la mesa.
				</p>
			</header>

			<Filtros
				filtros={filtros}
				generos={datos.generos}
				total={datos.total}
				hayAlgoQueLimpiar={filtrado}
				alAplicar={aplicar}
			/>

			{error && (
				<p className="catalogo__aviso catalogo__aviso--error" role="alert">
					{error}
				</p>
			)}

			{datos.items.length === 0 ? (
				<Vacio filtrado={filtrado} termino={filtros.q} />
			) : (
				<div className="catalogo__rejilla">
					{datos.items.map((libro) => (
						<TarjetaLibro key={libro.id} libro={libro} />
					))}
				</div>
			)}

			{paginas > 1 && (
				<nav className="catalogo__paginacion" aria-label="Páginas del catálogo">
					<button type="button" disabled={paginaActual <= 1} onClick={() => irAPagina(paginaActual - 1)}>
						← Anterior
					</button>
					<span>
						Página {paginaActual} de {paginas}
					</span>
					<button
						type="button"
						disabled={paginaActual >= paginas}
						onClick={() => irAPagina(paginaActual + 1)}
					>
						Siguiente →
					</button>
				</nav>
			)}
		</section>
	);
}

/**
 * Sin resultados.
 *
 * En vez de dejar al visitante en un callejón sin salida, se le ofrece anotar lo
 * que buscaba: es lo que convierte una búsqueda perdida en una venta futura.
 */
function Vacio({ filtrado, termino }: { filtrado: boolean; termino?: string }) {
	if (!filtrado) {
		return (
			<p className="catalogo__vacio">
				Todavía no hay libros publicados. Vuelve pronto: la mesa se renueva seguido.
			</p>
		);
	}

	return (
		<div className="catalogo__vacio">
			<p>
				No encontramos {termino ? <strong>«{termino}»</strong> : "libros con esos filtros"} en el
				catálogo de hoy.
			</p>
			<p className="catalogo__vacio-ayuda">Prueba con menos filtros, o déjanos tu búsqueda.</p>
			<AvisameSiLlega termino={termino} />
		</div>
	);
}
