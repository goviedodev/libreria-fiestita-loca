import { useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { enviar, obtener } from "../lib/api";
import { Recurso } from "../lib/Recurso";
import { NoEncontrado } from "../ui/NoEncontrado";
import { Ingreso } from "./Ingreso";
import { EditarLibro } from "./inventario/EditarLibro";
import { Ingesta } from "./inventario/Ingesta";
import { Inventario } from "./inventario/Inventario";
import { Alertas } from "./alertas/Alertas";
import { DetallePedido } from "./pedidos/DetallePedido";
import { Pedidos } from "./pedidos/Pedidos";
import { Resumen } from "./pedidos/Resumen";
import { VistaNovedades } from "./novedades/Vista";
import "./backoffice.css";

/**
 * Raíz del backoffice. Se monta bajo /admin y se carga de forma diferida.
 *
 * Esconder estas vistas no es control de acceso — cada endpoint se verifica en el
 * servidor. La comprobación de sesión aquí es solo para no mostrar pantallas que
 * fallarían igual.
 */
export default function Backoffice() {
	return (
		<Recurso
			pedir={() =>
				obtener<{ activa: boolean }>("/api/auth/sesion").catch(() => ({ activa: false }))
			}
			respaldo={<p className="bo__cargando">Cargando…</p>}
		>
			{(sesion) => <Raiz inicial={sesion.activa} />}
		</Recurso>
	);
}

function Raiz({ inicial }: { inicial: boolean }) {
	const [activa, setActiva] = useState(inicial);

	if (!activa) {
		return <Ingreso alEntrar={() => setActiva(true)} />;
	}
	return <Panel alSalir={() => setActiva(false)} />;
}

const SECCIONES = [
	{ ruta: "/", etiqueta: "Resumen" },
	{ ruta: "/ingesta", etiqueta: "Ingresar libro" },
	{ ruta: "/inventario", etiqueta: "Inventario" },
	{ ruta: "/pedidos", etiqueta: "Pedidos" },
	{ ruta: "/alertas", etiqueta: "Avisos" },
	{ ruta: "/novedades", etiqueta: "Novedades" },
] as const;

function Panel({ alSalir }: { alSalir: () => void }) {
	const [ubicacion] = useLocation();

	async function cerrarSesion() {
		try {
			await enviar("/api/auth/salida", {});
		} finally {
			alSalir();
		}
	}

	return (
		<div className="bo">
			<header className="bo__cabecera">
				<div className="bo__marca">
					<span className="bo__marca-nombre">Fiestita Loca</span>
					<span className="bo__marca-rol">Backoffice</span>
				</div>
				<nav className="bo__nav" aria-label="Secciones del backoffice">
					{SECCIONES.map((seccion) => (
						<Link
							key={seccion.ruta}
							href={seccion.ruta}
							aria-current={ubicacion === seccion.ruta ? "page" : undefined}
						>
							{seccion.etiqueta}
						</Link>
					))}
				</nav>
				<button type="button" className="bo__salir" onClick={cerrarSesion}>
					Cerrar sesión
				</button>
			</header>

			<main className="bo__contenido">
				<Switch>
					<Route path="/">
						<Resumen />
					</Route>
					<Route path="/ingesta">
						<Ingesta />
					</Route>
					<Route path="/inventario">
						<Inventario />
					</Route>
					<Route path="/inventario/:id">
						{/* La clave reinicia el estado al pasar de un libro a otro sin
						    desmontar la ruta: sin ella el formulario conservaría los
						    campos del libro anterior. */}
						{(parametros) => <EditarLibro key={parametros.id} id={parametros.id} />}
					</Route>
					<Route path="/pedidos">
						<Pedidos />
					</Route>
					<Route path="/pedidos/:folio">
						{(parametros) => <DetallePedido key={parametros.folio} folio={parametros.folio} />}
					</Route>
					<Route path="/alertas">
						<Alertas />
					</Route>
					<Route path="/novedades">
						<VistaNovedades />
					</Route>
					<Route>
						<NoEncontrado />
					</Route>
				</Switch>
			</main>
		</div>
	);
}
