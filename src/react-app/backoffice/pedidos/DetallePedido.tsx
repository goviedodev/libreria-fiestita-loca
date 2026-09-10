import { useState } from "react";
import { Link } from "wouter";
import type { EstadoReserva } from "../../../shared/reserva";
import { formatearTelefono } from "../../../shared/telefono";
import { formatearPrecio } from "../../../shared/texto";
import { ErrorRespuesta } from "../../lib/api";
import { Recurso } from "../../lib/Recurso";
import { ACCIONES, cambiarEstado, ETIQUETA_ESTADO, obtenerPedido, type DetallePedido as Detalle } from "./api";
import "./pedidos.css";

/**
 * Detalle de una reserva con sus acciones de estado.
 *
 * Solo se ofrecen las transiciones que el estado actual admite: el servidor las
 * valida igual, pero mostrar un botón que va a fallar es hacerle perder el tiempo
 * al dueño.
 */
export function DetallePedido({ folio }: { folio: string }) {
	return (
		<Recurso
			key={folio}
			pedir={() =>
				obtenerPedido(folio).catch((causa: unknown) => {
					if (causa instanceof ErrorRespuesta && causa.estado === 404) return null;
					throw causa;
				})
			}
			respaldo={<p className="ped__cargando">Cargando la reserva…</p>}
		>
			{(datos) => (datos ? <Contenido inicial={datos} /> : <NoEncontrada folio={folio} />)}
		</Recurso>
	);
}

function NoEncontrada({ folio }: { folio: string }) {
	return (
		<section className="ped">
			<h1>No encontramos la reserva {folio}</h1>
			<p className="ped__bajada">Revisa el folio o vuelve al listado.</p>
			<Link href="/pedidos" className="ped__texto-boton">
				Volver a pedidos
			</Link>
		</section>
	);
}

function Contenido({ inicial }: { inicial: Detalle }) {
	const [datos, setDatos] = useState(inicial);
	const [aplicando, setAplicando] = useState<EstadoReserva | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmando, setConfirmando] = useState<EstadoReserva | null>(null);

	const { reserva, historial, contacto } = datos;
	const acciones = ACCIONES[reserva.estado];

	async function aplicar(estado: EstadoReserva) {
		setAplicando(estado);
		setError(null);
		try {
			setDatos(await cambiarEstado(reserva.folio, estado));
			setConfirmando(null);
		} catch (causa) {
			setError(
				causa instanceof ErrorRespuesta ? causa.message : "No pudimos cambiar el estado.",
			);
		} finally {
			setAplicando(null);
		}
	}

	return (
		<section className="ped">
			<header className="ped__cabecera">
				<div>
					<p className="ped__antetitulo">Reserva</p>
					<h1 className="ped__folio-titulo">{reserva.folio}</h1>
					<p className="ped__bajada">
						{new Date(reserva.creadoEn).toLocaleDateString("es-CL", {
							day: "numeric",
							month: "long",
							year: "numeric",
						})}
					</p>
				</div>
				<Link href="/pedidos" className="ped__texto-boton">
					Volver a pedidos
				</Link>
			</header>

			<div className="ped__estado-actual">
				<span className={`ped__pastilla ped__pastilla--${reserva.estado}`}>
					{ETIQUETA_ESTADO[reserva.estado]}
				</span>
				{acciones.length === 0 && (
					<span className="ped__ayuda">Esta reserva está cerrada y no admite más cambios.</span>
				)}
			</div>

			{error && (
				<p className="ped__aviso ped__aviso--error" role="alert">
					{error}
				</p>
			)}

			{acciones.length > 0 && (
				<div className="ped__acciones">
					{acciones.map((accion) =>
						confirmando === accion.estado ? (
							<span key={accion.estado} className="ped__confirmar">
								<span>
									{accion.estado === "cancelado"
										? "Los libros vuelven al catálogo. ¿Confirmas?"
										: "¿Confirmas el cambio?"}
								</span>
								<button
									type="button"
									className="ped__primario"
									disabled={aplicando !== null}
									onClick={() => void aplicar(accion.estado)}
								>
									{aplicando === accion.estado ? "Aplicando…" : "Sí, confirmar"}
								</button>
								<button type="button" className="ped__texto-boton" onClick={() => setConfirmando(null)}>
									Cancelar
								</button>
							</span>
						) : (
							<button
								key={accion.estado}
								type="button"
								className={accion.estado === "cancelado" ? "ped__peligro" : "ped__primario"}
								onClick={() => setConfirmando(accion.estado)}
							>
								{accion.etiqueta}
							</button>
						),
					)}
				</div>
			)}

			<div className="ped__columnas">
				<div>
					<h2 className="ped__subtitulo">Cliente</h2>
					<dl className="ped__datos">
						<div>
							<dt>Nombre</dt>
							<dd>{reserva.nombre}</dd>
						</div>
						<div>
							<dt>Teléfono</dt>
							<dd>
								<a href={`tel:+${reserva.telefono}`}>{formatearTelefono(reserva.telefono)}</a>
							</dd>
						</div>
					</dl>
					{reserva.nota && (
						<p className="ped__nota">
							<strong>Nota del cliente:</strong> {reserva.nota}
						</p>
					)}
					<a className="ped__whatsapp" href={contacto} target="_blank" rel="noreferrer">
						Escribirle por WhatsApp
					</a>
				</div>

				<div>
					<h2 className="ped__subtitulo">Historial</h2>
					<ol className="ped__historial">
						{historial.map((evento) => (
							<li key={`${evento.estado}-${evento.creadoEn}`}>
								<span>{ETIQUETA_ESTADO[evento.estado]}</span>
								<span className="ped__historial-fecha">
									{new Date(evento.creadoEn).toLocaleDateString("es-CL")}
								</span>
							</li>
						))}
					</ol>
				</div>
			</div>

			<h2 className="ped__subtitulo">Libros</h2>
			<ul className="ped__libros-lista">
				{reserva.items.map((item) => (
					<li key={item.libro.id} className="ped__libro">
						{item.libro.imagenUrl ? (
							<img className="ped__miniatura" src={item.libro.imagenUrl} alt="" loading="lazy" />
						) : (
							<span className="ped__miniatura ped__miniatura--vacia" aria-hidden="true">
								FL
							</span>
						)}
						<span className="ped__libro-datos">
							<Link href={`/inventario/${item.libro.id}`} className="ped__libro-titulo">
								{item.libro.titulo}
							</Link>
							<span className="ped__libro-autor">{item.libro.autor}</span>
						</span>
						<span className="ped__libro-precio">{formatearPrecio(item.precio)}</span>
					</li>
				))}
			</ul>

			<p className="ped__total-final">
				<span>Total</span>
				<strong>{formatearPrecio(reserva.total)}</strong>
			</p>
		</section>
	);
}
