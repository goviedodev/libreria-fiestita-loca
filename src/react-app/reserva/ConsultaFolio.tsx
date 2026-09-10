import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import type { EstadoReserva } from "../../shared/reserva";
import { formatearPrecio } from "../../shared/texto";
import { ErrorRespuesta } from "../lib/api";
import { Recurso } from "../lib/Recurso";
import { consultarFolio, type ConsultaReserva } from "./api";
import "./reserva.css";

const ETIQUETA_ESTADO: Record<EstadoReserva, string> = {
	pendiente: "Pendiente de pago",
	pagado: "Pagada, lista para retirar",
	entregado: "Entregada",
	cancelado: "Cancelada",
};

const EXPLICACION: Record<EstadoReserva, string> = {
	pendiente: "Tus libros están apartados. Coordina el pago por WhatsApp para asegurarlos.",
	pagado: "Recibimos tu pago. Pasa a buscar tus libros cuando quieras.",
	entregado: "Ya retiraste estos libros. ¡Gracias!",
	cancelado: "Esta reserva se canceló y los libros volvieron al catálogo.",
};

/** Buscador de folio, para quien llega a `/reserva/:folio` o quiere escribirlo. */
export function ConsultaFolio({ folio }: { folio?: string }) {
	if (!folio) {
		return <Buscador />;
	}

	return (
		<Recurso
			key={folio}
			pedir={() =>
				consultarFolio(folio).catch((causa: unknown) => {
					if (causa instanceof ErrorRespuesta && causa.estado === 404) return null;
					throw causa;
				})
			}
			respaldo={<p className="reserva__cargando">Buscando tu reserva…</p>}
		>
			{(datos) => (datos ? <Detalle datos={datos} /> : <NoEncontrada folio={folio} />)}
		</Recurso>
	);
}

function Buscador({ inicial = "" }: { inicial?: string }) {
	const [folio, setFolio] = useState(inicial);
	const [, navegar] = useLocation();

	function buscar(evento: FormEvent) {
		evento.preventDefault();
		const limpio = folio.trim();
		if (limpio) navegar(`/reserva/${encodeURIComponent(limpio)}`);
	}

	return (
		<section className="reserva">
			<h1 className="reserva__titulo">Consultar mi reserva</h1>
			<p className="reserva__entrada">
				Escribe el folio que te dimos al reservar. Tiene la forma <code>FL-XXXXX</code>.
			</p>

			<form className="reserva__buscador" onSubmit={buscar}>
				<label className="reserva__campo">
					<span className="reserva__etiqueta">Folio</span>
					<input
						type="text"
						value={folio}
						placeholder="FL-A2B3C"
						autoCapitalize="characters"
						autoFocus
						onChange={(e) => setFolio(e.target.value)}
					/>
				</label>
				<button type="submit" className="reserva__enviar" disabled={folio.trim().length === 0}>
					Buscar
				</button>
			</form>
		</section>
	);
}

function NoEncontrada({ folio }: { folio: string }) {
	return (
		<section className="reserva">
			<h1 className="reserva__titulo">No encontramos esa reserva</h1>
			<p className="reserva__entrada">
				Revisa el folio <strong>{folio}</strong>: se escribe como <code>FL-XXXXX</code> y no lleva
				ceros ni la letra O.
			</p>
			<Buscador inicial={folio} />
		</section>
	);
}

function Detalle({ datos }: { datos: ConsultaReserva }) {
	const { reserva, historial } = datos;

	return (
		<section className="reserva">
			<p className="reserva__antetitulo">Reserva {reserva.folio}</p>
			<h1 className="reserva__titulo">{ETIQUETA_ESTADO[reserva.estado]}</h1>
			<p className="reserva__entrada">{EXPLICACION[reserva.estado]}</p>

			<dl className="reserva__datos-cliente">
				<div>
					<dt>A nombre de</dt>
					<dd>{reserva.nombre}</dd>
				</div>
				<div>
					<dt>Teléfono</dt>
					<dd>{reserva.telefono}</dd>
				</div>
				<div>
					<dt>Creada</dt>
					<dd>{new Date(reserva.creadoEn).toLocaleDateString("es-CL")}</dd>
				</div>
			</dl>

			<ul className="reserva__lista reserva__lista--resumen">
				{reserva.items.map((item) => (
					<li key={item.libro.id} className="reserva__item">
						{item.libro.imagenUrl ? (
							<img className="reserva__miniatura" src={item.libro.imagenUrl} alt="" loading="lazy" />
						) : (
							<span className="reserva__miniatura reserva__miniatura--vacia" aria-hidden="true">
								FL
							</span>
						)}
						<span className="reserva__item-datos">
							<Link href={`/libro/${item.libro.id}`} className="reserva__item-titulo">
								{item.libro.titulo}
							</Link>
							<span className="reserva__item-autor">{item.libro.autor}</span>
						</span>
						<span className="reserva__item-precio">{formatearPrecio(item.precio)}</span>
					</li>
				))}
			</ul>

			<p className="reserva__total">
				<span>Total</span>
				<strong>{formatearPrecio(reserva.total)}</strong>
			</p>

			{reserva.nota && (
				<p className="reserva__nota">
					<strong>Tu nota:</strong> {reserva.nota}
				</p>
			)}

			{historial.length > 1 && (
				<ol className="reserva__historial">
					{historial.map((evento) => (
						<li key={`${evento.estado}-${evento.creadoEn}`}>
							<span className="reserva__historial-estado">{ETIQUETA_ESTADO[evento.estado]}</span>
							<span className="reserva__historial-fecha">
								{new Date(evento.creadoEn).toLocaleDateString("es-CL")}
							</span>
						</li>
					))}
				</ol>
			)}

			<p className="reserva__pie-enlaces">
				<Link href="/">Volver al catálogo</Link>
			</p>
		</section>
	);
}
