import { Link } from "wouter";
import type { ResumenNegocio } from "../../../shared/reserva";
import { formatearPrecio } from "../../../shared/texto";
import { Recurso } from "../../lib/Recurso";
import { obtenerResumen } from "./api";
import "./pedidos.css";

/** Panel de entrada del backoffice: en qué está el negocio hoy. */
export function Resumen() {
	return (
		<Recurso
			pedir={obtenerResumen}
			respaldo={<p className="ped__cargando">Cargando el resumen…</p>}
		>
			{(datos) => <Panel datos={datos} />}
		</Recurso>
	);
}

function Panel({ datos }: { datos: ResumenNegocio }) {
	const totalLibros = datos.libros.disponibles + datos.libros.reservados + datos.libros.vendidos;
	const sinMovimientos = totalLibros === 0 && datos.reservas.pendiente === 0;

	return (
		<section className="ped">
			<header className="ped__cabecera">
				<div>
					<h1>Resumen</h1>
					<p className="ped__bajada">Cómo va el negocio hoy.</p>
				</div>
			</header>

			{sinMovimientos && (
				<p className="ped__aviso ped__aviso--info">
					Todavía no hay movimientos. <Link href="/ingesta">Ingresa tu primer libro</Link> para
					empezar.
				</p>
			)}

			<div className="ped__destacado">
				<span className="ped__destacado-etiqueta">Pendiente de cobro</span>
				<strong className="ped__destacado-valor">{formatearPrecio(datos.pendienteDeCobro)}</strong>
				<span className="ped__ayuda">
					Reservas pendientes y pagadas que todavía no se entregan.
				</span>
			</div>

			<h2 className="ped__subtitulo">Inventario</h2>
			<div className="ped__tarjetas">
				<Tarjeta etiqueta="Disponibles" valor={datos.libros.disponibles} acento />
				<Tarjeta etiqueta="Reservados" valor={datos.libros.reservados} />
				<Tarjeta etiqueta="Vendidos" valor={datos.libros.vendidos} />
				<Tarjeta etiqueta="Total publicado" valor={totalLibros} />
			</div>

			<h2 className="ped__subtitulo">Reservas</h2>
			<div className="ped__tarjetas">
				<Tarjeta etiqueta="Pendientes" valor={datos.reservas.pendiente} enlace="/pedidos" acento />
				<Tarjeta etiqueta="Pagadas" valor={datos.reservas.pagado} enlace="/pedidos" />
				<Tarjeta etiqueta="Entregadas" valor={datos.reservas.entregado} enlace="/pedidos" />
				<Tarjeta etiqueta="Canceladas" valor={datos.reservas.cancelado} enlace="/pedidos" />
			</div>
		</section>
	);
}

function Tarjeta({
	etiqueta,
	valor,
	enlace,
	acento,
}: {
	etiqueta: string;
	valor: number;
	enlace?: string;
	acento?: boolean;
}) {
	const contenido = (
		<>
			<span className="ped__tarjeta-valor">{valor}</span>
			<span className="ped__tarjeta-etiqueta">{etiqueta}</span>
		</>
	);

	const clase = `ped__tarjeta${acento ? " ped__tarjeta--acento" : ""}`;

	return enlace ? (
		<Link href={enlace} className={`${clase} ped__tarjeta--enlace`}>
			{contenido}
		</Link>
	) : (
		<div className={clase}>{contenido}</div>
	);
}
