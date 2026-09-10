import { useState } from "react";
import { Link } from "wouter";
import type { EstadoSolicitud } from "../../../shared/solicitud";
import { formatearTelefono } from "../../../shared/telefono";
import { ErrorRespuesta } from "../../lib/api";
import { Recurso } from "../../lib/Recurso";
import { cambiarEstadoSolicitud, listarAvisos, type AvisoPendiente } from "./api";
import "./alertas.css";

const PESTANAS: readonly { estado: EstadoSolicitud; etiqueta: string }[] = [
	{ estado: "abierta", etiqueta: "Pendientes" },
	{ estado: "avisada", etiqueta: "Avisadas" },
	{ estado: "cerrada", etiqueta: "Cerradas" },
];

/**
 * Avisos: qué pidió la gente que no estaba, y qué de eso ya llegó.
 *
 * Nada se manda solo. Cada aviso es un enlace que el dueño abre a mano, con el
 * mensaje escrito pero sin enviar (spec de `alertas-busqueda`).
 */
export function Alertas() {
	return (
		<Recurso
			pedir={() => listarAvisos("abierta")}
			respaldo={<p className="ale__cargando">Cargando avisos…</p>}
		>
			{(inicial) => <Panel inicial={inicial.avisos} />}
		</Recurso>
	);
}

function Panel({ inicial }: { inicial: readonly AvisoPendiente[] }) {
	const [avisos, setAvisos] = useState(inicial);
	const [pestana, setPestana] = useState<EstadoSolicitud>("abierta");
	const [cargando, setCargando] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function cambiarPestana(estado: EstadoSolicitud) {
		setPestana(estado);
		setCargando(true);
		setError(null);
		try {
			const { avisos: nuevos } = await listarAvisos(estado);
			setAvisos(nuevos);
		} catch {
			setError("No pudimos cargar los avisos.");
		} finally {
			setCargando(false);
		}
	}

	async function marcar(id: string, estado: EstadoSolicitud) {
		setError(null);
		try {
			await cambiarEstadoSolicitud(id, estado);
			// La solicitud sale de la pestaña actual: se quita de la lista en vez de
			// volver a pedir todo.
			setAvisos((previos) => previos.filter((aviso) => aviso.solicitud.id !== id));
		} catch (causa) {
			setError(causa instanceof ErrorRespuesta ? causa.message : "No pudimos actualizar el aviso.");
		}
	}

	const conCoincidencias = avisos.filter((aviso) => aviso.coincidencias.length > 0);
	const sinCoincidencias = avisos.filter((aviso) => aviso.coincidencias.length === 0);

	return (
		<section className="ale">
			<header className="ale__cabecera">
				<div>
					<h1>Avisos</h1>
					<p className="ale__bajada">
						Lo que la gente buscó y no estaba. Cuando llega, aparece aquí para que le escribas.
					</p>
				</div>
			</header>

			<div className="ale__pestanas" role="tablist" aria-label="Estado de las solicitudes">
				{PESTANAS.map((opcion) => (
					<button
						key={opcion.estado}
						type="button"
						role="tab"
						aria-selected={pestana === opcion.estado}
						className={pestana === opcion.estado ? "ale__pestana ale__pestana--activa" : "ale__pestana"}
						onClick={() => void cambiarPestana(opcion.estado)}
					>
						{opcion.etiqueta}
					</button>
				))}
			</div>

			{error && (
				<p className="ale__aviso ale__aviso--error" role="alert">
					{error}
				</p>
			)}

			{cargando && <p className="ale__cargando">Cargando…</p>}

			{!cargando && avisos.length === 0 && (
				<p className="ale__vacio">
					{pestana === "abierta"
						? "Nadie tiene pedidos anotados por ahora."
						: "No hay solicitudes en este estado."}
				</p>
			)}

			{conCoincidencias.length > 0 && (
				<>
					<h2 className="ale__subtitulo">
						Llegaron ({conCoincidencias.length})
					</h2>
					<ul className="ale__lista">
						{conCoincidencias.map((aviso) => (
							<Tarjeta key={aviso.solicitud.id} aviso={aviso} alMarcar={marcar} />
						))}
					</ul>
				</>
			)}

			{sinCoincidencias.length > 0 && (
				<>
					<h2 className="ale__subtitulo">Todavía esperando ({sinCoincidencias.length})</h2>
					<ul className="ale__lista">
						{sinCoincidencias.map((aviso) => (
							<Tarjeta key={aviso.solicitud.id} aviso={aviso} alMarcar={marcar} />
						))}
					</ul>
				</>
			)}
		</section>
	);
}

function Tarjeta({
	aviso,
	alMarcar,
}: {
	aviso: AvisoPendiente;
	alMarcar: (id: string, estado: EstadoSolicitud) => void | Promise<void>;
}) {
	const { solicitud, coincidencias } = aviso;
	const pedido = solicitud.titulo ?? solicitud.autor ?? "";

	return (
		<li className={coincidencias.length > 0 ? "ale__tarjeta ale__tarjeta--lista" : "ale__tarjeta"}>
			<div className="ale__pedido">
				<p className="ale__buscaba">
					Buscaba <strong>«{pedido}»</strong>
				</p>
				<p className="ale__cliente">
					<a href={`tel:+${solicitud.telefono}`}>{formatearTelefono(solicitud.telefono)}</a>
					<span className="ale__fecha">
						{new Date(solicitud.creadoEn).toLocaleDateString("es-CL")}
					</span>
				</p>
			</div>

			{coincidencias.length > 0 ? (
				<ul className="ale__coincidencias">
					{coincidencias.map((coincidencia) => (
						<li key={coincidencia.libroId} className="ale__coincidencia">
							{coincidencia.imagenUrl ? (
								<img className="ale__miniatura" src={coincidencia.imagenUrl} alt="" loading="lazy" />
							) : (
								<span className="ale__miniatura ale__miniatura--vacia" aria-hidden="true">
									FL
								</span>
							)}
							<span className="ale__coincidencia-datos">
								<Link href={`/inventario/${coincidencia.libroId}`} className="ale__coincidencia-titulo">
									{coincidencia.titulo}
								</Link>
								<span className="ale__coincidencia-autor">{coincidencia.autor}</span>
								{coincidencia.estado !== "disponible" && (
									<span className="ale__ya-no">Este ejemplar ya está {coincidencia.estado}</span>
								)}
							</span>
							<a className="ale__whatsapp" href={coincidencia.aviso} target="_blank" rel="noreferrer">
								Avisarle
							</a>
						</li>
					))}
				</ul>
			) : (
				<p className="ale__esperando">Todavía no llega nada que coincida.</p>
			)}

			{solicitud.estado === "abierta" && (
				<div className="ale__acciones">
					{coincidencias.length > 0 && (
						<button
							type="button"
							className="ale__texto-boton"
							onClick={() => void alMarcar(solicitud.id, "avisada")}
						>
							Marcar como avisada
						</button>
					)}
					<button
						type="button"
						className="ale__texto-boton ale__texto-boton--tenue"
						onClick={() => void alMarcar(solicitud.id, "cerrada")}
					>
						Cerrar solicitud
					</button>
				</div>
			)}
		</li>
	);
}
