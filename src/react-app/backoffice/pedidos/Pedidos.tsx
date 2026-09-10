import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ESTADOS_RESERVA, type ResumenReserva } from "../../../shared/reserva";
import { formatearTelefono } from "../../../shared/telefono";
import { formatearPrecio } from "../../../shared/texto";
import { Recurso } from "../../lib/Recurso";
import { ETIQUETA_ESTADO, listarPedidos } from "./api";
import "./pedidos.css";

/**
 * Listado de pedidos.
 *
 * Las pendientes con más de 7 días vienen marcadas desde el servidor y se
 * destacan: son las que el dueño tiene que cerrar o liberar, y perderlas de vista
 * significa un ejemplar bloqueado sin cobrar.
 */
export function Pedidos() {
	return (
		<Recurso
			pedir={() => listarPedidos({})}
			respaldo={<p className="ped__cargando">Cargando pedidos…</p>}
		>
			{(inicial) => <Listado inicial={inicial.reservas} />}
		</Recurso>
	);
}

function Listado({ inicial }: { inicial: readonly ResumenReserva[] }) {
	const [reservas, setReservas] = useState(inicial);
	const [estado, setEstado] = useState("");
	const [busqueda, setBusqueda] = useState("");
	const [cargando, setCargando] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function consultar(filtros: { estado?: string; busqueda?: string }) {
		setCargando(true);
		setError(null);
		try {
			const { reservas: nuevas } = await listarPedidos(filtros);
			setReservas(nuevas);
		} catch {
			setError("No pudimos cargar los pedidos.");
		} finally {
			setCargando(false);
		}
	}

	function buscar(evento: FormEvent) {
		evento.preventDefault();
		void consultar({ estado: estado || undefined, busqueda: busqueda.trim() || undefined });
	}

	function filtrarPorEstado(nuevo: string) {
		setEstado(nuevo);
		void consultar({ estado: nuevo || undefined, busqueda: busqueda.trim() || undefined });
	}

	const pendientesAntiguas = reservas.filter((r) => r.antigua).length;

	return (
		<section className="ped">
			<header className="ped__cabecera">
				<div>
					<h1>Pedidos</h1>
					<p className="ped__bajada">
						{reservas.length} {reservas.length === 1 ? "reserva" : "reservas"}
						{pendientesAntiguas > 0 && (
							<>
								{" · "}
								<strong className="ped__alerta">
									{pendientesAntiguas} {pendientesAntiguas === 1 ? "lleva" : "llevan"} más de 7 días
									sin pagar
								</strong>
							</>
						)}
					</p>
				</div>
			</header>

			<form className="ped__filtros" onSubmit={buscar}>
				<input
					type="search"
					value={busqueda}
					placeholder="Folio, nombre o teléfono"
					aria-label="Buscar pedidos"
					onChange={(e) => setBusqueda(e.target.value)}
				/>
				<button type="submit" className="ped__primario" disabled={cargando}>
					{cargando ? "Buscando…" : "Buscar"}
				</button>
			</form>

			<div className="ped__pestanas" role="tablist" aria-label="Filtrar por estado">
				<Pestana valor="" actual={estado} alElegir={filtrarPorEstado}>
					Todas
				</Pestana>
				{ESTADOS_RESERVA.map((posible) => (
					<Pestana key={posible} valor={posible} actual={estado} alElegir={filtrarPorEstado}>
						{ETIQUETA_ESTADO[posible]}
					</Pestana>
				))}
			</div>

			{error && (
				<p className="ped__aviso ped__aviso--error" role="alert">
					{error}
				</p>
			)}

			{reservas.length === 0 ? (
				<p className="ped__vacio">No hay pedidos que coincidan.</p>
			) : (
				<ul className="ped__lista">
					{reservas.map((reserva) => (
						<li key={reserva.folio} className={reserva.antigua ? "ped__fila ped__fila--antigua" : "ped__fila"}>
							<Link href={`/pedidos/${reserva.folio}`} className="ped__fila-enlace">
								<span className="ped__folio">{reserva.folio}</span>
								<span className="ped__cliente">
									<strong>{reserva.nombre}</strong>
									<span>{formatearTelefono(reserva.telefono)}</span>
								</span>
								<span className="ped__meta">
									<span className={`ped__pastilla ped__pastilla--${reserva.estado}`}>
										{ETIQUETA_ESTADO[reserva.estado]}
									</span>
									{reserva.antigua && (
										<span className="ped__pastilla ped__pastilla--alerta" title="Pendiente hace más de 7 días">
											+7 días
										</span>
									)}
								</span>
								<span className="ped__libros">
									{reserva.libros} {reserva.libros === 1 ? "libro" : "libros"}
								</span>
								<span className="ped__total">{formatearPrecio(reserva.total)}</span>
								<span className="ped__fecha">
									{new Date(reserva.creadoEn).toLocaleDateString("es-CL")}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function Pestana({
	valor,
	actual,
	alElegir,
	children,
}: {
	valor: string;
	actual: string;
	alElegir: (valor: string) => void;
	children: React.ReactNode;
}) {
	const activa = valor === actual;
	return (
		<button
			type="button"
			role="tab"
			aria-selected={activa}
			className={activa ? "ped__pestana ped__pestana--activa" : "ped__pestana"}
			onClick={() => alElegir(valor)}
		>
			{children}
		</button>
	);
}
